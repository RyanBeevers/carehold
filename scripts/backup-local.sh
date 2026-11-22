#!/usr/bin/env bash
# Personal dev backup only: this export includes account, medication, and ciphertext data.
# Never commit or publish this file. It is NOT an encrypted backup.
set -euo pipefail
umask 077
mkdir -p backups
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="backups/carehold-local-${timestamp}.sql"
npx wrangler d1 export carehold-local --local --output="$destination"
chmod 600 "$destination"
printf '\nLocal Carehold D1 backup created: %s\n' "$destination"
printf 'Contains sensitive data and authentication records; store it securely.\n'
printf 'This protects the local D1 database only. Device-local journal encryption keys and entries are NOT included.\n'
