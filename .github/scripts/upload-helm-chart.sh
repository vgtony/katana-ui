#!/usr/bin/env bash
# Use a CI secret or a locally exported token; never retrieve credentials in CI.
set +x
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo 'Usage: bash .github/scripts/upload-helm-chart.sh CHART.tgz' >&2
  exit 2
fi
chart=$1
if [[ "$chart" != *.tgz || ! -f "$chart" || ! -s "$chart" || -L "$chart" ]]; then
  echo 'Error: provide one nonempty .tgz file.' >&2
  exit 1
fi
if (( $(wc -c < "$chart") > 104857600 )); then
  echo 'Error: chart exceeds the 100 MiB upload limit.' >&2
  exit 1
fi
if [[ -z "${HELM_UPLOAD_TOKEN:-}" || "$HELM_UPLOAD_TOKEN" == *$'\n'* || "$HELM_UPLOAD_TOKEN" == *$'\r'* ]]; then
  echo 'Error: HELM_UPLOAD_TOKEN must contain a nonempty, single-line token.' >&2
  exit 1
fi

# Quote curl's multipart filename syntax, including commas and semicolons.
chart=${chart//\\/\\\\}
chart=${chart//\"/\\\"}
# Read the authorization header from stdin so it is absent from curl's argv.
# Disable curlrc defaults; do not follow redirects or retry this POST.
if ! http_code=$(printf 'Authorization: Bearer %s\n' "$HELM_UPLOAD_TOKEN" |
  curl --disable --silent --show-error \
    --proto '=http,https' \
    --connect-timeout 10 --max-time 300 \
    --output /dev/null --write-out '%{http_code}' \
    --header @- --form "chart=@\"${chart}\"" \
    --url "${HELM_UPLOAD_ENDPOINT:-http://10.160.101.73/api/charts}"); then
  echo 'Upload failed: connection or transfer error. Check index.yaml before manually retrying.' >&2
  exit 1
fi

case "$http_code" in
  200|201) echo "Upload successful (HTTP $http_code)."; exit 0 ;;
  401) message='Repository authentication failed; check the Actions secret.' ;;
  403) message='Nginx rejected this runner; check its source IP against the upload allowlist.' ;;
  409) message='This chart name and version already exist; increment Chart.yaml version for a new release.' ;;
  413) message='The repository rejected the upload size (maximum 100 MiB).' ;;
  415|422) message='The repository rejected the chart package; check its archive and Chart.yaml.' ;;
  *) message='Unexpected repository response; check the endpoint and repository service.' ;;
esac
echo "Upload failed (HTTP $http_code): $message" >&2
exit 1
