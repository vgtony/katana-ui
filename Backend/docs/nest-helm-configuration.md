# NEST-driven free5GC deployment

## Plan and first implementation

1. Accept a small, validated per-service NEST extension for SD selection.
2. Translate it into OSM Helm instantiation parameters; preserve it during creation, AddNS and restart.
3. Preserve settings in the NEST upload UI and allow selection of registered Kubernetes targets.
4. Adapt the reviewed free5GC chart once, keeping existing settings as defaults.
5. Verify rendered configuration and mocked orchestration locally, then run a live OSM acceptance deployment.

Steps 1–4 are implemented with local checks for step 5. Live OSM/Kubernetes acceptance is still required. This feature creates new service instances using reusable package definitions. It does not upgrade an already running instance when a NEST file changes.

## NEST input

Start from `../templates/example_config_files/nest/free5gc_sd.yaml`. Replace its NSD, NFVO, target and placement with registered Katana identifiers. The added service field is a **Katana extension**, not a claim to implement every GSMA NEST attribute:

```yaml
helm_configuration:
  profile: free5gc-sd-v1
  member_vnf_index: "free5gc"
  kdu_name: free5gc
  sd: "000002"
```

`member_vnf_index` must match the NSD constituent/virtual-link profile reference used by OSM, and `kdu_name` must match the VNFD KDU name. They are not the OSM instance UUIDs; inspect your actual descriptors. Katana validates their syntax; OSM validates their existence.

The profile changes the chart's existing SST 1 / SD 010203 entries. SD remains a six-character hexadecimal string, including leading zeroes. Integers, unknown fields, unsupported profiles and reserved `FFFFFF` are rejected. Keep the NEST's `delay_tolerance: true` for the current mapper's SST 1 selection. Other SSTs, DNNs, QoS fields and subscriber identities are outside this profile.

The upload page displays the profile, SD and KDU. To change the requested SD, edit the uploaded NEST. Settings stay attached to their service when another row is removed. A Kubernetes target must have a registered `location`, `type: kubernetes`, owning NFVO and OSM VIM account mapping in Katana's unified infrastructure registry. Legacy cluster records without location/type need that registration completed before this flow can select them. Location must also be registered in Katana.

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

Clients cannot supply `additionalParamsForVnf` directly through this NEST endpoint. Generated settings are saved in the slice service record and reused on restart. API AddNS accepts the same `helm_configuration` under its `details` object. This is configuration at instantiation, not a live SD migration.

## One-time chart preparation

The adapter supports the reviewed upstream commit
[`c1ec95612010f844f8ae399bc2f019a8730ff239`](https://github.com/vgtony/free5gc-chart/tree/c1ec95612010f844f8ae399bc2f019a8730ff239).
It verifies hashes of the relevant values and templates and refuses different versions. It copies the chart into a new directory, preserves upstream license headers, wraps the relevant ConfigMap templates and adds `global.katanaNestSd`. The source is never edited. Changes to another upstream version need a mapping review, not just bypassing the hashes.

From the repository root, with Python 3, Helm and PyYAML available:

```sh
python3 Backend/tools/prepare_free5gc_nest_chart.py /path/to/reviewed-free5gc /tmp/free5gc-nest
python3 Backend/tools/check_free5gc_nest_chart.py /path/to/reviewed-free5gc
helm lint /tmp/free5gc-nest
helm package /tmp/free5gc-nest --destination /tmp
```

This produces `free5gc-1.2.11-katana.1.tgz`. Publish this version once to your chart repository, or bundle it in your KNF package using your OSM release's supported packaging workflow. Update/onboard the KNF descriptor once to reference that chart. Reuse the NS package if its VNFD references remain valid; update it once if you change those identifiers. Do not overwrite chart contents under an existing version.

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
npm test -- --watch=false --include=src/app/pages/create-slice-page/create-slice-page.component.spec.ts
npm run build
```

The chart check renders defaults and two SD values, decodes core/UE/gNB/subscriber configuration, verifies the intended SDs and that other settings stay unchanged, and rejects invalid values. The backend checks cover validation, OSM request serialization and restart. UI checks cover Kubernetes selection and service-row removal.

Before enabling a production NSD, confirm your installed OSM release accepts the documented KDU parameter structure. Deploy a test NEST with `000002`, inspect the OSM request and live ConfigMaps/subscriber data, confirm UE registration and a PDU session, then restart and confirm the SD persists. Test a second SD in a separate safe environment or after termination. The upstream chart contains fixed networking and subscriber defaults; concurrent deployments are not proven isolated by this feature.

SD identifies a slice together with SST; it does not enforce throughput, jitter, latency or resource isolation. Those NEST requirements remain requests/metadata here, not guaranteed outcomes. This implementation does not claim radio QoS enforcement or automatically reconfigure an existing subscriber on a shared MongoDB deployment.

OSM parameter reference: [KDU instantiation parameters](https://osm.etsi.org/docs/user-guide/develop/vnf-onboarding/05-quickstarts.html#particularize-your-instantiation-parameters).

Local verification on 2026-09-23: 61 backend tests and 6 upload-page tests passed; TypeScript `tsc --noEmit -p tsconfig.app.json`, Helm lint, packaging and the decoded chart configuration check passed. Production `ng build` aborted inside Node with `SIGABRT` (exit 134) without a diagnostic, including with fewer build workers. Production bundle verification and live OSM acceptance therefore remain outstanding.
