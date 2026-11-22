# Carehold — from local E2E to Cloudflare staging

> **Status:** The repository has Cloudflare configuration and a release script, but this document does not mean it has been deployed. Do not use confidential family, medical, child or therapeutic content during the unaudited pilot.

## 1. Finish local verification

From the root of the repository:

```sh
git switch feat/carehold-mvp-foundation
git pull --ff-only
npm run db:backup:local
npm run db:local
npm run verify:pre-e2e
```

Both databases and logs must be inspected for unexpected plaintext or access grants. If TypeScript or the build fails, **do not deploy**. Run `npm run typecheck` to isolate compiler errors quickly. Every commit after a passing verification invalidates that earlier passing result.

## 2. Run local end-to-end testing

**New-account setup is now gated in this order:** create account, add passkey, generate a CH1 recovery code, save it externally, retrieve and verify it, then complete prompts/care circle. A fresh account must not reach Today, People, Words or Messages before verifying recovery. A second-browser login requires the saved code; no automatic reset or skipped recovery step is allowed.

Start two terminals:

```sh
npm run dev:worker
```

```sh
npm run dev
```

Open **http://localhost:5173** exactly. Other ports break the local passkey RP origin. Use two persistent browser profiles or devices with **fictional data**, not incognito profiles that discard IndexedDB crypto keys. Follow `docs/E2E_ACCEPTANCE.md` in full, especially:

- Separate test users, invitation/household enrollment, Adult/Teen/Child medication permissions and access revocation.
- Initial recovery code saved under **Carehold — Encryption Recovery Key** in Apple Passwords; switch to Passwords, let Carehold lock, sign in again and finish from the same encrypted pending envelope.
- Legacy key migration from the *original* browser, interrupted migration resume/cancel, independent recipient copies, and new-device recovery using the saved code.
- Private journal sync, legacy journal import, encrypted unsent drafts, simultaneous offline conflict resolution and tombstone deletion.
- Browser refresh/back/forward, PWA install, push permissions, mobile responsive layout, logout/account-switch and access-denial tests.

**Do not clear the original browser's site data or reset keys to bypass a failing recovery screen.** Record the failure and fix it.

## 3. Provision Cloudflare staging (one-time, after local E2E)

Cloudflare staging is a separate Worker and D1 database from production. Do not reuse the local or production database, tokens, secrets or access codes.

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 create carehold-staging
```

Run `npm run configure:staging` to enter the **real staging D1 database ID** and **exact HTTPS Worker origin** (e.g. `https://carehold-staging.<YOUR_ACCOUNT_SUBDOMAIN>.workers.dev`). The interactive command validates both, requires an explicit confirmation, changes only `env.staging` in `wrangler.jsonc`, and never requests a secret or deploys anything. Confirm your actual workers.dev subdomain in the Cloudflare dashboard; do not assume the example is yours. Keep the origin stable after enrolling passkeys because it sets the WebAuthn RP ID.

If you prefer to edit `wrangler.jsonc` yourself, replace `REPLACE_STAGING_D1_ID` and `REPLACE-STAGING-HOST` under `env.staging`, leaving production untouched.

To protect the app, configure two strong **environment-specific secrets**. Wrangler prompts for the values. Don't paste values into chat, commit them, put them in `vars`, or reuse the local development values:

```sh
npx wrangler secret put BETTER_AUTH_SECRET --env staging
npx wrangler secret put PILOT_ACCESS_CODE --env staging
```

- `BETTER_AUTH_SECRET`: a high-entropy secret of at least 32 characters that stays constant across deployments. Save securely.
- `PILOT_ACCESS_CODE`: a separate unpredictable secret of at least 16 characters that invited test users will enter for registration. Save it in a password manager before moving on.
- Push testing also needs separate staging `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` secrets. See `npm run push:setup` for local key setup; use distinct staging credentials. Without them, do not claim push has been tested.

Run the repository's configuration guard:

```sh
npm run preflight:staging
```

If it rejects placeholders or the intended hostname, fix `wrangler.jsonc` rather than bypassing the guard. Cloudflare may create the new Worker during the first secret provisioning; verify the selected account and staging name.

## 4. Release exactly the verified branch to staging

Use the **interactive** guarded command from your Mac. It does not touch production:

```sh
npm run release:staging
```

It will:
1. Validate staging host/D1 configuration.
2. Re-run all tests, TypeScript and Vite build.
3. Show the authenticated Cloudflare account and target.
4. Require you to type **DEPLOY STAGING**.
5. Export a private, gitignored staging D1 backup to `backups/` (do not publish: contains credentials and app records).
6. Apply the pending staging D1 migrations.
7. Build and deploy the staging Worker with the current `dist` assets.
8. Query the D1-backed `/api/health/ready` endpoint and **fail if the current schema is missing**. Verify the host in the browser.

A remotely applied migration is not automatically rolled back if the subsequent Worker deployment fails. Retain the database backup and inspect the failure before retrying.

Once the HTTPS origin is live, create **new fictional staging accounts** rather than copying local dev data. Confirm mandatory passkey → recovered-key setup before creating/joining a care circle, recovery code save/re-entry, sign-out, restoration on a different real device, and cross-household authorization. Exercise lost-code replacement only in the original trusted browser, preserving local IndexedDB; test migration 0016 with fictional messages, encrypted journals and synced drafts. Verify `/api/health/ready` returns `{"ok":true,"product":"carehold"}` (or stop on HTTP 503).

## 5. Production is a separate later gate

There is currently **no production deployment** in this workflow. Do not use the staging name, D1 ID, secret or origin as a production substitute. Cloudflare's `env.production` contains deliberate placeholders. A production go-live must separately address device-key authenticity and revocation, minor/guardian privacy and consent, safe recovery, backups and retention, vulnerability testing, incident handling, and production WebAuthn domain selection. A fail-closed production preflight and an explicitly approved release script are prepared in [the production runbook](CLOUDFLARE_PRODUCTION.md); they are **not** production approval. Passing functional E2E does not prove these security properties.

## Troubleshooting

- **Passkey origin invalid:** confirm `APP_ORIGIN` exactly equals the browser HTTPS origin and that the Worker name/subdomain is final.
- **Staging preflight blocks:** replace all `REPLACE_...` staging values only, verify real account and D1 ID, and rerun.
- **Account signup fails:** check staging `BETTER_AUTH_SECRET` and `PILOT_ACCESS_CODE` secret names, and that D1 migrations were applied.
- **No assets or stale UI:** run `npm run deploy:staging` only after a fresh passing `npm run verify:pre-e2e`; that script rebuilds assets before deploy.
- **Encrypted data unavailable:** restore with the saved code; never silently reset or replace an enrolled private key.
- **Automated tests fail:** stop before any remote command. A green run from an older commit does not verify the latest branch.
