# Local setup / first staging checklist

## What is ready

The repository contains a functional **source implementation** for the invite-only medication pilot, plus a styled PWA shell. It has not been installed, built, browser-tested, or deployed in the authoring environment because npm registry requests failed (DNS EAI_AGAIN). Do **not** input real health data until every preflight below passes in a private staging deployment.

## Local preparation

1. Use Node 22+ and Python 3 (for SQLite migration tests), then run `npm install` (commit the generated `package-lock.json` in the follow-up PR), `npm test`, `npm run typecheck`, `npm run build`. Fix all build/type errors before continuing. Do not assume the initial dependency ranges resolve without verifying.
2. Copy `.env.example` to `.dev.vars`, replace `BETTER_AUTH_SECRET` with a cryptographically random secret of at least 32 bytes and `PILOT_ACCESS_CODE` with a different long random string. Run `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` twice for two distinct values. Never commit `.dev.vars`.
3. Apply migrations locally: `npm run db:local`. The zero UUID D1 database in the local `wrangler.jsonc` config is only a **local placeholder**; replace it with a real database ID for any remote environment. Validate `migrations/0001_auth.sql` against the installed Better Auth **1.7.x + passkey plugin** schema, using the official CLI/check-schema tooling. If the schema differs, create a reviewed migration; do not disable schema validation.
4. Generate a Web Push VAPID pair with `node --input-type=module -e 'import {generateVapidKeys} from "@mmmike/web-push/vapid"; console.log(await generateVapidKeys())'`. Place the public key in `VAPID_PUBLIC_KEY`, private key in `VAPID_PRIVATE_KEY`, and a real sender `mailto:` address in `VAPID_SUBJECT`, all in `.dev.vars` (not in Git). Confirm the package's Web Push encryption and Worker compatibility before deploying.
5. Build the static shell with `npm run build`. Start API with `npm run dev:worker` (port 8787). In a second terminal start `npm run dev` (Vite port 5173; `/api` proxy targets 8787). Open `http://localhost:5173` using a browser with WebAuthn support. If Better Auth rejects proxy-origin cookies, inspect the actual `Host`, `Origin`, `APP_ORIGIN`, and RP ID; do **not** disable origin/CSRF validation.

## Staging isolation

Create a **separate** Cloudflare D1 database and Worker for staging. Update the `env.staging` database ID and `APP_ORIGIN` to the exact HTTPS staging origin. Configure secrets with `npx wrangler secret put BETTER_AUTH_SECRET --env staging` (and likewise `PILOT_ACCESS_CODE`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`). Staging secret values must differ from production values. Review migration output before running `wrangler d1 migrations apply carehold-staging --remote --env staging`.

Do not execute the staging deploy script or production migrations until specifically authorized. Do not put pilot codes in checked-in Wrangler vars or a public static frontend.

## Browser test plan — must pass before any household uses real data

1. Create an account with invalid access code: 403; with valid pilot code: account and session created. Trailing spaces in email are trimmed. Verify the passkey setup gate **actually blocks server API access**, not just the screen.
2. Register a passkey and sign out; sign in with email/password and with passkey. Verify WebAuthn works on the actual hostname and installed iOS/Android app. Verify a second user cannot list data from the first user's household.
3. Add a household, adult/child/pet profiles, one daily and one periodic medication, and a PRN. Confirm expected Today entries, including timezones and daylight saving behavior. DST nonexistent time fails closed; needs manual handling, not automatic recording.
4. Log a dose. Retry exact idempotency key (must return same event); submit a new key for same occurrence (409). Run concurrent submissions with two caregiver accounts—only one initial record may succeed. Log a correction and confirm original and correction in history with actor/timestamps.
5. Create caregiver invite for ONE profile; accept once. Confirm caregiver can view/record only authorized profile, and cannot manage medication or read another profile. Reject already-used/expired code and cross-household grants. Test revocation design before inviting external users.
6. Install PWA on iOS and Android. Enable notifications only after opt-in; verify OS/browser permissions, 5-minute cron trigger, non-sensitive lock-screen copy, delivery retry, duplicate prevention and switch-off. A push is **not guaranteed** or a medical device alarm.
7. Test light, dark and system appearance, keyboard-only operation, visible focus, touch targets, color contrast, dark-mode legibility, no horizontal overflow, and accessibility screen reader output. Test icon/favicon/Apple home screen icon on actual devices.
8. Test unauthorized requests, CSRF/cross-origin rejections, replay of invitations, malformed JSON, missing authentication, D1 outage, missing secrets, and logs for sensitive content. Review a reliable backup/restore process.

## Limitations to resolve before production

- Passkey challenge flow and generated Better Auth schema have not yet been runtime-verified.
- Email verification, password recovery, rate-limit hardening, caregiver role/grant editing UI, profile archival, enrollment of a child's own account, accessibility audit, and real mobile push delivery still need work.
- No encrypted journaling or messages are stored. `Words` is a **static prompt library**, not secure chat.
- The scheduler supports daily, weekdays, interval, and PRN; skipped DST local times require review. Complex prescriptions (tapers, alternating doses, etc.) need a future explicit scheduling model.
- Cloudflare cron notifications are best-effort. This app is a care log, not an emergency alert or clinical decision system.
