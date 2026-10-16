# UI workflow verification — 2026-10-16

Branch: `Code-cleanup`. The existing uncommitted standalone Proxmox monitoring removal is preserved. **Deployments → New Deployment → Proxmox remains available.** No live infrastructure was deployed, modified, or deleted.

## Verification levels

**Local passed** below means the named automated, browser, or isolated integration checks passed. It does not certify a real OSM, Proxmox, Amarisoft, Kubernetes, or network-slice deployment. **Lab blocked** means approved disposable targets and credential references have not been supplied. No feature is labelled lab passed.

| Feature | Reproduction / root cause and change | Regression evidence | Result |
| --- | --- | --- | --- |
| Navigation and Overview | Removed monitoring route stays absent. Legacy slice-create URLs still redirect to Kubernetes deployment. Overview wording now includes accepted and failed attempts. | Route/sidebar suites; production browser direct URLs, refresh, redirects, unknown URLs, active navigation and absence of Proxmox sidebar item. | **Local passed** |
| Dashboard | A nested `password` in inventory was rendered as a table value. Normalize only after applying the existing recursive secret redactor. Individual-source errors already had independent handling. | New `dashboard-data.service.spec.ts`: all 15 sources, one 503, healthy rows, empty sections, nested secret exclusion. Existing page filtering/pagination checks; browser healthy inventory remains visible during NFVO outage. | **Local passed**; real inventory **lab blocked** |
| Time-0 Setup | No new defect reproduced in covered reconciliation paths. Existing validation, locking, credential handling and recovery retained. | Bootstrap Angular/Python suites: invalid manifests, links, duplicate NFVO, TLS options, repeated reconciliation, adoption, partial failure/recovery and preservation of unrelated accounts. Browser empty status/form. | **Local passed**; real connectivity/reconciliation **lab blocked** |
| Infrastructure | Existing location repair behavior retained. | Location tests and real disposable MongoDB: repair the same cluster twice, preserve remote cluster/VIM IDs, persist `edge`, avoid duplicate location links, and reload inventory. Browser empty NFVO/VIM/cluster inventory. | **Local passed**; real OSM inventory **lab blocked** |
| Helm Charts | No new defect reproduced in covered upload paths. | Flask upload suite: auth, disabled/missing configuration, file limits, repository failures/duplicate/timeout handling, metadata validation, stream cleanup and credential exclusion. Angular upload/duplicate-submit/sign-out checks; browser invalid/valid sign-in and empty catalogue. | **Local passed**; real repository **lab blocked** |
| Kubernetes/NEST | HTTP acceptance was recorded as completed deployment. Emit/store `accepted`, display readiness as unverified, and preserve the redacted OSM response in History. Registration also rejects submission while inventory is loading/failed. Two old deployment tests expected the superseded wizard; registration tests mocked the wrong inventory endpoint. | Updated wizard and registration suites; NEST upload/preview/request checks with `000002`; accepted result retained through event → History. Python OSM serialization/validation tests and chart rendering confirm core, RAN, UE and subscriber SD consistency, independent SD renders and invalid-SD rejection. | **Local passed**; OSM instantiation/workload readiness/UE/PDU/traffic **lab blocked** |
| Proxmox deployment | Cached overview could bypass expired credentials; TLS selection was dropped; slow guest-agent requests were cancelled every four seconds; discovery had no overall bound; a later invalid VM definition could leave earlier VMs provisioned with no useful partial-error context. Revalidate saved inventory, preserve TLS/timeout settings, ignore duplicate submissions, allow one IP request at a time (30-second request/2-minute overall bounds), prevalidate all VM definitions, and include completed/possibly-created VM IDs in failure messages. | Registration/auth/storage/ISO/server-selection suites; delayed-IP, duplicate-submit and overall-timeout regressions; new backend clone/create task-wait/configuration, invalid-batch, partial-failure and saved-TLS tests. Browser New Deployment → Proxmox, keyboard focus and refresh. | **Local passed**; real capacity/configuration/task/IP/connectivity **lab blocked** |
| Amarisoft deployment | Duplicate actions could overlap. Deleting a planned slice contacted targets; failed target deletion removed the recovery record. Guard overlapping UI actions, delete plans locally, and retain records on target-delete failure. | New Angular preview → plan → failed apply → retry test, including SD and duplicate-submit guards. Flask with real disposable MongoDB and mocked adapters verifies preview has no writes, plan persistence, partial apply/delete, retry and final deletion. | **Local passed**; real RAN/core apply and service functionality **lab blocked** |
| Slice status/lifecycle | A hung status request or indefinitely-progressing operation could poll forever. Bound individual requests to 30 seconds and polling to 20 minutes; preserve “may still be running” semantics at the overall bound. Kafka connection helpers continued retrying after their limit; all three service copies now raise at exhaustion. | Status tests: Running stops polling, three timed-out requests, overall bound, AddNS ownership/target payload and restart target validation. Kafka retry regression covers producer/consumer/topic in NBI, manager and monitor. Real Flask → Kafka delete-message delivery with the Mongo record still readable; stale slice returns 404. | **Local passed**; manager execution and actual lifecycle changes **lab blocked** |
| Monitoring | Old chart/log subscriptions survived selection changes and could overwrite the current slice. Cancel them when selection or chart query changes and clear loading/data state. | New delayed-response selection/destroy regression; existing summary/chart tests. Browser empty overview and unavailable monitoring detail; no unexpected browser exceptions. | **Local passed**; actual metrics, units and log contents **lab blocked** |
| History and drafts | Storage access errors escaped or lost state; malformed packs could break rendering; restored history marked prerequisites complete without revalidation. Keep redacted memory state on storage failure with a visible reload warning, recover corrupt JSON, filter malformed packs and revalidate restored prerequisites. | Storage-blocked, malformed JSON/arrays/packs, redaction, missing snapshot and draft restoration suites. Browser refresh/corrupt history recovery, accepted OSM details, and clearing history sends no infrastructure DELETE. | **Local passed**; retries against expired real registrations/packs **lab blocked** |

Kubernetes deployment uses `/api/k8s/deploy` and OSM service/operation identifiers. `/slices/:sliceId` and `/api/slice/:id` use Katana slice IDs and manager/Kafka lifecycle operations. The preserved OSM response is labelled explicitly; it is not linked to a Katana slice-status URL.

## Baseline and final checks

- Initial frontend run: **121 passed, 17 failed / 138**. Two deployment expectations were stale; the registration inventory mock caused a cascading failure in its suite. The monitoring chart assertion also used a short timing delay; its final assertion now waits for the rendered chart.
- Initial backend: **74 passed**.
- Final frontend: **151 passed / 23 files**.
- Final backend: **81 passed**, both in the local virtual environment and the installed NBI image with networking disabled.
- Production Angular build: passed. Existing deployment stylesheet warning remains: **13.41 kB vs 12 kB budget**.
- Helm lint: **1 chart passed**. Existing NEST chart check passed: SD reaches core/gNB/UE/subscriber data; other settings remain unchanged; independent renders and invalid SD rejection pass.
- Production browser: Brave/Chromium, **1440 px and 390 px**. Ten page routes at both widths, plus redirects, Proxmox wizard/refresh/keyboard focus, isolated dashboard failure, Helm auth/sign-out, corrupt history and accepted-result refresh. No horizontal overflow on those page views and no unexpected JavaScript exceptions. This is a smoke walkthrough, not a complete screen-reader or every-control accessibility audit.
- Real local integration: current Flask application (129 routes), disposable MongoDB and Kafka, with Amarisoft adapter calls mocked at their boundary. Successful API acceptance/message delivery is not manager/orchestrator execution proof.
- `git diff --check`: passed.

Verified tool versions: Node **24.14.1**, npm **11.11.0**, Angular **21.2.6**, Vitest **4.1.2**, Helm **3.21.3**. Local Python **3.14.6** / Flask **3.1.3**; NBI image Python **3.10.12**, Flask **3.1.3**, PyMongo **4.18.2**, kafka-python **3.0.11**. Isolated services used the repository's MongoDB **4.4** and Confluent Kafka/Zookeeper **5.4.2** images. Lab component versions remain unknown.

The host system Python lacks PyYAML; chart/backend checks used the prepared virtual environment instead. The sandboxed Angular build worker aborted, while the same production build with `NG_BUILD_MAX_WORKERS=2` outside the sandbox succeeded. These were execution-environment limitations, not application test failures.

## Runnable checks

Use the existing installed frontend dependencies and a Python environment with the backend test dependencies. No new test framework was added.

```sh
# Repository root
PYTHONPATH=Backend python -m unittest discover -s Backend/tests
helm lint Helm/free5gc-1.3.1
python Backend/tools/check_free5gc_nest_chart.py

# Frontend/katana-slice-manager
npm test -- --watch=false
NG_BUILD_MAX_WORKERS=2 npm run build -- --progress=false
node tools/check-browser-workflows.mjs '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
```

The browser check serves the built app on loopback with synthetic APIs and an isolated browser profile. It never uses the development proxy or live deployment endpoints. It writes results and a screenshot under `/private/tmp/katana-browser-*`.

The integration check requires an **empty disposable database**, the existing `katana-nbi:test` image, and the three local service images. From the repository root:

```sh
docker compose -f Backend/tools/workflow-check.compose.yaml up -d --pull never
docker run --rm --network katana-workflow-check_checks \
  -v "$PWD/Backend:/workspace:ro" \
  -e PYTHONPATH=/workspace/katana-nbi -e KATANA_DISPOSABLE_CHECKS=1 \
  katana-nbi:test python /workspace/tools/check_local_workflows.py
docker compose -f Backend/tools/workflow-check.compose.yaml down -v
```

The compose project has an internal network, no published ports, and no shared application volumes. The check refuses a non-empty database. The test containers, volumes and network from this run were removed; the user's running Katana stack was not changed. Recreate the disposable project before rerunning the integration script.

## Pending lab acceptance

Live verification is **blocked pending designated disposable targets**, not failed. Do not infer lab readiness from the local checks. The following remain unexecuted: actual capacity contention, remote writes with ambiguous acceptance, manager restart/recovery against real orchestration, multi-VM guest connectivity, actual monitoring timestamps/units, UE registration, PDU sessions and traffic.

Record these before execution, using credential references rather than credentials in this document:

| Required record | Status |
| --- | --- |
| OSM endpoint/version/project, NFVO ID, VIM/account, NSD/VNFD/chart versions/digests | Pending |
| Kubernetes context, namespace, cluster version, free5GC/RAN/UE versions and resource limits | Pending |
| Proxmox endpoint/cluster/node/version, template or ISO, storage/network and VM limits | Pending |
| Amarisoft adapter/RAN/core endpoints and versions, subscriber/UE and pre-test configuration | Pending |
| Unique test names, PLMN/DNN/SST/SD, addressing, traffic destination and cleanup ownership | Pending |

Run approved deployments sequentially. Capture redacted requests, returned IDs, orchestration/task results, persisted state and logs. For network slices, verify requested configuration → completed orchestration → healthy workloads → UE registration → PDU session → basic traffic. Repeat with a second SD after cleanup or in an isolated environment; independent chart renders are not concurrent network-isolation proof. For Proxmox, verify actual VM configuration, task completion, startup and guest connectivity separately from slice acceptance. Remove only test-created resources and restore recorded pre-test configuration.

Angular, Flask, frontend, backend and domain skills were used from the user's external `~/.codex/skills` and `~/.agents/skills` directories; no skill copies were added to this repository.
