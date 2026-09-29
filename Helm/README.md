# Helm chart development

`free5gc-1.2.11/` preserves the original base chart. `free5gc-1.3.1/` is the editable, NEST-adapted chart used by Katana. Work on it here alongside `../Frontend` and `../Backend`. It is a source copy, not a Git submodule or a chart downloaded at application startup.

Before handing a new Kubernetes cluster to OSM, follow the [next-cluster preparation runbook](free5gc-1.3.1/NEXT-CLUSTER-OSM.md). It covers Multus, node/kernel prerequisites, network and registry overrides, OSM handover, and acceptance checks for the actual chart defaults.

## Source and dependencies

Imported from `vgtony/free5gc-chart`, branch `ueransim-free5gc`, commit `c1ec95612010f844f8ae399bc2f019a8730ff239`, with the existing Katana SD adapter applied. Version: `1.3.1`. Upstream license headers and `free5gc-1.3.1/LICENSE` are preserved. The upstream README remains in `free5gc-1.3.1/README.md`; use this guide for the Katana workflow.

The import includes chart templates, defaults, subcharts and image build sources. Upstream personal overrides, backups and deployment scripts are not part of this copy. The vendored `charts/mongodb-10.7.0.tgz` is an existing chart dependency and is intentionally tracked; generated parent chart packages go in ignored `dist/`.

The base chart files are unchanged from the reviewed upstream source. `free5gc-1.2.11.sha256` records their checksums; the render check fails if a base file is edited. Make all development changes in 1.3.1. To package the base separately, run `helm package Helm/free5gc-1.2.11 --destination Helm/dist` from the repository root.

## Configuration in 1.3.1

The existing NEST profile remains `free5gc-sd-v1`; it generates `global.katanaNestSd`. Omit this value for base behavior, or supply a quoted six-digit SD such as `"000002"`. The new values schema rejects non-string, malformed and reserved `FFFFFF` inputs. This version changes only the existing SST 1 / SD 010203 slice; it does not change SST, DNN, bandwidth or jitter.

UERANSIM and subscriber configuration now resolve the selected slice fields directly. Core YAML strings use a helper limited to adjacent SST 1 / SD 010203 fields. Other slices and arbitrary text are preserved. The JSON schema and helper are in `free5gc-1.3.1/values.schema.json` and `templates/_katana_nest.tpl` respectively.

## Local checks

Run from the repository root. Requirements: Helm, Python 3 and PyYAML (already a backend dependency).

```sh
helm lint Helm/free5gc-1.3.1
python3 Backend/tools/check_free5gc_nest_chart.py
```

The check now defaults to this local chart. It verifies two independent SD overrides across the core, gNB, UE and subscriber configuration and checks that other settings remain unchanged. Passing an upstream directory still tests the original one-time adaptation workflow.

Preview a deployment without contacting Kubernetes or OSM:

```sh
mkdir -p Helm/debug
helm template nest-debug Helm/free5gc-1.3.1 --set-string global.katanaNestSd=000002 > Helm/debug/sd-000002.yaml
```

Inspect the ConfigMap data in that file. Generated manifests can include subscriber credentials, so `debug/` is ignored. Use `-f /path/to/site.private.yaml` for your environment's private overrides; do not commit those files.

## Trace a NEST through the application

1. Start the frontend using its [development instructions](../Frontend/katana-slice-manager/README.md), connected to your running Katana backend.
2. Upload [free5gc_sd.yaml](../Backend/templates/example_config_files/nest/free5gc_sd.yaml) after replacing its resource IDs.
3. Inspect the create-slice HTTP request in browser developer tools: the selected service should contain `helm_configuration.sd: "000002"`.
4. In the NBI, follow `Backend/katana-nbi/katana/api/slice.py` and `shared_utils/nestHelm.py`. Validation generates `additionalParamsForVnf` containing `global.katanaNestSd`.
5. In the manager, follow `Backend/katana-mngr/katana/utils/sliceUtils/sliceUtils.py` into `shared_utils/nfvoUtils/osmUtils.py`. These send the values to OSM and preserve them for restart.
6. Compare the local rendered ConfigMaps with OSM's deployed ConfigMaps. Keep tokens and subscriber secrets out of shared debug logs.

## Package changes for OSM

```sh
mkdir -p Helm/dist
helm package Helm/free5gc-1.3.1 --destination Helm/dist
```

OSM still reads the chart referenced by your KNF descriptor. Editing this directory does not update a remotely deployed chart. For template/default changes, increment `Chart.yaml`'s version, package and publish it, then update the descriptor reference as needed. For a deployment-specific SD change, reuse the published chart and send new NEST values; no new package is needed.

Follow the [NEST setup guide](../Backend/docs/nest-helm-configuration.md) for NSD enablement and live acceptance testing. This import does not perform a deployment or prove concurrent deployment isolation.

## Upload with GitHub Actions

The portable [workflow and setup guide](../.github/HELM_UPLOAD.md) targets `vgtony/free5gc-chart`, branch `ueransim-free5gc`. Copy the workflow and upload helper into that repository as described in the guide. It uploads already-packaged `dist/*.tgz` files when they are pushed, using a self-hosted runner on the private network and the `HELM_UPLOAD_TOKEN` Actions secret.

After packaging here, copy `Helm/dist/free5gc-1.3.1.tgz` into the chart repository's `dist/`, commit that archive and push it. The workflow also supports selecting an existing archive manually. It does not publish uncommitted local files or change a deployed release.
