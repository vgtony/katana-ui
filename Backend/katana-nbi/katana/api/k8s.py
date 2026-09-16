# -*- coding: utf-8 -*-
import json
import logging
from collections import Counter
from marshal import dumps
import os
import pickle
import time
import uuid
import werkzeug
import yaml
from flask import jsonify, request
from flask_classful import FlaskView, route
import pymongo
import requests  # type: ignore

from katana.shared_utils.mongoUtils import mongoUtils
from katana.shared_utils.nfvoUtils import osmUtils
from katana.shared_utils.infrastructureUtils import InfrastructureError, ensure_infrastructure

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
                }
                for cluster in k8s_data
            ]
            logger.debug(f"Fetched clusters: {return_data}")
            return jsonify(return_data), 200
        except Exception as e:
            logger.exception("Error fetching Kubernetes clusters")
            return f"Error: {str(e)}", 500

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
                request.json.update(_new_cluster_identity())
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
            logger.debug(f"Deployment payload received: {data}")

            required_fields = ["nsName", "nsdId", "vimAccountId", "nfvo_id"]
            for field in required_fields:
                if field not in data:
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

            logger.debug(f"Sending payload to OSM: {osm_payload}")
            response = requests.post(
                osm_url, headers=headers, json=osm_payload, verify=osm.verify
            )
            logger.debug(f"OSM API response: {response.status_code}, {response.text}")

            if response.status_code not in [200, 201]:
                logger.error(f"Failed to deploy NS: {response.text}")
                return jsonify({"error": f"Failed to deploy NS: {response.text}"}), response.status_code

            try:
                osm_response = response.json()
            except ValueError:
                logger.warning("Response from OSM is not valid JSON, attempting YAML parsing.")
                try:
                    osm_response = yaml.safe_load(response.text)
                except yaml.YAMLError:
                    logger.error("Failed to parse OSM response as JSON or YAML.")
                    osm_response = {"raw_response": response.text}

            logger.info("Successfully sent deployment request to OSM.")
            return jsonify({"message": "Deployment request sent successfully", "osm_response": osm_response}), 202

        except Exception as e:
            logger.exception("Error sending deployment request to OSM.")
            return jsonify({"error": str(e)}), 500

    @route('/deploy/<nsInstanceId>', methods=['GET'])
    def get_deployment_status_by_instance(self, nsInstanceId):
        """
        Fetches all lifecycle management operations for a given NS Instance ID from OSM.
        """
        logger.info(f"Received request to monitor deployment status for NS Instance ID: {nsInstanceId}")
        try:
            nfvo = mongoUtils.find("nfvo", {"type": "OSM"})
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

            osm_url = f"https://{osm_ip}/osm/nslcm/v1/ns_lcm_op_occs?nsInstanceId={nsInstanceId}"
            headers = {"Authorization": f"Bearer {osm.token}"}
            response = requests.get(osm_url, headers=headers, verify=osm.verify)
            logger.debug(f"OSM API response: {response.status_code}, {response.text}")

            if response.status_code != 200:
                logger.error(f"Failed to fetch deployment status: {response.text}")
                return jsonify({"error": f"Failed to fetch deployment status: {response.text}"}), response.status_code

            try:
                deployment_operations = response.json()
            except ValueError:
                logger.warning("Response from OSM is not valid JSON, attempting YAML parsing.")
                try:
                    import yaml
                    deployment_operations = yaml.safe_load(response.text)
                except yaml.YAMLError:
                    logger.error("Failed to parse deployment status as JSON or YAML.")
                    return jsonify({"error": "Invalid response format from OSM"}), 500

            logger.info(f"Deployment operations retrieved successfully for NS Instance ID: {nsInstanceId}")
            return jsonify({"deployment_operations": deployment_operations}), 200

        except Exception as e:
            logger.exception("Error monitoring deployment status.")
            return jsonify({"error": str(e)}), 500

    @route('/deploy/<nsInstanceId>', methods=['DELETE'])
    def delete_deployment(self, nsInstanceId):
        """
        Terminates and deletes a deployment in OSM using the NS Instance ID.
        """
        logger.info(f"Received request to delete deployment with NS Instance ID: {nsInstanceId}")
        try:
            nfvo = mongoUtils.find("nfvo", {"type": "OSM"})
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

            terminate_url = f"https://{osm_ip}/osm/nslcm/v1/ns_instances/{nsInstanceId}/terminate"
            headers = {
                "Authorization": f"Bearer {osm.token}",
                "Content-Type": "application/json"
            }

            terminate_payload = {"terminationType": "FORCEFUL"}
            logger.debug(f"Sending termination request for NS Instance ID: {nsInstanceId}")
            terminate_response = requests.post(
                terminate_url,
                headers=headers,
                json=terminate_payload,
                verify=osm.verify,
            )
            logger.debug(f"OSM Termination API response: {terminate_response.status_code}, {terminate_response.text}")

            if terminate_response.status_code != 202:
                logger.error(f"Failed to terminate deployment: {terminate_response.text}")
                return jsonify({"error": f"Failed to terminate deployment: {terminate_response.text}"}), terminate_response.status_code

            termination_status_url = f"https://{osm_ip}/osm/nslcm/v1/ns_instances/{nsInstanceId}"
            for attempt in range(10):
                status_response = requests.get(
                    termination_status_url, headers=headers, verify=osm.verify
                )
                if status_response.status_code == 404:
                    logger.info(f"Deployment with NS Instance ID {nsInstanceId} successfully deleted.")
                    return jsonify({"message": f"Deployment with NS Instance ID {nsInstanceId} successfully deleted."}), 200
                logger.debug(f"Termination status attempt {attempt + 1}: {status_response.status_code}, {status_response.text}")
                time.sleep(5)

            logger.error(f"Timeout while waiting for termination of NS Instance ID: {nsInstanceId}")
            return jsonify({"error": "Timeout while waiting for termination"}), 408

        except Exception as e:
            logger.exception("Error deleting deployment.")
            return jsonify({"error": str(e)}), 500
