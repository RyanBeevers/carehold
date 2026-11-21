# Local setup / first staging checklist

## What is ready

The repository contains a functional **source implementation** for the invite-only medication pilot, plus a styled PWA shell. It has not been installed, built, browser-tested, or deployed in the authoring environment because npm registry requests failed (DNS EAI_AGAIN). Do **not** input real health data until every preflight below passes in a private staging deployment.

## Local preparation

1. Use Node 22+ and Python 3 (for SQLite migration tests), then run `npm install` (commit the generated `package-lock.json` in the follow-up PR), `npm test`, `npm run typecheck`, `npm run build`. Fix all build/type errors before continuing. Do not assume the initial dependency ranges resolve without verifying.
2. Copy `.env.example` to `.dev.vars`, replace `BETTER_AUTH_SECRET` with a cryptographically random secret of at least 32 bytes and `PILOT_ACCESS_CODE` with a different long random string. Run `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` twice for two distinct values. Never commit `.dev.vars`.
3. Apply migrations locally: `npm run db:local`. The zero UUID D1 database in the local `wrangler.jsonc` config is only a **local placeholder**; replace it with a real database ID for any remote environment. Validate `migrations/0001_auth.sql` against the installed Better Auth **1.7.x + passkey plugin** schema, using the official CLI/check-schema tooling. If the schema differs, create a reviewed migration; do not disable schema validation.
4. Generate a Web Push VAPID pair with `node --input-type=module -e 'import {generateVapidKeys} from "@mmmike/web-push/vapid"; console.log(await generateVapidKeys())'`. Place the public key in `VAPID_PUBLIC_KEY`, private key in `VAPID_PRIVATE_KEY`, and a real sender `mailto:` address in `VAPID_SUBJECT`, all in `.dev.vars` (not in Git). Confirm the package's Web Push encryption and Worker compatibility before deploying.
5. Build the static shell with `npm run build`. Start API with `npm run dev:worker` (port 8787). In a second terminal start `npm run dev` (Vite port 5173; `/api` proxy targets 8787). Vite binds **localhost only** and uses `strictPort: true` because passkey verification requires an exact origin; if 5173 is busy, Vite will stop with a port error rather than silently switch to 5174. **Open `http://localhost:5173`, not `http://localhost:8787` or 5174.** Wrangler can serve the built frontend on 8787, but WebAuthn rejects passkeys registered on 8787 because `APP_ORIGIN` is 5173. The Worker redirects HTML navigation from local Wrangler to the Vite frontend to avoid this mistake; the API and origin checks remain strict. If Better Auth still rejects proxy-origin cookies, inspect the actual `Host`, `Origin`, `APP_ORIGIN`, and RP ID; do **not** disable origin/CSRF validation.

### Vite says port 5173 is already in use

An earlier Carehold/Vite server or an unrelated local app is already listening on the required port. Do **not** use the fallback at 5174; Better Auth deliberately trusts only `APP_ORIGIN=http://localhost:5173`.

From a Mac terminal, run:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

Inspect the PID's command (`ps -p PID -o pid,command`) and close the corresponding terminal/server. If it is a stale process you recognize, run `kill PID` (replace PID with its actual numeric value), then start `npm run dev` again. Leave the Wrangler process on port 8787 untouched. You must see Vite announce `http://localhost:5173/` before attempting a passkey. Access Carehold via `localhost` (not a LAN IP, 127.0.0.1, or an alternate port) because WebAuthn checks the browser's actual origin.

### Passkey error: `Invalid origin: http://localhost:8787`

This occurs when the browser displays Carehold on the Wrangler preview origin instead of the configured Vite origin. Run both development servers and visit `http://localhost:5173`. Verify the browser address bar uses 5173 during **both** passkey option generation and verification. Do not try to fix this by adding all localhost ports to `trustedOrigins`, disabling origin checks, or changing the RP ID. A registration rejected during verification does not require database resets or account recreation. The local HTML redirect guard is deliberately limited to `localhost:8787` → `localhost:5173` and never runs in staging or production.

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

## Role-aware prompt and single-entry invitation regression (2026-11)

Apply `npm run db:local` **after pulling**; migration `0003_audience_invites.sql` adds non-privileged account prompt audiences and a pending invitation reference table. Local data is preserved; do not recreate your test account or D1 database. Do not run remote migrations without authorization.

- Existing test accounts with passkeys will be prompted once to choose **Parent / caregiver**, **Child** or **Teen**. This is the prompt audience, **not** a role that grants access to any profile or care records. It is editable in Settings. A new parent/caregiver can create a care circle; child/teen audiences must join by invitation.
- New invited user: create a one-time invitation, sign out, create a new fictional test account with **that code once** and a chosen prompt audience, then add a passkey. The account stores only the invitation's database ID while waiting for passkey setup. After passkey registration, the app claims the original invitation automatically and joins the intended household; it does not require retyping. If automatic acceptance fails, the onboarding screen shows a **Finish joining** retry. Invitation expiry, revocation, one-use constraints and profile grants remain enforced.
- Existing signed-in users can still accept a new invitation under **Care circle** with the code. Don't mistake account audience for membership role or medication capabilities.
- Parent Words must show parent + shared prompts, never child/teen prompts. Child and teen libraries are distinct. Copy a prompt and confirm **Copied** beside the button; copy an invitation and confirm **Copied** inside the dialog. Failed clipboard access shows a nearby error and leaves the text selectable.
- Changes to a prompt audience do **not** grant new rights. Verify child/teen accounts cannot see unshared medication profiles or create a household; permission checks remain server-side.
- This pilot intentionally **does not collect dates of birth or offer doctor accounts**. DOB/age verification, guardian consent, teen age transitions, professional consent, clinical record access and encrypted communication remain release decisions. Self-selected audience is only a presentation preference. It is NOT age verification or evidence of guardian consent.
- After the browser checks, complete the two outstanding tests: real mobile layout/contrast/navigation and real opt-in push delivery on an installed supported device. The cron warning in Wrangler local dev is expected.

## Local push setup and real delivery smoke test

The Settings notification button does **not** register a device until all three VAPID values exist. This is deliberate: it should now show a local, actionable error rather than silently failing.

1. From the `carehold` project directory, run `npm run push:setup -- --contact you@example.com`, replacing the address with an actual contact mailbox you control. The command writes a fresh VAPID pair and `mailto:` subject into the **gitignored** `.dev.vars` file, without printing the private key. It will not overwrite existing keys. If keys already exist, inspect their configuration locally instead of rotating them.
2. Restart `npm run dev:worker` (Wrangler reads secrets at startup). Leave Vite on **5173**. Refresh `http://localhost:5173`.
3. In **Settings → Gentle reminders**, confirm configuration is ready, click **Enable reminders**, grant browser/OS permission, then click **Send test notification**. This calls the authenticated, 60-second-rate-limited push endpoint; the response reports how many push services accepted the send. **Acceptance is not proof of device display**—verify an actual system notification appears.
4. If permission was denied, adjust browser and operating-system site notification settings; the app cannot re-prompt a blocked site. On iOS, test an actual HTTPS origin and installed Home Screen app; `localhost` on a desktop cannot validate iOS delivery.
5. Pausing disables household delivery preference, not the underlying device subscription. Never put medical names, prescriptions, profile names or communication text in lock-screen push payloads.

## Account-to-profile identity linking

From **People**, a household owner can link an adult/child medication profile to an **existing household member account**. Pets cannot be linked. One account may be linked to at most one profile **per household**. Link/unlink changes are audited. A member must first be invited and joined (with passkey) before the link can be made. Revoking a household member also clears their profile link while preserving the audit record.

**This is identity association only, not automatic permission:** the linked account gains no new ability to view or manage medication history or private content. The owner must still share profile-level medication capabilities explicitly through the invitation/grant mechanism. Link permissions and caregiver permissions are independent. Future private journaling will require independent recipient consent and E2EE before any sharing.
