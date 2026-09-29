# Katana fullstack

The application and its free5GC deployment chart live together:

| Directory | Purpose |
| --- | --- |
| [Frontend/katana-slice-manager](Frontend/katana-slice-manager/README.md) | Angular UI, including NEST upload |
| [Backend](Backend/README.md) | Katana API, orchestration and OSM integration |
| [Helm/free5gc-1.3.1](Helm/README.md) | Editable free5GC/UERANSIM chart and local rendering workflow |

For NEST-to-Helm setup, see the [feature guide](Backend/docs/nest-helm-configuration.md). For debugging the UI request through the backend into rendered Kubernetes configuration, see the [Helm development guide](Helm/README.md).
