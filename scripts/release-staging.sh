#!/usr/bin/env bash
# Intentionally manual. Does not deploy production or use local D1 as remote.
# No credential or private data is echoed.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077

printf '\n== Carehold staging release ==\n'
npm run preflight:staging
npm run verify:pre-e2e

printf '\nChecking the Cloudflare account before any remote writes...\n'
npx wrangler whoami
origin="$(node --input-type=module -e 'import{readFileSync}from "node:fs";const c=JSON.parse(readFileSync("wrangler.jsonc","utf8"));process.stdout.write(c.env.staging.vars.APP_ORIGIN)')"
printf '\nRemote target: carehold-staging (D1), %s (HTTPS)\n' "$origin"
if [[ ! -t 0 ]]; then
  printf 'Release requires an interactive terminal and explicit confirmation.\n' >&2
  exit 1
fi
read -r -p "Type DEPLOY STAGING to back up remote D1, apply migrations and deploy: " approval
if [[ "$approval" != "DEPLOY STAGING" ]]; then
  printf 'Nothing was deployed.\n'
  exit 1
fi
mkdir -p backups
backup="backups/carehold-staging-$(date -u +%Y%m%dT%H%M%SZ).sql"
printf '\nBacking up the staging D1 database to a private local file...\n'
npx wrangler d1 export carehold-staging --remote --env staging --output="$backup"
chmod 600 "$backup"
printf 'Staging D1 backup saved locally (contains authentication and app records).\n'
printf '\nApplying staging migrations; no production database is targeted...\n'
npm run db:remote
printf '\nDeploying verified code and freshly built assets to staging...\n'
npm run deploy:staging
printf '\nDeployed staging Worker. Verify login, passkey, household isolation, recovery and API health before use.\n'
printf 'Check: %s/api/health\n' "$origin"
if command -v curl >/dev/null 2>&1; then
  if curl --fail --silent --show-error --max-time 15 "$origin/api/health"; then
    printf '\nStaging health endpoint responded successfully.\n'
  else
    printf '\nWARNING: The Worker deployed but the configured staging health URL failed. Check APP_ORIGIN, workers.dev/custom routes and deployment logs.\n' >&2
  fi
fi
printf 'Staging database backup: %s\n' "$backup"
printf 'This is a staging pilot deployment, not an independent security review or approval for confidential family data.\n'
