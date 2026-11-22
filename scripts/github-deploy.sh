#!/usr/bin/env bash
# Called only after the workflow uploaded an encrypted pre-migration D1 backup.
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:-}"
if [[ "$target" != "staging" && "$target" != "production" ]]; then
  echo "Expected staging or production" >&2; exit 1
fi
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_EVENT_NAME:-}" != "workflow_dispatch" ]]; then
  echo "Only manually-dispatched GitHub Actions releases may run this script" >&2; exit 1
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Cloudflare environment credentials are missing" >&2; exit 1
fi
if [[ "$target" == "production" ]]; then
  if [[ "${GITHUB_REF:-}" != "refs/heads/main" ||
        "${CONFIRMATION:-}" != "DEPLOY CAREHOLD PRODUCTION" ||
        "${E2E_CONFIRMATION:-}" != "E2E REVIEWED" ||
        "${SECURITY_CONFIRMATION:-}" != "SECURITY REVIEWED" ]]; then
    echo "Production release guard failed" >&2; exit 1
  fi
  latest="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
  if [[ -z "$latest" || "$latest" != "${GITHUB_SHA:-}" ]]; then
    echo "Main moved after this workflow started. Cancel and launch a new run." >&2; exit 1
  fi
  npm run preflight:production
else
  [[ "${CONFIRMATION:-}" == "DEPLOY STAGING" ]] || { echo "Staging release guard failed" >&2; exit 1; }
  npm run preflight:staging
fi
echo "Applying $target D1 migrations..."
npx wrangler d1 migrations apply "carehold-$target" --remote --env "$target"
echo "Deploying prebuilt Worker and assets to $target..."
npx wrangler deploy --env "$target"
origin="$(node --input-type=module -e 'import {readFileSync} from "node:fs"; const config=JSON.parse(readFileSync("wrangler.jsonc","utf8")); process.stdout.write(config.env[process.argv[1]].vars.APP_ORIGIN)' "$target")"
echo "Checking $target D1-backed readiness..."
curl --fail --silent --show-error --retry 2 --max-time 20 "$origin/api/health/ready"
echo
echo "$target Worker reported ready. This is not a security approval or a rollback plan."
