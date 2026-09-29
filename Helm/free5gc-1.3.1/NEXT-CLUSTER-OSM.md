# Prepare the next Kubernetes cluster for OSM

Use this runbook before deploying Katana's `free5gc-1.3.1` chart through OSM. The repeatable path is: prepare the nodes once, validate one site values file, then let OSM manage the release. Installing the Helm chart does not install Multus, host kernel modules, registry configuration, or the physical network.

This guide is checked against the local chart, not a live cluster. It assumes an existing Linux Kubernetes cluster and the OSM Helm 3 KDU workflow. The installed OSM release, Kubernetes distribution/version, node kernel and image compatibility must be recorded for each site; this repository does not establish a certified Kubernetes version floor. The older [chart README](README.md) contains lab installation notes; the rendered chart and this checklist take precedence for the `1.3.1` defaults below. The [automation proposal](../../docs/AUTOMATED_FREE5GC_OSM_WORKFLOW.md) describes future work, not an implemented cluster bootstrapper.

## 1. Record the site contract

Keep these facts with the cluster handover. Store credentials separately.

| Input | Required decision |
| --- | --- |
| Software | Kubernetes distribution/version, node OS/kernel/architecture, primary CNI, Multus/CNI plugin versions, OSM release, Helm version, chart version and image digests |
| Kubernetes access | API endpoint reachable from OSM, kubeconfig context/expiry, target namespace, deployment permissions |
| Workers | RAN and three UPF role assignments, CPU/memory headroom, taints, NIC names, kernel support |
| Secondary network | Physical NIC or VLAN interface on every eligible node, L2 connectivity, MTU, subnet, reserved pod addresses and N6 gateway |
| Storage | Working StorageClass, capacity, reclaim/backup policy for MongoDB |
| Artifacts | Chart repository reachable from OSM; container registries reachable and trusted by every eligible node |
| Service | PLMN/TAC, SST/SD, DNN, UE pools, subscriber identity/authentication and a reachable data-plane test destination |

For the least configuration work, reproduce one validated site profile. Different NIC names are easy overrides. Different IP plans require updating the SMF's embedded topology too.

## 2. Prepare Multus and the physical network

1. Verify the primary CNI and cluster DNS work first. Multus adds secondary interfaces to that existing pod network. Use the [official Multus quickstart](https://k8snetworkplumbingwg.github.io/multus-cni/docs/quickstart.html) to select a compatible installation, then retain a reviewed manifest with pinned container images for subsequent clusters.
2. Match the installation to the container runtime's actual CNI configuration and binary directories. Conventional kubeadm installations often use `/etc/cni/net.d` and `/opt/cni/bin`; inspect the runtime configuration. K3s/RKE2 and other distributions can use different paths. Align Multus host mounts, its configuration and its delegate plugin search path. See the [Multus configuration reference](https://k8snetworkplumbingwg.github.io/multus-cni/docs/configuration.html).
3. Install the delegate plugins in that binary directory on **every node where an attached pod may run**: `macvlan`, `static`, and `tuning` for the defaults; also `ipvlan` if selecting that mode. Use a pinned, architecture-matching [CNI plugins release](https://github.com/containernetworking/plugins/releases). A running Multus DaemonSet alone does not prove these binaries exist.
4. Review the saved manifest, dry-run it, then install it during cluster preparation. Substitute your file and DaemonSet name below:

```sh
kubectl apply --dry-run=server -f /path/to/reviewed-multus.yaml
kubectl apply -f /path/to/reviewed-multus.yaml
kubectl -n kube-system rollout status daemonset/kube-multus-ds --timeout=180s
kubectl get crd network-attachment-definitions.k8s.cni.cncf.io
```

The chart creates its own namespaced NetworkAttachmentDefinitions (NADs), using `macvlan` in bridge mode plus `static` IPAM and `tuning`. Do not manually create duplicates of those Helm-owned NADs. UERANSIM alone also supports `ueransim.network.existingNad` for a deliberately pre-created attachment.

On every eligible node, check the actual parent NIC and CNI directory. These commands inspect; they do not change the host:

```sh
SITE_NIC=ens18                  # Replace with this node's parent interface.
SITE_CNI_BIN=/opt/cni/bin       # Replace with the runtime's actual directory.
ip -br link show "$SITE_NIC"
ip -4 addr show dev "$SITE_NIC"
ip route
for plugin in macvlan static tuning; do
  test -x "$SITE_CNI_BIN/$plugin" || { echo "Missing CNI plugin: $plugin"; exit 1; }
done
```

The NIC must exist and be up on every eligible node. If it is a VLAN subinterface, provision it persistently before deploying. A single global `masterIf` value cannot represent differently named interfaces across eligible workers; standardize the names or constrain scheduling to compatible nodes. AMF and SMF have no node selector by default, so their possible placement also matters.

For macvlan, the VM bridge/hypervisor/switch must permit the secondary MAC addresses and traffic between workers. Do not infer pod reachability solely from pinging the host's parent interface. Switching to ipvlan changes the network assumptions and requires its own validation; do not mix macvlan and ipvlan on the same parent interface. See the [CNI macvlan requirements](https://www.cni.dev/plugins/current/main/macvlan/).

Reserve addresses outside DHCP and other deployments. These NADs use **static IPAM**, with addresses supplied in pod annotations; there is no cluster-wide address allocator or duplicate detection. `excludeIP` and `subnetIP` values do not create an allocation pool in these templates. See the [static IPAM contract](https://www.cni.dev/plugins/current/ipam/static/).

Before handing over the cluster, exercise a disposable NAD and pod on each eligible worker using reserved test addresses, the same parent NIC, plugin chain and MTU. Verify the pod's `k8s.v1.cni.cncf.io/network-status`, cross-worker secondary-IP reachability, and gateway reachability where required. Remove only those disposable resources afterward. This catches wiring and plugin failures that a dry-run cannot.

## 3. Match the chart's network values

These are the **umbrella chart's effective defaults**, not portable recommendations. All secondary interfaces currently share `10.160.101.0/24`, use parent `eth0`, and the N6 gateway is `10.160.101.1`.

| Endpoint | Default address | Override in the umbrella chart |
| --- | --- | --- |
| AMF N2 | `10.160.101.100` | `global.amf.n2if.ipAddress` |
| SMF N4 | `10.160.101.101` | `global.smf.n4if.ipAddress` |
| gNB N2/N3 | `10.160.101.231` | `ueransim.network.ipAddress` |
| Branching UPF N3/N4/N9/N6 | `.202` / `.203` / `.204` / `.218` | `free5gc-upf.upfb.n3if/n4if/n9if/n6if.ipAddress` |
| Anchor UPF1 N4/N9/N6 | `.205` / `.206` / `.207` | `free5gc-upf.upf1.n4if/n9if/n6if.ipAddress` |
| Anchor UPF2 N4/N9/N6 | `.209` / `.210` / `.212` | `free5gc-upf.upf2.n4if/n9if/n6if.ipAddress` |

The abbreviated addresses above are all in `10.160.101.0/24`. Each slash-separated field is a separate YAML key.

Keep site overrides in a protected file outside the published chart. This **partial** example only changes NIC names and storage; it retains the lab addresses, images and topology:

```yaml
# site.private.yaml — add all other site overrides before deploying.
global:
  n2network:
    masterIf: ens18
  n3network:
    masterIf: ens18
  n4network:
    masterIf: ens18
  n6network:
    masterIf: ens18
  n9network:
    masterIf: ens18
mongodb:
  persistence:
    storageClass: local-path
```

For an address-plan change, update all affected entries together:

- `global.n2network`, `n3network`, `n4network`, `n6network`, `n9network`: parent, type, CIDR and applicable gateway, plus network metadata.
- The endpoint fields in the table above.
- `free5gc-smf.smf.configuration.configuration`: the **complete multiline YAML string**, including UPF `nodeID`, `addr`, N3/N9 endpoints and UE pools. Helm cannot merge individual keys inside that string.
- `free5gc-smf.smf.configuration.ueRoutingInfo`: subscriber-specific topology and destination routes. Its defaults contain lab destinations `10.100.100.26/32` and `10.100.100.16/32`.
- Each UPF's `configuration.dnnList`, matching the SMF pools. Current ULCL pools are `10.60.0.0/16`, `10.61.0.0/16` and `10.62.0.0/16`; avoid unintended overlap with pod, Service, VPN and site networks.

Keep each YAML mapping key unique. An earlier local deployment had two top-level `free5gc-smf` keys; the later image-only block replaced the intended SMF topology. Use separate override files for deliberate layering, and inspect the merged render.

UERANSIM currently uses one secondary interface for both N2 and N3. Separate N2/N3 fabrics need a reviewed topology change. Likewise, setting `global.userPlaneArchitecture: single` alone does not rewrite the SMF's ULCL configuration.

Allow the actual endpoint paths: gNB to AMF SCTP/38412; gNB to branching UPF and inter-UPF GTP-U UDP/2152; SMF to UPFs PFCP UDP/8805; and N6 to the chosen data network. Preserve cluster DNS/SBI/database connectivity on the primary network and UE-to-gNB UDP/4997. Validate MTU with tunnel traffic. Ordinary pod-network policy enforcement must not be assumed to cover secondary interfaces.

The UPF startup wrappers configure in-pod forwarding rules and N6 masquerading. They do not configure an upstream router, the VM network or the node's kernel. Verify IP forwarding in the UPF network namespace and the N6 gateway/return path with real UE traffic.

Keep the pod's main default route on its primary Kubernetes interface. Earlier deployment notes traced AMF/SMF `wait-nrf` failures to secondary default routes diverting DNS and Service traffic. The current chart omits those Multus default-route selections; the anchor UPFs use a separate `n6if` policy-routing table for N6. Preserve that distinction when customizing NADs or pod annotations.

## 4. Prepare scheduling, kernel, storage and images

The default topology is three UPFs (`upf1`, `upf2`, `upfb`). **Role labels are required by the current values.** Pod anti-affinity is preferred, not required. Use three prepared UPF workers for the initial repeatable profile; RAN may share a worker if resources permit. Substitute real node names:

```sh
kubectl label node worker-a telecom.example/upf-psa1=true --overwrite
kubectl label node worker-b telecom.example/upf-psa2=true --overwrite
kubectl label node worker-c telecom.example/upf-iupf=true --overwrite
kubectl label node worker-c telecom.example/ran=true --overwrite
kubectl get nodes -L telecom.example/upf-psa1,telecom.example/upf-psa2,telecom.example/upf-iupf,telecom.example/ran
```

Install and persist the compatible `gtp5g` module on every possible UPF worker, including replacement nodes. The local [UPF compatibility profile](images/upf-gtp5g-compat/README.md) targets `gtp5g` **v0.8.10** and a patched branching-UPF image. Validate that pairing against the actual running kernel; selecting a newer module or upstream image is not an automatic compatibility fix. Build against matching kernel headers and repeat the check after kernel upgrades/reboots. On prepared workers:

```sh
uname -r
modinfo -F version gtp5g
test -d /sys/module/gtp5g || { echo 'gtp5g is not loaded'; exit 1; }
cat /sys/module/gtp5g/version
sysctl net.ipv4.ip_forward
```

`modinfo` describes the installed module; `/sys/module` checks what is loaded. Prepare SCTP support on AMF/gNB workers and TUN support on UE workers. The UPFs need `NET_ADMIN`; the UE adds `NET_ADMIN`, `MKNOD` and `NET_RAW`. The namespace's admission policy must permit these actual pod specs. Baseline/restricted Pod Security policies can reject them; arrange the appropriate scoped policy with the cluster administrator rather than disabling admission cluster-wide.

Provide a functioning StorageClass for MongoDB's persistent storage (default request: `6Gi`). Set `mongodb.persistence.storageClass` or provide the intended default class. Check provisioner health and volume ownership; an existing StorageClass object alone does not prove provisioning works. For local storage, account for node loss and scheduling restrictions. Do not delete MongoDB PVCs to retry a deployment.

Confirm the PVC is mounted at `/data/db`, the database directory used by this chart's official MongoDB image. An older deployment mounted a Bitnami-specific path and lost subscriber persistence despite having a PVC. During acceptance, verify a test subscriber survives MongoDB pod recreation with the same volume.

```sh
kubectl get nodes -o wide
kubectl get pods -A
kubectl get storageclass
kubectl get resourcequota,limitrange -n free5gc
```

Review the rendered image list, including init containers. Defaults reference private images at `10.160.101.91:32000`, public `towards5gs/*` images (some tagged `latest`), and MongoDB images. Mirror the validated image set to a reachable registry and select immutable tags/digests where supported. Do not substitute stock core images for patched images without revalidating the subscriber schema and UPF compatibility. Workers need registry DNS/routing, CA trust and any namespace-scoped pull Secrets; Helm repository access from OSM is a separate requirement. An HTTP lab registry also needs explicit runtime configuration on each node; a pull Secret alone does not enable HTTP.

Override NF images under `free5gc-<nf>.<nf>.image`, UPF images under `free5gc-upf.upf1/upf2/upfb.image`, and UERANSIM under `ueransim.image`. Inspect init-container values too; there is no single chart-wide registry switch.

The umbrella values contain public test subscriber credentials. For your own subscriber, use protected overrides or `ueransim.ue.auth.create: false` with `ueransim.ue.existingAuthSecret`, following [subscriber provisioning](charts/ueransim/SUBSCRIBER-PROVISIONING.md). Keep SUPI, PLMN, DNN, SST/SD, SMF routing and authentication aligned. Preserve authentication sequence numbers when reusing a database. The parent currently selects `authenticationSchema: modern` and object SQNs for its patched core.

## 5. Validate the exact values before OSM receives them

Run from the repository root. Select the target kubeconfig/context explicitly, and use the namespace that OSM will actually deploy into. Rendered output can contain Secrets; keep it private.

```sh
export KUBECONFIG=/secure/path/target-kubeconfig
SITE_NAMESPACE=free5gc
SITE_VALUES=/secure/path/site.private.yaml
kubectl config current-context
kubectl version
kubectl get namespace "$SITE_NAMESPACE"
kubectl auth can-i --list -n "$SITE_NAMESPACE"
umask 077
mkdir -p Helm/debug
helm lint Helm/free5gc-1.3.1 -f "$SITE_VALUES"
helm template readiness-check Helm/free5gc-1.3.1 \
  -n "$SITE_NAMESPACE" -f "$SITE_VALUES" > Helm/debug/site-rendered.yaml
kubectl apply --dry-run=server -n "$SITE_NAMESPACE" -f Helm/debug/site-rendered.yaml
```

Prepare the namespace first if absent, including its admission policy and required Secrets. Run the access/dry-run checks using the identity OSM will use. That identity needs lifecycle permissions for the rendered resources and Helm release metadata, including NADs; API reachability from your laptop is not proof of reachability from OSM's deployment component. Kubeconfigs must not depend on local certificate files or an unavailable interactive/exec login helper.

Inspect the rendered NAD JSON, pod network annotations, selectors, images and embedded SMF configuration. Confirm the StorageClass and referenced Secrets exist. If available, also schema-check against the target Kubernetes version (including the NAD CRD schema). A server dry-run checks API acceptance; it does **not** execute CNI, pull images, prove pod scheduling, provision storage, load `gtp5g`, or validate a PDU session. Controller-created pods also need actual admission verification during the acceptance deployment.

Keep one release per namespace for this profile, and allocate unique secondary addresses for deployments sharing a physical network. Namespace separation does not isolate static IPs. MongoDB/service names and the WebUI's default NodePort `30500` introduce additional collision risks. Changing only SD is not enough for concurrent isolated deployments; keep fixed-IP NF replica counts at one.

## 6. Hand the prepared cluster and chart to OSM

Confirm the installed OSM release and matching CLI before using commands. The [OSM 16 KNF workflow](https://osm.etsi.org/docs/test-user-guide/v16/05-osm-usage/#using-kubernetes-based-vnfs-knfs) is a reference here, not a claim that OSM 16 is installed.

1. Register the cluster against its correct VIM/backing account and network mapping. Verify registration finishes and Helm 3 deployment is usable. `--k8s-nets` maps OSM infrastructure networks; it does not install Multus or create the chart's NADs.
2. Make the versioned chart available to OSM. Onboard the KNF/VNFD and NSD with matching KDU/member identifiers and the intended chart version. Confirm target cluster selection and namespace. See [packaging](../README.md#package-changes-for-osm).
3. Deliver the exact site values to the KDU. OSM accepts Helm overrides beneath `additionalParamsForVnf[].additionalParamsForKdu[].additionalParams`. This is an illustration of the nesting, not a complete site file:

```yaml
additionalParamsForVnf:
  - member-vnf-index: free5gc  # Must match your NSD.
    additionalParamsForKdu:
      - kdu_name: free5gc     # Must match your VNFD.
        additionalParams:
          global:
            n2network:
              masterIf: ens18
            katanaNestSd: "000002"
          # Put ALL other validated site values under additionalParams too.
```

**Katana's current NEST profile forwards only `global.katanaNestSd`.** Saving a local `site.private.yaml` or using it with `helm template` does not send it through Katana. See the [NEST implementation and limits](../../Backend/docs/nest-helm-configuration.md).

For the current Katana UI path, prepare and publish a separately versioned chart whose non-secret defaults match the site, and have the NSD reference it. Use pre-created Secrets in the deployment namespace for private credentials. Alternatively, an operator can supply the full site overrides through OSM's supported KDU instantiation workflow. Automatic site-profile merging into Katana requests remains future work. Never overwrite different chart contents under the same published version.

Register Katana's target with its location, owning NFVO and OSM VIM mapping, then enable the adapted NSD as documented in the NEST guide. OSM owns the installed release: avoid independently installing or upgrading that same release with Helm.

## 7. Acceptance and recovery

After OSM instantiates one test service, inspect both its lifecycle operation and Kubernetes:

```sh
osm ns-op-list YOUR_NS_NAME
kubectl -n "$SITE_NAMESPACE" get pods -o wide
kubectl -n "$SITE_NAMESPACE" get pvc
kubectl -n "$SITE_NAMESPACE" get network-attachment-definitions
kubectl -n "$SITE_NAMESPACE" get events --sort-by=.lastTimestamp
helm list -n "$SITE_NAMESPACE"
```

Check network-status annotations for the expected secondary IPs, SMF association with each UPF, gNB NGAP readiness, successful UE registration and a PDU session. Use the release name reported by OSM/Helm, not the local `readiness-check` rendering name:

```sh
SITE_RELEASE=actual-release-name
SITE_TEST_IP=reachable-data-network-ip
kubectl -n "$SITE_NAMESPACE" logs deployment/"$SITE_RELEASE"-free5gc-smf-smf
kubectl -n "$SITE_NAMESPACE" logs deployment/"$SITE_RELEASE"-ueransim-gnb
kubectl -n "$SITE_NAMESPACE" logs deployment/"$SITE_RELEASE"-ueransim-ue -c ue
kubectl -n "$SITE_NAMESPACE" exec deployment/"$SITE_RELEASE"-ueransim-ue -c ue -- ip -4 addr show
kubectl -n "$SITE_NAMESPACE" exec deployment/"$SITE_RELEASE"-ueransim-ue -c ue -- ping -I uesimtun0 -c 4 "$SITE_TEST_IP"
```

Adjust names if overriding chart naming. Select a destination that permits ICMP, or use an appropriate application probe. Verify return traffic and each intended ULCL path, then test restart and confirm configuration persists. Pods being Running, or an OSM operation completing, is insufficient evidence of a working user plane.

| Symptom | Check first |
| --- | --- |
| Pending | Role labels, taints, requested resources, PVC provisioning and admission events |
| FailedCreatePodSandBox | Multus logs, delegate binaries/search paths, parent NIC, NAD JSON and duplicate static IPs |
| ImagePullBackOff | Exact image/tag, registry reachability, CA/HTTP runtime settings and pull Secrets |
| UPF crash or no PFCP association | Loaded module/kernel/image pairing, NET_ADMIN, N4 addresses and SMF topology |
| gNB unready | SCTP support, N2 reachability, AMF bind address and PLMN/TAC |
| UE init/registration failure | Provisioning logs, MongoDB readiness, auth Secret, schema, subscriber identity and slice values |
| UE registered but no traffic | N3/N9/N6 paths, UPF forwarding, NAT, gateway/return route, UE pools and MTU |

Capture OSM operation errors and the relevant pod events/logs before retrying. Correct the responsible site setting, then use the matching OSM lifecycle operation for recovery. Keep MongoDB storage and subscriber sequence numbers; termination/recreation requires checking storage retention first. Do not remove shared Multus, node networking or kernel modules as part of service cleanup. Keep the previous site profile and image/kernel versions for a controlled rollback.

The cluster is ready for repeat deployments only after this acceptance passes. Retain the validated site values, pinned artifact versions and test result with the cluster handover; revalidate when kernels, CNI, images or network topology change.

Historical sources: the local `free5gc-1.2.11.tgz` archive includes earlier `NEXT-CLUSTER-OSM.md`, `PORTABLE-INSTALL.md` and `LOCAL-CHANGES.md` documents. They record the routing, persistence and YAML failures above, but some instructions still name chart versions `1.1.10` or `1.2.8`. Use the current rendered configuration when applying those lessons.
