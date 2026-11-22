# Carehold — Cloudflare production release (prepared, NOT authorized)

> **Current gate:** The staging release log confirms 138 Node tests, 40 Python tests, a successful TypeScript/Vite build, all 16 staging migrations, and an HTTPS D1 readiness check on commit `6583556`. This verifies deployment mechanics, **not** real-world browser acceptance, recovery, clinical/minor privacy, or external security review. New commits after that release require a fresh `npm run verify:pre-e2e`. PR #1 remains a draft and is not merged into `main`. A successful build or staging deployment does **not** authorize storing real family, minor, medication, or therapeutic data in production.

## Go/no-go criteria — before any real data

- [ ] Final `feat/carehold-mvp-foundation` PR reviewed and merged to `main`.
- [ ] `npm run verify:pre-e2e` passed on that exact commit.
- [ ] Manual `docs/E2E_ACCEPTANCE.md` completed on desktop and iPhone/installed PWA with **fictional data**: registration/invites, adult/teen/child access, medication corrections, direct/Words encryption, saved recovery code, original-browser legacy migration, private journal and drafts on another browser, conflicts, logout/session behavior, access revocation, and push.
- [ ] The same release was tested over **HTTPS in an isolated Cloudflare staging Worker + D1**, including passkeys whose RP ID matches that staging host, seeded only with fictional records.
- [ ] Independent security/privacy review has resolved known blockers documented in `docs/SECURITY.md` and `docs/RECOVERY_ARCHITECTURE.md`: unauthenticated public key substitution, independently revocable device keys, minor/guardian privacy and consent, recovery-code loss/rotation, retention/deletion/export, backups and incident handling. **These items are not implemented/reviewed merely because this release script exists.**
- [ ] Backup/export tested for recoverability and an incident/rollback plan written down. D1 migration is **not** automatically rolled back by deploying a previous Worker.

If these cannot be satisfied, use only isolated staging with fictional records; do not call Carehold approved for real sensitive data.

## 1. Choose the final production HTTPS origin

Passkeys bind to `APP_ORIGIN`'s hostname. Choose the durable hostname before enrolling any real passkeys. Changing the hostname later means passkeys for the old relying-party ID may not work on the new one. A `workers.dev` address and a custom domain are different RP IDs.

In your own Cloudflare account:

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 create carehold-production
```

If a `carehold-production` database already exists, do **not** create a second one; use `npx wrangler d1 list` to find its real UUID. Then run:

```sh
npm run configure:production
```

Enter the newly created **production** D1 UUID, a final production HTTPS origin, and confirm with `CONFIGURE PRODUCTION`. This wizard changes only the local `env.production` portion of `wrangler.jsonc`; it does **not** touch staging, access secrets, execute migrations, modify DNS or deploy. Prefer a durable, final custom domain if it is already routed to the Worker; otherwise your account's unique production workers.dev origin can be used, but changing domains later will require a passkey migration. No trailing slash or path. Do not guess the origin. The D1 binding must stay named `DB`, not the suggested `carehold_production`.

The generated configuration is a tracked source file. Review and commit its nonsecret production D1 UUID/origin on the feature branch, then include that commit in the reviewed PR before merging into `main`. **Do not** commit `.dev.vars`, secret values, database SQL exports or real family data. Production's release script will deliberately refuse a dirty worktree or a local `main` not synchronized with `origin/main`.

The production Worker name must be `carehold-production`. Staging and production must have **different D1 IDs, secrets, Workers, and origins**. The production guard checks these properties before any remote command.

## 2. Configure production-only secrets

Use Cloudflare Wrangler's interactive secret input, never source code, `vars`, chat, or a shell command that exposes the values in history:

```sh
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put PILOT_ACCESS_CODE --env production
```

Use a separate high-entropy `BETTER_AUTH_SECRET` of at least 32 characters and a separate unpredictable `PILOT_ACCESS_CODE` of at least 16 characters. Retain the auth secret securely: unexpected rotation can invalidate login sessions. For push notifications, configure separately generated `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`; do not replace active VAPID private keys without a re-enrollment plan. Test iOS PWA permission prompts, delivery and device display.

Verify in the Cloudflare dashboard that you selected the intended account and production Worker. The local preflight **cannot** verify credentials, Cloudflare account, DNS, or that the secrets actually exist.

## 3. Verify the configuration without deploying

```sh
npm run preflight:production
```

This is safe to run even while `env.production` retains placeholders. It **must fail** until a real UUID and HTTPS origin are configured. Do not bypass the guard by copying staging or local D1 settings.

## 4. Release only after go/no-go sign-off

The release script intentionally refuses to run from the draft feature branch, a dirty worktree, or a local `main` differing from `origin/main`.

```sh
git switch main
git pull --ff-only
npm run release:production
```

The interactive release command checks prod target isolation, fetches the latest `main`, runs all tests/typecheck/build, requires explicit **E2E REVIEWED**, **SECURITY REVIEWED**, and **DEPLOY CAREHOLD PRODUCTION** confirmations, checks Cloudflare identity, makes a private gitignored production D1 SQL backup, applies only production migrations, deploys a fresh Worker build, then calls `/api/health/ready`.

Do not confirm a release gate that has not actually happened. This workflow deliberately does **not** auto-merge a PR, change remote secrets, create a database, or deploy on your behalf.

## 5. Verify the live release before onboarding

- `GET https://YOUR-PRODUCTION-ORIGIN/api/health/ready` returns `{"ok":true,"product":"carehold"}`. A `503` means the D1 binding or required schema is not ready; stop.
- Create a new fictional test account using the protected pilot code, add a passkey, sign out/back in, verify private-profile permissions and forbidden access.
- Save/recover the encryption key on a **second browser**, confirm intentional sharing and journal encryption, check the UI on iPhone Safari and installed PWA.
- Inspect Worker and D1 errors without logging any medication, journal plaintext or secrets; validate backup retention, key/recovery procedures, and monitoring.
- Only when the independent release gates are satisfied may real family information be migrated or recorded. Otherwise remain in fictional-data staging.

## Emergency stop / rollback boundaries

If a deployment fails after remote migrations, do **not** assume redeploying an older Worker reverses its schema. Stop writes, review the last production D1 export (private, unencrypted SQL), investigate migrations, and plan a verified restore. Existing devices must keep their browser/IndexedDB original encryption keys until recovery is verified; do not clear site data to force a restart.

A web-authenticated session is not equivalent to independent revocation of encryption keys already imported by a device. Encryption and minors' privacy must be reviewed separately from the deployment process.

## Limited production pilot versus real sensitive records

A separate production Worker, account-specific pilot access code, and D1 database can be configured **without authorizing real confidential data**. HTTPS availability, passing unit tests and being behind a pilot code do not establish that Carehold's privacy and encryption architecture is safe for medical/child/therapeutic records. Keep staging as the test environment and complete fictional-data browser checks on the final production origin before any real-data decision.

**Do not type `SECURITY REVIEWED` or `E2E REVIEWED` in the release script unless those activities have actually been completed and documented.** This runbook intentionally does not offer a test-mode override for a production deployment. If the release review is unfinished, keep improving staging; do not bypass or weaken the safeguards. The `release:production` script is a deployment mechanism, not security certification.
