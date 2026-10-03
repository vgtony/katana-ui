# NEST-driven free5GC deployment

## Deployment workflow

Use **Deployments → Kubernetes → Deploy Configuration**. The separate Create Slice page has been removed; old links redirect here.

1. Upload the configurable chart once and onboard the corresponding KNF/NSD in OSM (see below).
2. Open Kubernetes deployment. Registered clusters allow you to proceed without uploading credentials again.
3. Upload the example NEST. Katana reads the service name, description and SD from YAML.
4. Katana loads NSDs, their owning NFVOs, live OSM VIM accounts and registered locations. A sole eligible choice is selected automatically; choose from the existing dropdowns if several resources are available.
5. Review the Helm values and deploy. Katana sends the NEST-derived values through the existing `/api/k8s/deploy` endpoint to OSM. The chart name and packages stay unchanged.

An accepted request is not proof that the service is running. Check OSM deployment status and Kubernetes workloads. This creates a new service instance, not an upgrade of an existing instance.

## NEST input

Start from `../templates/example_config_files/nest/free5gc_sd.yaml`. It intentionally contains no blank infrastructure identifiers: these come from inventory. Optional explicit NSD/NFVO references must match the selected deployment. The added service field is a **Katana extension**, not a claim to implement every GSMA NEST attribute:

```yaml
helm_configuration:
  profile: free5gc-sd-v1
  member_vnf_index: "free5gc"
  kdu_name: free5gc
  sd: "000002"
```

`member_vnf_index` must match the NSD constituent/virtual-link profile reference used by OSM, and `kdu_name` must match the VNFD KDU name. They are not the OSM instance UUIDs; inspect your actual descriptors. Katana validates their syntax; OSM validates their existence.

The profile changes the chart's existing SST 1 / SD 010203 entries. SD remains a six-character hexadecimal string, including leading zeroes. Integers, unknown fields, unsupported profiles and reserved `FFFFFF` are rejected. Keep the NEST's `delay_tolerance: true` for the current mapper's SST 1 selection. Other SSTs, DNNs, QoS fields and subscriber identities are outside this profile.

The deployment form previews the generated Helm values. Invalid YAML or missing supported configuration blocks deployment with an error. Change SD in the NEST and upload it again. After refreshing the page, re-upload the NEST before deploying; its contents are not persisted in browser drafts.

Katana generates:

```yaml
additionalParamsForVnf:
  - member-vnf-index: free5gc
    additionalParamsForKdu:
      - kdu_name: free5gc
        additionalParams:
          global:
            katanaNestSd: "000002"
```

Clients cannot supply `additionalParamsForVnf` directly through this NEST endpoint. The existing legacy slice API also supports this profile and preserves its parameters on restart; the Kubernetes deployment flow uses OSM service instances directly. This is configuration at instantiation, not a live SD migration.

## Chart source and packaging

The original base is preserved at `Helm/free5gc-1.2.11` and checked against a file checksum manifest. The adapted chart is now included in this repository at `Helm/free5gc-1.3.1`. Edit and debug it alongside the frontend and backend; see [Helm development](../../Helm/README.md). The imported source is based on upstream commit
[`c1ec95612010f844f8ae399bc2f019a8730ff239`](https://github.com/vgtony/free5gc-chart/tree/c1ec95612010f844f8ae399bc2f019a8730ff239).

From the repository root, with Python 3, Helm and PyYAML available:

```sh
python3 Backend/tools/check_free5gc_nest_chart.py
helm lint Helm/free5gc-1.3.1
mkdir -p Helm/dist
helm package Helm/free5gc-1.3.1 --destination Helm/dist
```

The original `prepare_free5gc_nest_chart.py SOURCE DESTINATION` tool remains available to reproduce the adaptation from the reviewed upstream checkout. It checks the source hashes and overlays the maintained 1.3.1 template changes. It must not be run against the already-adapted local chart. Future upstream updates require reviewing the SD mapping.

This produces `free5gc-1.3.1.tgz`. Publish this version once to your chart repository, or bundle it in your KNF package using your OSM release's supported packaging workflow. Update/onboard the KNF descriptor once to reference that chart. Reuse the NS package if its VNFD references remain valid; update it once if you change those identifiers. Do not overwrite chart contents under an existing version.

Only after the NSD references this adapted chart, enable it in the NBI environment:

```sh
KATANA_FREE5GC_NEST_NSD_IDS=your-registered-nsd-id
```

`Backend/docker-compose.yaml` forwards this variable; supply it through your deployment's environment or `.env`, then recreate the NBI container with the updated application image. Multiple enabled NSD IDs are comma-separated. Empty/unset disables this profile. The NBI and manager application changes both need deployment. Neither live onboarding nor service deployment is performed by the preparation script.

Subsequent NEST requests reuse the same chart and KNF/NS packages. Only the SD instantiation value changes; no chart rebuild or reupload is necessary.

## Verification and limits

Run the backend checks from the repository root:

```sh
PYTHONPATH=Backend python3 -m unittest discover -s Backend/tests -q
```

From `Frontend/katana-slice-manager`:

```sh
npm test -- --watch=false --include=src/app/features/registration/k8s-registration-flow.spec.ts
npm run build
```

The chart check renders defaults and two SD values, decodes core/UE/gNB/subscriber configuration, verifies the intended SDs and that other settings stay unchanged, and rejects invalid values. The backend checks cover validation, OSM request serialization and restart. UI checks cover inventory selection, YAML parsing and the deployment request.

Before enabling a production NSD, confirm your installed OSM release accepts the documented KDU parameter structure. Deploy a test NEST with `000002`, inspect the OSM request and live ConfigMaps/subscriber data, confirm UE registration and a PDU session, then restart and confirm the SD persists. Test a second SD in a separate safe environment or after termination. The upstream chart contains fixed networking and subscriber defaults; concurrent deployments are not proven isolated by this feature.

SD identifies a slice together with SST; it does not enforce throughput, jitter, latency or resource isolation. Those NEST requirements remain requests/metadata here, not guaranteed outcomes. This implementation does not claim radio QoS enforcement or automatically reconfigure an existing subscriber on a shared MongoDB deployment.

OSM parameter reference: [KDU instantiation parameters](https://osm.etsi.org/docs/user-guide/develop/vnf-onboarding/05-quickstarts.html#particularize-your-instantiation-parameters).

## Existing cluster locations

Locations and NFVOs are loaded from Katana; they do not belong in the NEST example as empty fields. New cluster registration offers the registered locations in a dropdown and selects the sole location automatically.

For legacy clusters missing their location association, **Infrastructure → Kubernetes clusters → Save location** repairs Katana metadata without uploading credentials or registering the cluster again. This is only needed to repair missing metadata; the Kubernetes deployment form does not repeat the old Create Slice target-registration gate.

Live OSM acceptance and production bundle verification remain required before release.
