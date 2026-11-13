# -*- coding: utf-8 -*-
import json
import logging
from collections import Counter
from marshal import dumps
import os
import pickle
import time
import uuid
from urllib.parse import quote
import werkzeug
import yaml
from flask import jsonify, request
from flask_classful import FlaskView, route
import pymongo
import requests  # type: ignore

from katana.shared_utils.kubernetesTopology import TopologyError, stored_kubeconfig, cluster_snapshot, validate_namespace
from katana.shared_utils import deploymentOperations as operations
from katana.shared_utils.mongoUtils import mongoUtils
from katana.shared_utils.nfvoUtils import osmUtils
from katana.shared_utils.infrastructureUtils import InfrastructureError, ensure_infrastructure, kubernetes_location, set_kubernetes_location

# Logging Parameters
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)


def _find_nfvo(reference):
    """Find an NFVO by its database UUID or public ID."""
    return mongoUtils.get("nfvo", reference) or mongoUtils.find("nfvo", {"id": reference})


def _osm_client(nfvo_id="", ip="", username="", password="", project_id="admin"):
    """Reuse a registered NFVO, including its configured TLS trust policy."""
    nfvo = _find_nfvo(nfvo_id) if nfvo_id else None
    if not nfvo and ip:
        nfvo = mongoUtils.find("nfvo", {"nfvoip": ip})
    if nfvo:
        stored = mongoUtils.find("nfvo_obj", {"id": nfvo["id"]})
        if stored:
            return pickle.loads(stored["obj"])
        return osmUtils.Osm(
            nfvo_id=nfvo["id"],
            ip=nfvo["nfvoip"],
            username=nfvo["nfvousername"],
            password=nfvo["nfvopassword"],
            project_id=nfvo["tenantname"],
            verify=nfvo.get("ca_file") or nfvo.get("tls_verify", True),
        )
    return osmUtils.Osm(
        nfvo_id=nfvo_id,
        ip=ip,
        username=username,
        password=password,
        project_id=project_id,
    )


def _vim_account_id(osm, reference):
    """Resolve an OSM account UUID, account name, or Katana VIM reference."""
    for account in osm.listVims():
        account_id = account.get("_id") or account.get("id")
        if reference in (account_id, account.get("name")):
            return account_id

    vim = None
    for field in ("_id", "id", "name"):
        vim = mongoUtils.find("vim", {field: reference})
        if vim:
            break
    if not vim:
        return None

    link = mongoUtils.find(
        "nfvo_vim_links", {"nfvo_id": osm.nfvo_id, "vim_id": vim["id"]}
    )
    return link.get("osm_vim_account_id") if link else None


def _observe_operation(record):
    nfvo = operations.owner(record, _find_nfvo)
    osm = _osm_client(nfvo_id=nfvo['id'])
    osm.getToken()
    started_at = time.time()
    response = requests.get(
        f"https://{nfvo['nfvoip']}/osm/nslcm/v1/ns_lcm_op_occs",
        params={'nsInstanceId': record['osm_instance_id']},
        headers={'Authorization': f'Bearer {osm.token}'}, verify=osm.verify,
        timeout=(5, 20), allow_redirects=False,
    )
    if response.status_code != 200:
        raise operations.OperationError('OSM status is unavailable; last observation remains unchanged', 502)
    try:
        payload = response.json()
    except ValueError:
        raise operations.OperationError('OSM returned invalid status data', 502)
    return operations.observe(mongoUtils.k8s_operations, record, payload, started_at)


def _new_cluster_identity():
    cluster_id = str(uuid.uuid4())
    return {"_id": cluster_id, "id": cluster_id, "created_at": time.time()}


def _osm_vim_options(vims, clusters):
    """Expose enabled OSM VIMs without returning their credentials."""
    cluster_counts = Counter(
        cluster.get("vim_account") for cluster in clusters if isinstance(cluster, dict)
    )
    options = []
    for vim in vims:
        if not isinstance(vim, dict):
            continue
        account_id = vim.get("_id") or vim.get("id")
        state = (vim.get("_admin") or {}).get("operationalState")
        if not account_id or str(state).upper() != "ENABLED":
            continue
        options.append({
            "id": account_id,
            "name": vim.get("name") or account_id,
            "type": vim.get("vim_type", ""),
            "k8s_cluster_count": cluster_counts[account_id],
        })
    return options


class K8SClusterView(FlaskView):
    route_prefix = "/api/"
    route_base = "/k8s"
    req_fields = ["name", "vim_account", "k8s_version", "credentials"]

    @route('/vim-accounts/<nfvo_id>', methods=['GET'])
    def osm_vim_accounts(self, nfvo_id):
        """Read enabled OSM VIM accounts and their Kubernetes-cluster associations."""
        nfvo = _find_nfvo(nfvo_id)
        if not nfvo:
            return jsonify({"error": f"NFVO with ID {nfvo_id} not found"}), 404
        try:
            osm = _osm_client(nfvo_id=nfvo["id"])
            osm.getToken()
            vims = osm.listVims()
            response = requests.get(
                f"https://{osm.ip}/osm/admin/v1/k8sclusters",
                headers={"Authorization": f"Bearer {osm.token}"},
                verify=osm.verify,
                timeout=max(osm.timeout, osmUtils.OSM_AUTH_TIMEOUT),
            )
            response.raise_for_status()
            clusters = yaml.safe_load(response.text) or []
            if not isinstance(clusters, list):
                raise ValueError("OSM Kubernetes cluster list is invalid")
            return jsonify(_osm_vim_options(vims, clusters)), 200
        except Exception:
            logger.exception("Unable to load active OSM VIM accounts")
            return jsonify({"error": "Unable to load active OSM VIM accounts"}), 502

    def index(self):
        """
        Returns a list of Kubernetes clusters and their details.
        """
        logger.info("Fetching list of Kubernetes clusters")
        try:
            k8s_data = mongoUtils.index("k8sclusters")
            return_data = [
                {
                    "_id": str(cluster["_id"]),
                    "id": cluster.get("id", str(cluster["_id"])),
                    "name": cluster["name"],
                    "nfvo_id": cluster.get("nfvo_id", ""),
                    "vim_account": cluster["vim_account"],
                    "k8s_version": cluster.get("k8s_version", ""),
                    "created_at": cluster["created_at"],
                    "namespace": cluster.get("namespace", "default"),
                    "location": cluster.get("location", ""),
                    "type": cluster.get("type", ""),
                }
                for cluster in k8s_data
            ]
            logger.debug(f"Fetched clusters: {return_data}")
            return jsonify(return_data), 200
        except Exception as e:
            logger.exception("Error fetching Kubernetes clusters")
            return f"Error: {str(e)}", 500

    @route('/<uuid>/topology', methods=['GET'])
    def topology(self, uuid):
        cluster = mongoUtils.get("k8sclusters", uuid) or mongoUtils.find("k8sclusters", {"id": uuid})
        if not cluster:
            return jsonify({"error": "Kubernetes cluster not found"}), 404
        try:
            namespace = validate_namespace(request.args.get('namespace', '*'))
            credentials = stored_kubeconfig(cluster)
            if credentials is None:
                if not cluster.get('osm_id') or not cluster.get('nfvo_id'):
                    raise TopologyError('This registration has no kubeconfig reference. Register cluster credentials before inspecting workloads.', 409)
                osm = _osm_client(nfvo_id=cluster['nfvo_id'])
                osm.getToken()
                response = requests.get(
                    f"https://{osm.ip}/osm/admin/v1/k8sclusters/{quote(str(cluster['osm_id']), safe='')}",
                    headers={"Authorization": f"Bearer {osm.token}"},
                    verify=osm.verify, timeout=(3, 10),
                )
                response.raise_for_status()
                remote = yaml.safe_load(response.text)
                credentials = remote.get('credentials') if isinstance(remote, dict) else None
            return jsonify(cluster_snapshot(cluster, credentials, namespace)), 200
        except TopologyError as error:
            return jsonify({"error": str(error)}), error.status
        except Exception:
            # Upstream errors can contain kubeconfig or bearer tokens; never return their bodies.
            logger.warning("Unable to read Kubernetes topology for registered cluster %s", uuid)
            return jsonify({"error": "Unable to retrieve cluster access details. Check the registered kubeconfig and owning OSM connection."}), 502

    @route('/<uuid>/location', methods=['PATCH'])
    def assign_location(self, uuid):
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or set(data) != {"location"}:
            return jsonify({"error": "Supply a location only"}), 400
        cluster = mongoUtils.get("k8sclusters", uuid) or mongoUtils.find("k8sclusters", {"id": uuid})
        if not cluster:
            return jsonify({"error": "Kubernetes cluster not found"}), 404
        try:
            record = set_kubernetes_location(cluster, data["location"])
        except InfrastructureError as exc:
            return jsonify({"error": str(exc)}), exc.status_code
        return jsonify({"id": record["id"], "location": record["location"],
                        "message": "Kubernetes deployment location saved"}), 200

    def get(self, uuid):
        """
        Returns the details of a specific Kubernetes cluster.
        """
        logger.info(f"Fetching details for Kubernetes cluster: {uuid}")
        try:
            data = mongoUtils.get("k8sclusters", uuid)
            if data:
                logger.debug(f"Cluster details: {data}")
                return dumps(data), 200
            else:
                logger.warning(f"Cluster not found: {uuid}")
                return "Not Found", 404
        except Exception as e:
            logger.exception(f"Error fetching details for cluster {uuid}")
            return f"Error: {str(e)}", 500

    def create_dashboard_for_cluster(self, cluster):
        """
        Create a Grafana dashboard for the deployed Kubernetes cluster.
        'cluster' is the JSON payload received in the POST request.
        """
        try:
            # Load the dashboard JSON template
            template_path = "/katana-grafana/templates/k8sDashboard.json"
            with open(template_path, mode="r") as dashboard_file:
                dashboard_json = json.load(dashboard_file)

            # Update dashboard title and UID based on cluster details
            cluster_uid = cluster["_id"]
            dashboard_title = "Cluster: " + cluster.get("name", "Unnamed Cluster")
            dashboard_json["dashboard"]["uid"] = cluster_uid
            dashboard_json["dashboard"]["title"] = dashboard_title

            # Set a relative time range and auto-refresh interval
            dashboard_json["dashboard"]["time"] = {"from": "now-1h", "to": "now"}
            dashboard_json["dashboard"]["refresh"] = "5s"

            # Optionally add templating variables (for example, a namespace variable)
            dashboard_json["dashboard"]["templating"] = {
                "list": [
                    {
                        "type": "query",
                        "datasource": "katana-prometheus",
                        "name": "namespace",
                        "label": "Namespace",
                        "query": "label_values(kube_pod_info, namespace)",
                        "refresh": 1,
                        "includeAll": False,
                        "multi": False,
                        "current": {
                            "selected": True,
                            "text": cluster.get("namespace", "default"),
                            "value": cluster.get("namespace", "default")
                        },
                        "hide": 0
                    }
                ]
            }

            # Set the overwrite flag and send the dashboard to Grafana via its API.
            dashboard_json["overwrite"] = True
            grafana_url = "http://katana-grafana:3000/api/dashboards/db"
            headers = {"accept": "application/json", "content-type": "application/json"}
            grafana_user = os.getenv("GF_SECURITY_ADMIN_USER", "admin")
            grafana_passwd = os.getenv("GF_SECURITY_ADMIN_PASSWORD", "admin")
            response = requests.post(
                url=grafana_url,
                headers=headers,
                auth=(grafana_user, grafana_passwd),
                data=json.dumps(dashboard_json)
            )
            if response.status_code in [200, 201]:
                logger.info(f"Created Grafana dashboard for cluster {cluster_uid}")
            else:
                logger.error(f"Error creating dashboard for cluster {cluster_uid}: {response.status_code} {response.text}")
        except Exception as e:
            logger.exception(f"Failed to create dashboard for cluster: {e}")

    def post(self):
        """
        Add a new Kubernetes cluster and register it with OSM, or handle a YAML file upload.
        """
        try:
            if request.is_json and request.json.get("id") and request.json.get("location"):
                try:
                    registered, created = ensure_infrastructure(request.json)
                except InfrastructureError as exc:
                    return jsonify({"error": str(exc)}), exc.status_code
                return jsonify(
                    {
                        "message": "Kubernetes cluster registered" if created else "Kubernetes cluster reused",
                        "id": registered["id"],
                    }
                ), 201

            if request.content_type.startswith("multipart/form-data"):
                # Handle file upload
                logger.info("Received a file upload request for Kubernetes credentials.")
                try:
                    if "file" not in request.files:
                        logger.warning("File not found in request payload.")
                        return jsonify({"error": "Missing file in request payload"}), 400

                    creds_file = request.files["file"]
                    creds_name = os.path.basename(creds_file.filename)
                    if not creds_name:
                        logger.warning("Invalid file name received.")
                        return jsonify({"error": "Invalid file name"}), 400

                    creds_dir = "creds"
                    os.makedirs(creds_dir, exist_ok=True)
                    creds_path = os.path.join(creds_dir, creds_name)
                    creds_file.save(creds_path)
                    logger.info(f"Credentials file saved successfully: {creds_path}")
                    return jsonify({"message": f"Credentials '{creds_name}' uploaded successfully."}), 201
                except Exception as e:
                    logger.exception("Error uploading credentials.")
                    return jsonify({"error": f"Error uploading credentials: {str(e)}"}), 500

            elif request.content_type == "application/json":
                # Handle JSON payload for adding a Kubernetes cluster
                try:
                    location_id = kubernetes_location(request.json.get("location"))
                except InfrastructureError as exc:
                    return jsonify({"error": str(exc)}), exc.status_code
                request.json.update(_new_cluster_identity())
                request.json.update({"type": "kubernetes", "location": location_id})
                new_uuid = request.json["_id"]

                logger.info("Adding a new Kubernetes cluster.")
                # Validate required fields
                for field in self.req_fields:
                    if field not in request.json:
                        logger.error(f"Missing required field: {field}")
                        return jsonify({"error": f"Missing required field '{field}'"}), 400

                try:
                    # Authenticate with OSM
                    osm = _osm_client(
                        nfvo_id=request.json.get("nfvo_id", ""),
                        ip=request.json.get("nfvo_ip", ""),
                        username=request.json.get("nfvo_username", ""),
                        password=request.json.get("nfvo_password", ""),
                        project_id=request.json.get("project_id", "admin"),
                    )
                    if not osm.nfvo_id or not mongoUtils.find("nfvo", {"id": osm.nfvo_id}):
                        return jsonify({"error": "Register and select the owning NFVO before registering the cluster"}), 400
                    osm.getToken()

                    vim_reference = request.json["vim_account"]
                    vim_id = _vim_account_id(osm, vim_reference)
                    if not vim_id:
                        return jsonify(
                            {"error": f"VIM account '{vim_reference}' was not found in OSM"}
                        ), 400
                    logger.info(f"VIM '{vim_reference}' resolved to OSM account: {vim_id}")

                    request.json["vim_account"] = vim_id

                    creds_filename = request.json["credentials"]
                    creds_path = os.path.join("creds", creds_filename)
                    if not os.path.exists(creds_path):
                        logger.error(f"Credentials file not found: {creds_filename}")
                        return jsonify({"error": f"Credentials file not found: {creds_filename}"}), 400

                    with open(creds_path, "r") as creds_file:
                        creds_data = yaml.safe_load(creds_file)

                    payload = {
                        "name": request.json["name"],
                        "credentials": creds_data,
                        "vim_account": vim_id,
                        "k8s_version": request.json["k8s_version"],
                        "nets": request.json.get("nets", {}),
                        "namespace": request.json.get("namespace", "default"),
                        "deployment_methods": request.json.get("deployment_methods", {}),
                    }

                    osm_url = f"https://{osm.ip}/osm/admin/v1/k8sclusters"
                    headers = {
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {osm.token}"
                    }
                    response = requests.post(
                        osm_url, headers=headers, json=payload, verify=osm.verify
                    )
                    logger.debug(f"OSM API response: {response.status_code}, {response.text}")

                    if response.status_code in [200, 201, 202]:
                        try:
                            osm_response = yaml.safe_load(response.text)
                            logger.info("Successfully added Kubernetes cluster to OSM.")
                            logger.debug(f"OSM response details: {osm_response}")
                        except yaml.YAMLError:
                            logger.warning("Failed to parse OSM response as YAML. Using raw response.")
                            osm_response = {"raw_response": response.text}

                        try:
                            if isinstance(osm_response, dict):
                                osm_cluster_id = osm_response.get("_id") or osm_response.get("id")
                                if osm_cluster_id:
                                    request.json["osm_id"] = osm_cluster_id

                            record = dict(request.json)
                            record["nfvo_id"] = osm.nfvo_id
                            record["nfvo_ip"] = osm.ip
                            record.pop("nfvo_username", None)
                            record.pop("nfvo_password", None)
                            mongoUtils.add("k8sclusters", record)
                            set_kubernetes_location(record, location_id)
                            logger.info(f"Successfully added Kubernetes cluster: {new_uuid}")

                            # Use request.json directly for dashboard creation.
                            self.create_dashboard_for_cluster(request.json)

                            return jsonify({
                                "message": "Kubernetes cluster added successfully",
                                "id": new_uuid,
                                "nfvo_id": osm.nfvo_id,
                                "vim_account": vim_id,
                                "osm_response": osm_response,
                            }), 201
                        except pymongo.errors.DuplicateKeyError:
                            logger.error(f"Cluster already exists: {request.json['name']}")
                            return jsonify({"error": f"Kubernetes cluster with name {request.json['name']} already exists"}), 400
                    else:
                        logger.error(f"Failed to add cluster to OSM: {response.text}")
                        return jsonify({"error": f"Failed to add Kubernetes cluster to OSM: {response.text}"}), response.status_code

                except Exception as e:
                    logger.exception("Error adding Kubernetes cluster.")
                    return jsonify({"error": str(e)}), 500

            else:
                logger.warning("Unsupported content type.")
                return jsonify({"error": "Unsupported content type. Only JSON and file uploads are allowed."}), 415

        except Exception as e:
            logger.exception("Unexpected error in POST method.")
            return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

    def delete(self, uuid):
        """
        Delete a specific Kubernetes cluster from OSM and the database.
        """
        logger.info(f"Deleting Kubernetes cluster: {uuid}")
        try:
            cluster = mongoUtils.get("k8sclusters", uuid)
            if not cluster:
                logger.warning(f"Cluster not found: {uuid}")
                return f"Error: No such Kubernetes cluster: {uuid}", 404

            nfvo_ip = cluster.get("nfvo_ip")
            nfvo_username = cluster.get("nfvo_username")
            nfvo_password = cluster.get("nfvo_password")
            project_id = cluster.get("project_id", "admin")

            osm = _osm_client(
                nfvo_id=cluster.get("nfvo_id", ""),
                ip=nfvo_ip,
                username=nfvo_username,
                password=nfvo_password,
                project_id=project_id,
            )
            if not osm.ip or not osm.username or not osm.password:
                vim_account = mongoUtils.get("vim_accounts", cluster["vim_account"])
                if not vim_account:
                    logger.error(f"NFVO details not found for Kubernetes cluster: {uuid}")
                    return f"Error: NFVO details not found for Kubernetes cluster: {uuid}", 404

                nfvo_ip = vim_account["nfvo_ip"]
                nfvo_username = vim_account["nfvousername"]
                nfvo_password = vim_account["nfvopassword"]
                project_id = vim_account.get("project_id", "admin")

                osm = _osm_client(
                    ip=nfvo_ip,
                    username=nfvo_username,
                    password=nfvo_password,
                    project_id=project_id,
                )
            osm.getToken()

            osm_cluster_id = cluster.get("osm_id", uuid)
            osm_url = f"https://{osm.ip}/osm/admin/v1/k8sclusters/{osm_cluster_id}"
            headers = {"Authorization": f"Bearer {osm.token}"}
            response = requests.delete(osm_url, headers=headers, verify=osm.verify)
            logger.debug(f"OSM API response: {response.status_code}, {response.text}")

            if response.status_code not in [200, 204]:
                logger.error(f"Failed to delete cluster from OSM: {response.text}")
                return f"Failed to delete Kubernetes cluster from OSM: {response.text}", response.status_code

            mongoUtils.delete("k8sclusters", uuid)
            logger.info(f"Successfully deleted Kubernetes cluster: {uuid}")
            return f"Deleted Kubernetes cluster {uuid}", 200

        except Exception as e:
            logger.exception("Error deleting Kubernetes cluster")
            return f"Error: {str(e)}", 500

    @route('/deploy', methods=['POST'])
    def deploy(self):
        """
        Sends a deployment request to OSM's NSLCM API endpoint.
        """
        logger.info("Received deploy request for Kubernetes.")
        try:
            if not request.is_json:
                logger.warning("Request content type is not JSON.")
                return jsonify({"error": "Invalid content type, JSON expected"}), 400

            data = request.json
            if not isinstance(data, dict):
                return jsonify({"error": "Deployment request must be an object"}), 400

            operation_key = operations.request_id(data)
            collection = mongoUtils.k8s_operations
            previous = operations.existing(collection, operation_key, data)
            if previous:
                return jsonify(operations.public(previous)), 202

            required_fields = ["nsName", "nsdId", "vimAccountId", "nfvo_id"]
            for field in required_fields:
                if not isinstance(data.get(field), str) or not data[field].strip():
                    logger.error(f"Missing required field: {field}")
                    return jsonify({"error": f"Missing required field '{field}'"}), 400

            nfvo = _find_nfvo(data["nfvo_id"])
            if not nfvo:
                logger.error(f"NFVO with ID {data['nfvo_id']} not found.")
                return jsonify({"error": f"NFVO with ID {data['nfvo_id']} not found"}), 404

            osm_ip = nfvo.get("nfvoip")
            osm_username = nfvo.get("nfvousername")
            osm_password = nfvo.get("nfvopassword")
            tenant_name = nfvo.get("tenantname")

            if not osm_ip or not osm_username or not osm_password or not tenant_name:
                logger.error("Incomplete NFVO configuration.")
                return jsonify({"error": "Incomplete NFVO configuration"}), 400

            osm = _osm_client(
                nfvo_id=nfvo["id"],
                ip=osm_ip,
                username=osm_username,
                password=osm_password,
                project_id=tenant_name
            )
            try:
                osm.getToken()
            except Exception as e:
                logger.exception(f"Error obtaining OSM token: {e}")
                return jsonify({"error": "Failed to authenticate with OSM"}), 400

            vim_account_id = _vim_account_id(osm, data["vimAccountId"])
            if not vim_account_id:
                return jsonify(
                    {"error": f"VIM account '{data['vimAccountId']}' was not found in OSM"}
                ), 400

            osm_url = f"https://{osm_ip}/osm/nslcm/v1/ns_instances_content"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {osm.token}"
            }
            osm_payload = {
                "nsName": data["nsName"],
                "nsdId": data["nsdId"],
                "vimAccountId": vim_account_id
            }

            if "nest" in data:
                from katana.shared_utils.nestHelm import deployment_nest_parameters
                nsd = mongoUtils.find("nsd", {"nsd-id": data["nsdId"]})
                if not nsd or nsd.get("nfvo_id") != nfvo["id"] or nsd.get("deployment_runtime") != "kubernetes":
                    return jsonify({"error": "Select a Kubernetes NSD owned by this NFVO"}), 400
                enabled = [value.strip() for value in os.getenv("KATANA_FREE5GC_NEST_NSD_IDS", "").split(",")]
                if data["nsdId"] not in enabled:
                    return jsonify({"error": "This NSD is not enabled for the configurable free5gc chart"}), 400
                clusters = list(mongoUtils.find_all("k8sclusters", {"nfvo_id": nfvo["id"], "vim_account": vim_account_id}))
                try:
                    osm_payload["additionalParamsForVnf"] = deployment_nest_parameters(data["nest"], data["nsdId"], nfvo["id"], clusters)
                except ValueError as exc:
                    return jsonify({"error": str(exc)}), 400
            if data.get("nsDescription"):
                osm_payload["nsDescription"] = data["nsDescription"]
            record, created = operations.claim(collection, operation_key, data, nfvo, vim_account_id)
            if not created:
                return jsonify(operations.public(record)), 202
            try:
                response = requests.post(
                    osm_url, headers=headers, json=osm_payload, verify=osm.verify,
                    timeout=(5, 60), allow_redirects=False,
                )
            except requests.RequestException:
                return jsonify(operations.save_submission(
                    collection, record, submission_state='unknown', phase='unknown')), 202
            if response.status_code not in (200, 201, 202):
                # A server/proxy failure may occur after the operation was accepted.
                rejected = 400 <= response.status_code < 500 and response.status_code not in (408, 409, 429)
                return jsonify(operations.save_submission(
                    collection, record, submission_state='rejected' if rejected else 'unknown',
                    phase='failed' if rejected else 'unknown')), 202
            instance = operations.instance_id(response)
            return jsonify(operations.save_submission(
                collection, record, submission_state='accepted',
                phase='pending' if instance else 'unknown', osm_instance_id=instance)), 202

        except operations.OperationError as exc:
            return jsonify({'error': str(exc)}), exc.status
        except Exception:
            logger.exception("Error submitting Kubernetes deployment")
            return jsonify({'error': 'Submission could not be confirmed. Check the same request_id before retrying.'}), 503

    @route('/operations/<operation_id>', methods=['GET'])
    def get_operation(self, operation_id):
        """Recover a submission by its client-generated durable identity."""
        try:
            collection = mongoUtils.k8s_operations
            record = collection.find_one({'_id': operation_id})
            if not record:
                return jsonify({'error': 'Deployment operation not found'}), 404
            if not record.get('osm_instance_id'):
                return jsonify(operations.public(record)), 200
            return jsonify(_observe_operation(record)), 200
        except operations.OperationError as exc:
            return jsonify({'error': str(exc)}), exc.status
        except requests.RequestException:
            return jsonify({'error': 'OSM status is temporarily unavailable; the deployment may still be running.'}), 502
        except Exception:
            logger.exception('Error reading Kubernetes deployment operation')
            return jsonify({'error': 'Unable to read deployment status'}), 503

    @route('/deploy/<nsInstanceId>', methods=['GET'])
    def get_deployment_status_by_instance(self, nsInstanceId):
        try:
            record = operations.by_instance(mongoUtils.k8s_operations, nsInstanceId,
                                            request.args.get('nfvo_id'))
            return jsonify(_observe_operation(record)), 200
        except operations.OperationError as exc:
            return jsonify({'error': str(exc)}), exc.status
        except requests.RequestException:
            return jsonify({'error': 'OSM status is temporarily unavailable'}), 502
        except Exception:
            logger.exception('Error reading OSM deployment status')
            return jsonify({'error': 'Unable to read deployment status'}), 503

    @route('/deploy/<nsInstanceId>', methods=['DELETE'])
    def delete_deployment(self, nsInstanceId):
        """
        Terminates and deletes a deployment in OSM using the NS Instance ID.
        """
        logger.info(f"Received request to delete deployment with NS Instance ID: {nsInstanceId}")
        try:
            record = operations.by_instance(mongoUtils.k8s_operations, nsInstanceId,
                                            request.args.get('nfvo_id'))
            nfvo = operations.owner(record, _find_nfvo)
            if not nfvo:
                logger.error("No NFVO configuration found.")
                return jsonify({"error": "No NFVO configuration found."}), 404

            osm_ip = nfvo.get("nfvoip")
            osm_username = nfvo.get("nfvousername")
            osm_password = nfvo.get("nfvopassword")
            tenant_name = nfvo.get("tenantname")

            if not osm_ip or not osm_username or not osm_password or not tenant_name:
                logger.error("Incomplete NFVO configuration.")
                return jsonify({"error": "Incomplete NFVO configuration"}), 400

            osm = _osm_client(
                nfvo_id=nfvo["id"],
                ip=osm_ip,
                username=osm_username,
                password=osm_password,
                project_id=tenant_name
            )

            try:
                osm.getToken()
            except Exception as e:
                logger.exception(f"Error obtaining OSM token: {e}")
                return jsonify({"error": "Failed to authenticate with OSM"}), 400

            response = requests.delete(
                f"https://{osm_ip}/osm/nslcm/v1/ns_instances_content/{quote(nsInstanceId, safe='')}",
                headers={"Authorization": f"Bearer {osm.token}"}, verify=osm.verify,
                timeout=(5, 60), allow_redirects=False,
            )
            if response.status_code not in (200, 202, 204):
                return jsonify({'error': 'OSM did not confirm acceptance of deletion; inspect the existing instance before retrying.'}), 502
            return jsonify({'message': 'OSM accepted termination/deletion; completion is not verified.',
                            'operation_id': record['_id'], 'nfvo_id': nfvo['id']}), 202

        except operations.OperationError as exc:
            return jsonify({'error': str(exc)}), exc.status
        except requests.RequestException:
            return jsonify({'error': 'Deletion outcome is unknown; inspect the existing instance before retrying.'}), 502

        except Exception:
            logger.exception("Error deleting deployment.")
            return jsonify({"error": "Deletion could not be confirmed; inspect the existing instance before retrying."}), 503
