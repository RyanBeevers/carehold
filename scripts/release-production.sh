#!/usr/bin/env bash
# MANUAL release only. Never run on an unreviewed feature branch or with real
# family/clinical data before security, privacy and account-recovery gates pass.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077

printf '\n== Carehold production release guard ==\n'
npm run preflight:production

if [[ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]]; then
  printf 'Production requires a reviewed/merged main branch. This draft feature branch is not deployable.\n' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Production requires a clean Git worktree, including committed Cloudflare target config.\n' >&2
  exit 1
fi
printf 'Confirming main matches the latest remote commit...\n'
git fetch origin main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  printf 'Local main differs from origin/main. Review and sync before deployment.\n' >&2
  exit 1
fi

npm run verify:pre-e2e
if [[ ! -t 0 ]]; then
  printf 'Production release requires an interactive operator, not automation.\n' >&2
  exit 1
fi
printf '\nNo code review or automated test can establish production safety for real family/medical content.\n'
printf 'Do not continue without tested recovery, authenticated E2E, minor-privacy/legal and independent security review.\n'
read -r -p "Type E2E REVIEWED if your full local + staged cloud E2E passed on this exact code: " e2e
if [[ "$e2e" != "E2E REVIEWED" ]]; then
  printf 'Production release cancelled before any remote write.\n'
  exit 1
fi
read -r -p "Type SECURITY REVIEWED if outstanding confidentiality/revocation, minors/privacy, backup and incident-response release gates were reviewed and approved: " security
if [[ "$security" != "SECURITY REVIEWED" ]]; then
  printf 'Production release cancelled before any remote write.\n'
  exit 1
fi

printf '\nConfirming Cloudflare account and Worker target...\n'
npx wrangler whoami
origin="$(node --input-type=module -e 'import{readFileSync}from "node:fs";const c=JSON.parse(readFileSync("wrangler.jsonc","utf8"));process.stdout.write(c.env.production.vars.APP_ORIGIN)')"
printf '\nPRODUCTION D1: carehold-production\nPRODUCTION origin: %s\n' "$origin"
read -r -p "Type DEPLOY CAREHOLD PRODUCTION to back up D1, migrate and deploy: " approved
if [[ "$approved" != "DEPLOY CAREHOLD PRODUCTION" ]]; then
  printf 'Production release cancelled before any remote write.\n'
  exit 1
fi

mkdir -p backups
backup="backups/carehold-production-$(date -u +%Y%m%dT%H%M%SZ).sql"
printf '\nExporting the complete production D1 database before migrations...\n'
npx wrangler d1 export carehold-production --remote --env production --output="$backup"
chmod 600 "$backup"
printf 'Database backup saved at %s — contains auth records and potentially sensitive data.\n' "$backup"

printf '\nApplying the reviewed production D1 migrations...\n'
npx wrangler d1 migrations apply carehold-production --remote --env production

printf '\nBuilding fresh assets from verified main and deploying production Worker...\n'
npm run build
npx wrangler deploy --env production

printf '\nSmoke-checking production schema readiness (not a functional security review)...\n'
curl --fail --silent --show-error --max-time 20 "$origin/api/health/ready"
printf '\nProduction health endpoint passed. Confirm passkeys, signup restrictions, profile authorization, backup/recovery and monitoring in browser.\n'
printf 'Retain the private D1 export securely. Migrated schema cannot be automatically rolled back by deploying an older Worker.\n'
