# Publish packaged Helm charts to Nginx

Target repository: `vgtony/free5gc-chart`, branch `ueransim-free5gc`. The workflow checks out the repository where it runs; the repository owner/name is not hard-coded. If the repository moves, copy these files and configure its runner and secret. Change `on.push.branches` if the publishing branch changes.

## Install the workflow

Copy `.github/workflows/upload-helm-chart.yml` and `.github/scripts/upload-helm-chart.sh` into the chart repository, preserving their paths. Also copy this guide and `.github/scripts/check_helm_upload.py` for documentation and the local check. Commit them on `ueransim-free5gc`. To enable the manual **Run workflow** button, the workflow must also exist on the repository's default branch, currently `main`.

The automatic trigger uploads added or modified `dist/*.tgz` files in each push to `ueransim-free5gc`. It sends the committed archive unchanged; it does not repackage the source. Other files, deleted archives and vendored dependencies under `charts/` are not uploaded. Creating a package on your laptop alone does not trigger GitHub Actions.

## Set up a runner on the private network

Use a dedicated Linux VM on the trusted network/VPN with a route to `10.160.101.73`, running as an unprivileged user. A normal GitHub-hosted runner cannot reach this private address without additional networking. This workflow expects the labels `self-hosted`, `linux`, and `helm-upload`.

1. On the runner VM, install Git, Bash, curl and CA certificates. For Ubuntu/Debian:

   ```sh
   sudo apt-get update
   sudo apt-get install -y git bash curl ca-certificates
   curl --fail --show-error --connect-timeout 10 --max-time 30 http://10.160.101.73/index.yaml
   ```

2. In **vgtony/free5gc-chart → Settings → Actions → Runners → New self-hosted runner**, select Linux and your VM's architecture. Run GitHub's displayed download and configuration commands on the VM as the runner user. During configuration, add the custom label `helm-upload` and keep the default labels. The temporary runner registration token shown by GitHub is separate from `HELM_UPLOAD_TOKEN`.
3. From the runner installation directory, install and start its service:

   ```sh
   sudo ./svc.sh install
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```

4. Confirm the runner is **Idle** in GitHub. It needs outbound HTTPS access to GitHub; GitHub does not SSH into the VM. Restrict this runner to trusted workflows and do not run untrusted pull-request code on it.

The handoff lists Nginx upload access for `10.160.101.0/24` and `143.233.227.69`. Nginx must allow the runner's actual source IP. Reading `index.yaml` proves connectivity but does not prove upload permission. Keep the HTTP endpoint on the trusted network/VPN until HTTPS is available. See [GitHub's runner setup guide](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners) and [Linux service instructions](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application).

## Configure the upload token

Replace the SSH private key shared in chat and revoke the old key. Configure the replacement key in your trusted workstation's `nginx-helm` SSH alias. The workflow uses only the repository upload token; do not put an SSH private key in the repository or Actions.

Store the token as the **repository Actions secret** `HELM_UPLOAD_TOKEN`, under **Settings → Secrets and variables → Actions**. With the GitHub CLI installed and authenticated on your workstation, this copies the token directly without printing it:

```bash
(
  set +x
  set -euo pipefail
  upload_token=$(ssh nginx-helm "sudo sed -n 's/^HELM_UPLOAD_TOKEN=//p' /etc/helm-upload.env")
  test -n "$upload_token"
  printf '%s' "$upload_token" | gh secret set HELM_UPLOAD_TOKEN --repo vgtony/free5gc-chart
)
```

Optionally set the repository **Actions variable** `HELM_UPLOAD_ENDPOINT` to change the destination, for example when HTTPS is configured. The default is `http://10.160.101.73/api/charts`; use the complete upload URL. See [GitHub's secret instructions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

## Publish your next `.tgz`

Put the new packaged chart in `dist/` at the chart repository root, then commit and push it. For example, after creating `free5gc-1.3.1.tgz`, run from your checkout of `vgtony/free5gc-chart` on `ueransim-free5gc`:

```sh
mkdir -p dist
cp /path/to/free5gc-1.3.1.tgz dist/
git add -f dist/free5gc-1.3.1.tgz
git commit -m "Publish free5gc chart 1.3.1"
git push origin ueransim-free5gc
```

`git add -f` intentionally includes this one release archive even if `dist/` is ignored. Use your actual filename and Git remote. Watch **Actions → Upload Helm chart** for the result. Keep `dist/` excluded in `.helmignore` when packaging from the chart repository root, so older packages are not embedded in new charts.

For a manual upload of an archive already pushed to GitHub, choose **Actions → Upload Helm chart → Run workflow**, select `ueransim-free5gc`, and enter the filename only, for example `free5gc-1.3.1.tgz`. The archive must exist under `dist/` on the selected branch. This also handles a new branch's first push, where the workflow deliberately avoids publishing every historical archive. See [GitHub's manual workflow instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

The uploader accepts nonempty `.tgz` files up to 100 MiB, sends multipart field `chart`, and accepts HTTP 200/201 as success. The repository validates the archive, saves it and rebuilds `index.yaml`; this does not deploy anything or change OSM descriptors. The uploaded chart's internal `Chart.yaml` determines its name/version, so changing only the filename does not create a new version.

| Result | Action |
| --- | --- |
| Job waiting for a runner | Start the runner and check all three labels. |
| 401 | Check or replace the `HELM_UPLOAD_TOKEN` secret. |
| 403 | Allow the runner's actual source IP in Nginx. |
| 409 | This name/version already exists. Bump `Chart.yaml`'s version and create a new package for changed contents. |
| 413 | Package exceeds the upload size limit. |
| 415 / 422 | Check that the archive is a valid packaged Helm chart. |
| Connection failure / timeout | Check routing and the service; inspect `index.yaml` before retrying because the server may already have saved the chart. |

Uploads are not retried automatically and redirects are not followed. With multiple files in a push, each is attempted once and any failure fails the job. If some succeeded, manually upload only the remaining files; rerunning the whole job will encounter `409` for the successful files. Response bodies are omitted from logs to avoid reflecting credentials.

## Local check

```sh
python3 .github/scripts/check_helm_upload.py
```

This uses Python's standard library, Git, Bash and curl against a temporary local HTTP server with a fake token. It checks multipart bytes, authentication, success/error statuses, no retries/redirects, input validation, secret-safe output and the actual workflow's push/manual file selection in a temporary Git repository. It never contacts the VM.
