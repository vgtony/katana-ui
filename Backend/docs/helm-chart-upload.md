# Upload Helm charts from Katana

Open **Helm charts** in the sidebar (route `/helm-charts`), sign in with the dedicated chart-administrator account, choose a `.tgz`, and click **Upload chart**. The page displays the filename and size, rejects empty/wrong-type/oversized files, prevents repeat submissions, and preserves the selected file after errors. Success shows the repository's chart name, version, SHA-256 and download URL, then refreshes the chart/version selectors from the repository index.

The Angular UI sends multipart field `chart` to Flask's `POST /api/helm/charts`. The backend streams it to the configured repository upload URL. `GET /api/helm/charts` fetches the configured `index.yaml` and returns names alphabetically and versions in descending SemVer order. Both routes require the chart-administrator login. This checkout has no existing Katana user/session authentication, so this is a dedicated account scoped to chart management, not a replacement for application-wide authentication.

The repository bearer token remains in the backend. Browser requests use the separate administrator username/password with HTTP Basic authorization; these credentials are kept only in page memory and cleared on sign-out/navigation, not in browser storage. Serve the UI/API over HTTPS outside local development. The upload API on `10.160.101.73` still uses HTTP, so backend-to-repository traffic must remain on the trusted network/VPN until TLS is configured. Changing the repository URLs to HTTPS requires no code change.

## Configure the backend

Chart management is disabled by default. When enabled, startup fails unless the repository token, administrator username, valid password hash, URLs and limits are configured. The editable configuration is in [the example file](../.env.helm-upload.example); the implementation is [the Helm API](../katana-nbi/katana/api/helm.py). Configuration is passed only to `katana-nbi` in Compose, never to the frontend or manager.

1. From `Backend/`, create a private environment file:

   ```sh
   cp .env.helm-upload.example .env.helm-upload
   chmod 600 .env.helm-upload
   ```

2. Generate a hash for a **new chart administrator password**, using a Python environment with the backend requirements installed:

   ```sh
   python3 -c 'from getpass import getpass; from werkzeug.security import generate_password_hash; print(generate_password_hash(getpass("Chart administrator password: ")))'
   ```

   Set `HELM_UPLOAD_ADMIN_USER` and paste the hash into `HELM_UPLOAD_ADMIN_PASSWORD_HASH` in the private file. Preserve the surrounding single quotes so Compose does not expand the hash's `$` characters. The password you typed is what you enter in the UI; it is separate from the repository upload token. Choose a strong password; only this configured administrator can use these routes.

3. Set `HELM_UPLOAD_TOKEN` in that private file using the repository administrator's existing token. With your replacement SSH key configured locally, the existing retrieval command is:

   ```sh
   ssh nginx-helm "sudo sed -n 's/^HELM_UPLOAD_TOKEN=//p' /etc/helm-upload.env"
   ```

   Retrieve it only in a trusted terminal. Do not share its output, commit it, place it in frontend configuration, or run configuration/debug commands that print the resolved environment. The SSH key previously shared in chat should be replaced; Katana needs no SSH key or SSH access.

4. Rebuild/recreate the NBI with that environment:

   ```sh
   docker compose --env-file .env.helm-upload up -d --build katana-nbi
   ```

   If you already use another Compose environment file, retain it and supply `.env.helm-upload` last with another `--env-file`. The new dependency `requests-toolbelt` supplies streaming multipart encoding; ordinary `requests.post(files=...)` buffers the archive. Flask 3.1+ is required for the per-request size limits.

5. Build and serve the updated Angular frontend through your normal deployment process. For local development, its existing proxy now allows longer requests to `/api/helm`.

The maximum compressed chart size is `HELM_UPLOAD_MAX_BYTES` (default 104857600, maximum 100 MiB). Flask allows another 64 KiB for multipart headers, then checks the file's exact size. Multipart fields are limited and temporary upload files are closed on success/failure. The upstream connect/read timeouts default to 10/300 seconds. The Compose Gunicorn timeout is already 600 seconds. Requests' read timeout is an inactivity timeout, not a strict total wall-clock deadline.

## Reverse proxy and network access

If you have an Nginx reverse proxy **in front of Katana**, apply these limits to the chart route in its existing server block, replacing the upstream with your NBI address:

```nginx
location = /api/helm/charts {
    client_max_body_size 101m;
    client_body_timeout 300s;
    proxy_connect_timeout 10s;
    proxy_send_timeout 330s;
    proxy_read_timeout 330s;
    proxy_pass http://katana-nbi:8000;
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;
}
```

The 101 MiB proxy request limit includes multipart overhead; Flask enforces the exact file limit. Keep authorization headers and request bodies out of proxy/debug logs. This is configuration for Katana's incoming requests, separate from the chart repository's existing Nginx upload route. No reverse proxy deployment is managed by this checkout, so apply/reload that configuration on your actual proxy if present.

From the actual NBI runtime, verify access to `http://10.160.101.73/index.yaml`. The repository upload allowlist in the handoff permits `10.160.101.0/24` and `143.233.227.69`; it must allow the NBI's actual source IP, including any NAT. An accessible index alone does not prove permission to upload. No GitHub Actions runner is involved in this path.

## Behavior and troubleshooting

- The repository validates the chart, saves it and regenerates the index. Uploading does not deploy a chart, update an OSM descriptor, or change any existing slice. The name/version come from the uploaded archive's `Chart.yaml`, not its filename.
- Existing versions return `409`; bump the chart version and package again for changed contents. No upload is automatically retried, and redirects are not followed. After a timeout, refresh the catalogue before retrying because the first upload may already have completed.
- Katana `401` means the dedicated administrator login failed. Upstream `401`/`403` become safe `502` messages identifying a repository credential or source-IP configuration issue. Size/type/validation errors remain `413`/`415`/`422`; invalid metadata or upstream failures return `502`; network failures return `503`.
- Every chart request gets `X-Request-ID`; error JSON also includes `request_id`. Upload errors show that ID in the UI. Logs contain the administrator, sanitized filename, size, upstream/local status, chart/version on success and duration, not passwords, authorization headers, token values or archive contents.
- The catalogue is read afresh with no application cache, including after upload. Metadata is rendered as text and download links are restricted to HTTP(S). The Angular app uses Fetch, which does not emit upload-progress events; this page displays an indeterminate uploading indicator until the backend responds.
- Disable the feature with `HELM_UPLOAD_ENABLED=false` and recreate the NBI if rollback is needed. Previously published charts remain in the repository.

## Checks

With Flask, Requests, requests-toolbelt and PyYAML installed:

```sh
python3 -m unittest discover -s Backend/tests -p test_helm_upload.py
```

From `Frontend/katana-slice-manager`:

```sh
npm test -- --watch=false --include='src/app/pages/helm-charts-page/*.spec.ts'
npm run build
```

The API tests exercise real Flask requests with mocked repository responses, including streamed multipart encoding, large-file spooling, authentication, validation, errors, cleanup, token-safe responses/logs and catalogue ordering. The UI tests cover the actual HTTP service and page flow. A live upload still requires configured credentials and network access; publish a uniquely versioned disposable chart, verify its index entry/download digest, then have the repository administrator remove that test version if needed. Do not remove production versions.
