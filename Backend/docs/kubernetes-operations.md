# Kubernetes deployment operations

The Angular UI and NBI should be released together. The UI uses a public same-origin `/api` base; production hosting must route it to the NBI. Existing chart upload automation is unchanged.

## Submission and recovery

`POST /api/k8s/deploy` accepts an optional canonical UUID `request_id`. The UI persists it before sending the request. API clients should do the same and retain the exact request input. Older clients that omit the key receive a generated identity, but cannot deduplicate a lost response.

The NBI inserts a `k8s_operations` record before contacting OSM. MongoDB's unique `_id` arbitrates concurrent submissions, with majority/journal acknowledgement. The same key and input returns the stored operation; changed input returns 409. A database claim failure prevents the remote create. No automatic create retry occurs after a timeout, process crash, or uncertain result.

The response is HTTP 202 with `operation_id`, `nfvo_id`, `submission_state`, `phase`, and available OSM identity. The compatibility `osm_response` field now contains only the instance `id`, not the unfiltered remote response. Callers must examine state: 202 can also report an uncertain outcome or a recorded rejection. Read `GET /api/k8s/operations/<operation_id>` after a lost response or restart.

| State | Meaning / next action |
| --- | --- |
| submitting / pending | Claim exists; submission is in progress. Check status. |
| accepted / pending | OSM acknowledged creation; instantiation is still being observed. |
| unknown | Outcome or identity cannot be established. Keep the key; reconcile before another create. |
| rejected / failed | OSM rejected the submission. Review the input and failure before explicitly starting a new request. |
| accepted / completed | OSM reports instantiation completed. Kubernetes workload health and service readiness remain unverified. |
| accepted / failed | OSM reports a failed/rolled-back/partially completed operation. Resources may remain; inspect OSM before starting another request. |

A claim left in `submitting` for over two minutes is presented as unknown. If no instance ID was saved, automatic reconciliation cannot establish whether OSM created a service. There is intentionally no automatic retry or heuristic adoption by service name. An operator must verify the owning OSM project and its instances/operations. Keep the original record while investigating; deleting it would defeat duplicate prevention.

History resumes status reads by operation ID, retains the last observation on read failure, and stops on terminal/unknown states, navigation, or the 20-minute polling bound. Each read has a 30-second timeout and at most two delayed retries. A manual status refresh performs reads only. Clearing browser history does not delete remote resources. Browser storage is a convenience cache; blocked/cleared storage cannot preserve a request ID across reloads. Save the displayed ID separately in that case.

## Ownership and compatibility

Status and deletion resolve the saved NFVO registration, endpoint and project. Missing or changed ownership fails closed. `GET /api/k8s/deploy/<instance_id>` now returns the normalized operation object instead of an unfiltered OSM operation list. Its optional `nfvo_id` disambiguates stored bindings; it never authorizes an arbitrary target.

`DELETE /api/k8s/deploy/<instance_id>` uses the bound OSM asynchronous `ns_instances_content` deletion endpoint and returns acceptance, not verified termination/removal. A timeout remains uncertain. No deletion was executed during verification. The endpoint contract follows the [OSM v20 NBI reference](https://osm.etsi.org/docs/user-guide/v20/reference/nbi-api.html); validate it against the installed OSM version before rollout.

Legacy instances without a unique stored binding return 409 for status/deletion. There is no public adoption endpoint in this change. Verify ownership and reconcile through the operator's existing OSM tooling; do not select the first registered NFVO. Historical browser entries without operation IDs are labelled unverified.

The existing K8s API has no established authenticated principal/tenant context. Request UUIDs are globally unique, and saved NFVO/project binding protects routing integrity, not caller authorization. Keep the API within the existing trusted-operator perimeter. Multi-tenant exposure requires server-authenticated ownership and authorization checks; a browser-supplied NFVO ID is not authorization.

## Verification

`.github/workflows/verify.yml` checks pull requests, pushes to `Code-cleanup`, and manual runs on isolated runners with read-only repository access. It runs Angular tests and all advertised builds, backend discovery including disposable MongoDB concurrency/restart/observation-order tests, and the existing chart contract check and Helm lint. It does not deploy or publish charts.

```sh
python -m venv /tmp/katana-test-env
/tmp/katana-test-env/bin/pip install -r Backend/requirements-test.txt
PYTHONPATH=Backend:Backend/katana-nbi /tmp/katana-test-env/bin/python -m unittest discover -s Backend/tests -q
/tmp/katana-test-env/bin/python Backend/tools/check_free5gc_nest_chart.py
helm lint Helm/free5gc-1.3.1
```

Without `KATANA_TEST_MONGO_URI`, the real database test is explicitly skipped. To execute it, set that variable to an isolated loopback MongoDB server. The test creates a uniquely named database, uses 12 concurrent claims and a second client for recovery, verifies stale observations cannot overwrite newer ones, and drops only its test database. Mocked tests do not establish replica failover behavior. Live OSM response formats, lifecycle execution, workload readiness, UE registration and PDU sessions remain separate release acceptance checks.
