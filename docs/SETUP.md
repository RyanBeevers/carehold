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

## Banking-style inactivity lock and action feedback

Carehold uses `SESSION_IDLE_SECONDS=1800` and `SESSION_REFRESH_SECONDS=60` in **Better Auth**. A 30-minute sliding server-session grace period is independent of its three-minute visible inactivity screen lock and one-minute background lock. Automatic client locks clear and mask this tab's care state **without revoking the shared browser cookie**, because another tab may still be active. Explicit **Lock now** and **Sign out** revoke that session. Return from an automatic screen lock requires fresh passkey/password authentication; the screen lock alone does not invalidate the server cookie. OS/browser suspension can pause timers, so the visibility/pageshow check compares elapsed time on return. A guarded heartbeat runs only during recent user activity (not while idle or backgrounded). No session token or clinical information is persisted in browser storage.

**Manual browser tests before sensitive usage:**
1. Sign in with a test passkey and verify the Today/People UI. Leave the app untouched for >3 minutes. It should show `Carehold is locked` instead of any medication data. Clicking **Unlock with passkey** should use the platform authenticator and restore the care circle without typing an email/password.
2. Repeat with the tab/app backgrounded for >1 minute, then return. It must be locked immediately on return, not only when the delayed timer eventually fires.
3. Keep interacting with Carehold for >3 minutes and confirm the server session stays alive and actions work. Verify the API rejects previously authenticated care-data requests after expiry/sign-out (including from another tab). Any stale, in-flight API response must not re-open the sensitive UI without fresh authentication.
4. After lock, try **Use email and password instead**; check that it requires explicit sign-in and does not show previous profiles first.
5. Test both Light/Dark and desktop/mobile screens, including passkey prompts and switching away briefly (<1 minute). Verify changing appearance or recording a dose does not unexpectedly sign out.
6. Trigger an error on a page action while scrolled far down: an accessible, dismissible toast should appear in the visible viewport without scrolling. Form-level errors in sign-up, lock, and dialogs stay inline. Notification permission/configuration errors stay beside the Settings control.

**Caveat:** Browser focus/background detection cannot replace a native OS lock and cannot prove another app is secure. A brief network outage may delay server-side sign-out, but protected APIs stop accepting the expired session. Do not call the privacy posture audited until tested on real supported devices and security reviewed.

### One-time session migration

Migration `0005_revoke_legacy_sessions.sql` deliberately revokes **all existing login sessions** after replacing the former 7-day default. This is important because changing Better Auth's `expiresIn` does not necessarily shorten sessions that were already issued under the old policy. After `npm run db:local`, users will need to **sign in again once** with their existing passkeys/passwords; medication, household and account data are not deleted. This migration is not approved for remote execution without reviewing its effect on all currently signed-in users.

## Push troubleshooting: accepted is not displayed (2026-11-21)

The server's `/api/push/test` reports only whether the upstream Web Push service accepted the encrypted message. The service worker now uses a **unique per-test tag** (avoiding replacement/collapse of previous notifications) and can send ephemeral, non-sensitive status messages to an open Carehold tab: `received`, `display-requested`, or `display-error`. These messages contain only the randomly generated test ID. They are **not** stored or logged.

In Settings → Gentle reminders:
1. Click **Test local display** to call `ServiceWorkerRegistration.showNotification()` without an upstream push service. If this reports success but macOS shows nothing, check macOS **System Settings → Notifications** for Chrome or the installed Carehold PWA, its alert style and **Focus / Do Not Disturb** settings; also check Notification Center. Browser permission `granted` does not prove OS display.
2. Click **Send push test**. After the gateway reports acceptance, inspect **Delivery diagnostics**. If the service worker reports **received**, the push reached the browser; if **display requested**, `showNotification()` completed, but macOS visibility still isn't proved. If **not observed**, check that Carehold's browser tab is open, service worker is active and controls the origin, browser push subscriptions are current, and the browser has network connectivity. The service-worker message is best-effort and may be missed if no matching page is open.
3. If a test is run again within 60 seconds, the authenticated server cooldown intentionally responds 429. Wait before retrying. Do not rotate previously generated VAPID keys just to troubleshoot.
4. On macOS Chrome 152+, installed PWAs can appear as their own app under System Settings → Notifications, distinct from Chrome. Use a real installed device to confirm banner display.

This diagnostic explicitly does **not** include patient names, medication names, subscription endpoints, push keys or journal content.

## Next feature slice: identify a linked self profile without granting care access

The `GET /api/me/linked-profile?householdId=...` endpoint returns at most one **self-linked** profile name/kind and booleans for explicitly granted schedule, dose-recording and history capabilities, after rechecking membership. It returns no medication records and does not infer access from `linked_user_id`. The **People** page displays a `My care profile` summary only when this self association exists. The button to open the person's medication view appears **only** with `view_schedule` permission; other users receive a truthful explanation rather than new access.

Regression: invite a fictional teen user into the household **without any grants** and link them to a profile. They should see the identity association but **no medication details**. After an owner explicitly invites/grants the view capability, confirm the medication view is accessible. Revoke membership and verify the association is cleaned up. Do not test with real health or minor data.

This lays the identity foundation for private communication but does not enable new storage, encryption keys, journals, clinical referrals or messages.

## Words drafting prototype (local-only)

The existing Words prompts now have **Write with this**. In **Words → Try writing**, make a fictional draft and preview individual recipient selection; default is **Just me**. This feature **cannot save, send, encrypt or recover writing** and must not be tested with real confidential content. An intentional Clear draft flow uses inline Keep/Discard. Leave Words, lock, sign out or switch accounts: the draft disappears. Only a small, authenticated recipient-name lookup uses the Worker; typed content never enters a request. For child/teen viewers, recipient preview shows only care-circle owners.

Regression: parent / teen / child prompt audiences, no cross-audience prompts, in-progress draft preserved when selecting another prompt, no recipient retained after returning to Just me, unauthorized household recipient lookup denied, and no health data or plaintext writing in network requests.

Mac push still requires real native delivery validation, and phone push should be tested **only after a staged HTTPS deployment**, compatible installed PWA setup and notification permissions. Do not treat upstream acceptance as delivered.

## Direct URL navigation and returning after sign-in

Carehold uses explicit, non-sensitive routes: `/today`, `/people`, `/words`, `/circle`, and `/settings`. The legacy `/` route normalizes to `/today`. Sidebar and mobile navigation use real anchor links, preserve browser Back/Forward, support native Open in New Tab and update the URL without a full reload. Page state initializes from `window.location.pathname`.

The URL is deliberately retained when locked, signed out or held behind passkey/account/household gates. After authentication and successful household loading, Carehold returns to the **same page** (not automatically Today). It never uses the URL to grant access and does not put patient/profile IDs, household IDs, drafts, medication details or recipients in the URL.

`wrangler.jsonc` now enables `assets.not_found_handling="single-page-application"` while keeping `run_worker_first=["/api/*"]`: direct requests to `/words` and other page routes should serve the SPA on staging/production and still protect the API. The Vite dev server supports page reloads automatically.

**Manual checks:**
1. Navigate to People, Words, Care circle and Settings; confirm the address bar changes and mobile/desktop active links follow.
2. Refresh on `/words` and `/settings`; verify the same page returns after authentication, never the Today default.
3. From `/words`, lock / wait for the idle timeout / sign out. Confirm the URL remains `/words`, the app masks data until real sign-in, and post-login returns to Words.
4. Use browser Back/Forward across pages; test a copied `/people` link opened in a new tab and direct `/circle` refresh on the Worker-served build.
5. Visit `/`, `/words/` and an unknown path; confirm canonical safe navigation goes to a known page and no data is exposed before authentication.
6. Verify leaving the local-only Words studio or refreshing still **discards** its fictional writing. Encrypted autosave is a documented next phase, not part of this routing patch.

### PWA relaunch at the manifest root (navigation-only preference)

An installed PWA can reopen at `/` instead of its last on-screen route. To avoid returning to Today in that case, Carehold remembers only a **single public page label** (`today`, `people`, `words`, `circle` or `settings`) under the browser preference key `carehold-last-page`. When `/` is opened again, the app restores that page and replaces the URL with its canonical path. A direct URL such as `/settings` always overrides the saved page. Missing, invalid or blocked local storage falls back to Today without errors.

This browser preference is not per-account, but it contains no household ID, patient identity, medication information, writing, recipient information, credentials or access token. Every protected screen still requires current authenticated access. It does **not** restore unsaved Words drafts, which remain intentionally nonpersistent until encrypted autosave is ready.

## Device-local encrypted autosave prototype (fictional writing ONLY)

In Words, click **Enable encrypted device autosave** once per account and care circle, then type a fictional draft. A nonexportable AES-GCM key and encrypted draft are kept in IndexedDB `carehold-words-local-v1`, and writing is automatically saved locally after a short delay. Reload or unlock Carehold to restore it on the same browser/device. This is **opt-in and experimental, NOT a finished confidential journal**. The device-held key can be used by scripts running on this origin. Clearing browser data loses the draft; no cross-device sync, key recovery, real message sending, or E2EE is implemented.

Review `docs/PRIVATE_WORDS_PHASE.md` for threat limitations and the manual regression checklist. The new feature requires **no D1 migration**, no additional npm dependencies and no remote deployment. Test with fabricated writing only.

## Experimental direct messages — local test procedure (fictional copy only)
This functionality is source-only pending manual verification and security
review. It **does not** authorize staging/production or real sensitive content.

1. On the same feature branch, run `git pull`, `npm install`,
   `npm run db:local`, `npm test`, `npm run typecheck`,
   `npm run build`. Migration 0006 adds only new messaging tables.
2. Run `npm run dev:worker` and `npm run dev` in separate terminals.
   Keep `http://localhost:5173` as the sign-in origin for passkeys.
3. Create two **throwaway accounts** in the same household via the existing
   invitation flow. Sign in to each in separate browser profiles/incognito
   windows and go to **Messages** once on each browser. This creates its
   individual nonexportable message key and registers the public JWK.
4. On the owner's Messages screen, select the invited account and start a
   conversation. Choose Guided prompts; try category and relationship filters,
   Another prompt, Use and edit, then **Send intentionally**. Do not enter
   real family or health details.
5. On the recipient's browser, open the same conversation, refresh replies,
   and verify the test message decrypts. Write a fictional reply and send.
   Check that the owner receives the reply, but sees no read/typing/draft
   status or acknowledgment. Verify the sender can see their own copy.
6. Begin a fictional reply, enable experimental encrypted device autosave,
   wait for saved state, then refresh or lock and reauthenticate. The draft
   should recover on the same device without becoming visible to the sender.
   Test Discard, two-tab conflict choices and different account isolation.
7. Negative tests: a third unrelated authenticated account must receive a
   denial on the thread API; a member must not access a sibling's thread;
   a caregiver medication grant alone must confer no message access; member
   revocation must close the old thread, and reinvitation must not restore it.
   The privacy checks require server/API verification, not UI inspection alone.
8. Inspect D1 in the local database: `encrypted_message_copies.envelope_json`
   should contain only version, ephemeral public key, IV, salt and ciphertext;
   `encrypted_messages` has only IDs/hash/timestamp. Inspect Network and
   Worker logs: no message plaintext, draft text or sensitive push payloads.
9. Do **not** clear the only enrolled test device's site data expecting messages
   to remain decryptable. Recovery and key rotation are not implemented.

Known blockers: no authenticated key verification, no multi-device/recovery,
no independently audited E2EE, no completed end-to-end authorization testing,
no minors/consent legal approval, no group threads or message push. Keep PR
draft and keep staging/prod unmodified until explicitly approved.

### Manual test checklist recording
Record the actual test outcome separately for each browser/account (pass, fail,
not run). Publishing source code and unit-test fixtures is not evidence that
browser integration or the crypto recovery policy has passed. Include the
failing console message and route, but redact all tokens and private writing.

## Journal-first Words test branch (not deployed)
The draft feature branch includes local-only migrations `0007_shared_words_activity.sql` and `0008_word_push_preferences.sql`. Run `npm run db:local` on an existing local dev database; remote migrations require a separate explicit deployment decision. Run `npm test && npm run typecheck && npm run build` and inspect errors before staging. Start Worker with `npm run dev:worker` and UI with `npm run dev`, using `http://localhost:5173` (not a different host, to preserve the passkey origin).

All shared-space participants must visit Words or Messages once on their own device to register an experimental public key. Sign in using fictional test accounts, share a prompt or fictional journal snapshot to 1–10 selected members, verify reflection and discussion posting, recipient-only unread counters, and optional generic push. Words push has an independent default-off opt-in under Words → Activity and requires an existing push subscription from Settings. No remote migration, merging or deployment was performed by these code changes. See `docs/PRIVATE_WORDS_PHASE.md` for privacy gates and the full manual acceptance checklist.

## Lost CH1 recovery code on an original trusted browser (migration 0016)

This experimental feature requires a complete **local D1 backup before changing anything**. Keep the original browser profile and its IndexedDB keys intact. On the latest developer branch run `npm run db:backup:local`, `npm run db:local`, and `npm run verify:pre-e2e` before opening Settings. Restart the Worker after applying the migration.

In **Settings → Encrypted data recovery**, a recovery-configured account whose current browser still has its original decryption key and journal key shows **Replace lost recovery code**. Generate a new CH1 code, save it in a separate password-manager entry or secure offline place, and verify the code from that saved entry before starting. Carehold stages browser-encrypted copies of the user's authorized messages, Words posts, synced journals and synced drafts. It will refuse to finalize if it cannot locate or verify an older synced draft or any encrypted source, and the original browser remains the recovery anchor. Do not clear keys or delete rows to make the migration pass.

After successful replacement, test a **separate persistent browser profile** with fictional content and the newly saved code. Confirm old direct and Words history, journal entries and drafts open. It does not migrate local-only unsynced drafts and it does not enable per-device cryptographic revocation. This workflow is **NOT YET browser-E2E verified**, and should not be used with real confidential family content before its full acceptance plan and external security review pass. See `docs/E2E_ACCEPTANCE.md`.
