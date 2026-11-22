#!/usr/bin/env bash
# GitHub Actions manual releases only. SQL is never uploaded without encryption.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
target="${1:-}"
if [[ "$target" != "staging" && "$target" != "production" ]]; then
  echo "Expected staging or production" >&2; exit 1
fi
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_EVENT_NAME:-}" != "workflow_dispatch" ]]; then
  echo "Use the manual GitHub Actions workflow, not this script locally." >&2; exit 1
fi
for required in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID D1_BACKUP_PASSPHRASE; do
  if [[ -z "${!required:-}" ]]; then echo "Missing required environment secret: $required" >&2; exit 1; fi
done
if [[ "${#D1_BACKUP_PASSPHRASE}" -lt 24 ]]; then
  echo "D1_BACKUP_PASSPHRASE must contain at least 24 characters." >&2; exit 1
fi
npm run "preflight:$target"
backup_dir="$(mktemp -d)"
trap 'rm -rf "$backup_dir"' EXIT
mkdir -p backups
filename="backups/carehold-$target-${GITHUB_SHA:0:12}-$(date -u +%Y%m%dT%H%M%SZ).sql.enc"
echo "Exporting $target D1 before applying any migration..."
npx wrangler d1 export "carehold-$target" --remote --env "$target" --output="$backup_dir/backup.sql"
test -s "$backup_dir/backup.sql" || { echo "D1 backup was empty" >&2; exit 1; }
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 -in "$backup_dir/backup.sql" -out "$filename" -pass env:D1_BACKUP_PASSPHRASE
test -s "$filename" || { echo "Encrypted backup missing" >&2; exit 1; }
echo "Encrypted $target backup prepared for the required artifact upload."
