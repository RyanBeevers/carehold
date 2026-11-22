# Carehold — consolidated end-to-end acceptance gate

**Intended timing:** Run **once at feature freeze**, after all code changes are pulled and the last unit/build verification has passed. Do not repeatedly run partial user-facing tests during development.

**Scope:** Family medication ledger + journal-first Words + secondary Messages + passkeys/permissions + notifications + device-local recovery. The first pass uses fictional people, medications, notes and journal prompts in a non-production local database. Real prescriptions and sensitive family writing are not acceptance-test input.

**Release decision:** This is an explicit GO/NO-GO checklist, not a claim that the system has already passed E2E. Passing automated unit tests does not count as passing browser E2E.

## 0 — Prepare and verify once

```bash
git switch main
git pull --ff-only origin main
npm install --no-audit --no-fund
npm run verify:pre-e2e
npm run db:backup:local
npm run db:local
```

The last two commands verify the source and create a private local D1 SQL export. The export is **not encrypted** and does **not** include the browser's private journal/key vault. It must remain out of Git and public cloud locations. If a command fails, record its terminal output and stop.

Open **two terminals**: run `npm run dev:worker` and `npm run dev`, then browse **http://localhost:5173**. Use the exact origin for all passkey operations. Two local browser profiles (or normal and private windows) can connect to the same local API for local E2E tests, but they have separate per-account device keys and browser storage.

Test with at least **three fictional accounts**: A (owner and journal sender), B (selected recipient), C (household member intentionally *not* selected to one shared journal). Each account must enroll a passkey and open Words once to register its device key. Keep a separate fictional-only care circle for cross-household isolation.

## 0a — Household security readiness (new)

Read [HOUSEHOLD_PILOT_SECURITY.md](HOUSEHOLD_PILOT_SECURITY.md) before the final multi-account acceptance pass.

- [ ] Words and Messages have no persistent fictional-only banner. Actual encryption/recovery errors remain visible and blocking.
- [ ] Routine first sharing requires no key comparisons or copy/paste. The recipient's verification code is optional under Settings → Encrypted writing → Recovery & advanced security → My encryption verification code; check that it is available but hidden by default.
- [ ] A→B direct and shared-space writing succeeds, and only the intended recipients can decrypt it; no implicit household-owner/caregiver access.
- [ ] A subsequent unexpected B public-key change fails closed **before** encryption/sending in all three flows: new shared space, reply, direct message. Do not overwrite a live encryption identity for this test: use controlled fixtures and isolated data.
- [ ] Only when a key unexpectedly changes, the sender sees a blocking alert with an optional How to verify this change disclosure and can compare the new code to B's advanced Settings. Not now does not approve, and stale stored keys cannot be silently overwritten.
- [ ] Device browser storage disabled: sending fails without creating a shared entry or silently deleting the private draft.
- [ ] First-use key history is scoped to exact signed-in account, household and recipient; user-switch on a shared browser does not reuse another account's trust pin.
- [ ] Simulate a legitimate restored or rotated B key, verify explicitly, and then confirm sending works again; previously received ciphertext and existing private drafts are preserved.
- [ ] Staging static assets expose the existing strict Content Security Policy, no-referrer, nosniff and noindex headers without breaking WebAuthn, icons, app navigation or push notifications.

## 1 — Authentication, circle and access

- [ ] A signs in with passkey; browser lock/sign-out and reauthentication return to the correct page without another user's data.
- [ ] A invites B and C; invitations expire/are one-time, and B/C cannot view another household.
- [ ] Link B to a fictional profile. Confirm linking does **not** independently grant medication management or private journal access.
- [ ] Limited caregiver permissions allow only their selected profiles and actions. A revoked person cannot read their former medication data, encrypted shared-space data or unread activity.
- [ ] The UI locks after **3 minutes of no interaction** or **1 minute away**, while the independent server session has a **30-minute sliding expiry** with active refreshes; after every screen lock, passkey/password reauthentication is still required. Encrypted drafts must recover only where enabled.
- [ ] Open **two Carehold tabs in the same persistent browser profile and same account**. Leave tab A untouched in the background for over one minute while actively typing/scrolling in tab B. Tab A must show its own local lock on return, but **tab B must remain authenticated, responsive and able to save**. Repeat with tab A foregrounded but untouched for over three minutes while B remains active.
- [ ] Keep the cursor moving and scroll a long fictional Words entry for over three minutes; the active tab must NOT lock from inactivity. Leave the app untouched for three minutes; now only that tab must lock, displaying the inactivity reason.
- [ ] Trigger explicit **Lock now** in one tab; unlike automatic locking, this should revoke its authenticated server session, causing other tabs to require reauthentication on their next authenticated request. Verify explicit Sign out too.
- [ ] Disconnect the network or temporarily make the Worker return a transient error for a heartbeat. A transport/5xx failure must not clear an otherwise authenticated editing session. A genuine expired/switched session must lock after a confirming authenticated check.
- [ ] Switch to Apple Passwords or another app for more than one minute, then return: only the Carehold tab's screen locks. Recover using the stored code/pending envelope; verify that no other active Carehold tab is involuntarily signed out.

## 2 — Medication ledger

Use fictional medication names and harmless doses, not actual instructions.

- [ ] A creates adult, child, and pet profiles.
- [ ] Add one *daily*, one *selected weekday*, one *interval every N days*, and one *as-needed/PRN* medication with explicit label text and appropriate start/end dates.
- [ ] Today displays the correct person's name, dose, scheduled day/time and status. PRN is not shown as a fictional scheduled administration.
- [ ] Recording requires choosing an outcome: given, skipped, refused, uncertain or confirmed missed. There must be no preselected “given”.
- [ ] Record a dose and verify Today and the person's history show the same actor, actual time and prescribed snapshot.
- [ ] Retry the same idempotency key: no second event. Try a second event for the same scheduled occurrence: server rejects it.
- [ ] Correct the recorded status with a reason; the original remains immutable and visible in history, while the latest outcome displays correctly.
- [ ] On **Today**, use **Correct record** on an already recorded entry (including a previously corrected Not administered event). For non-given entries, **Record a later outcome** must work directly from Today without navigating to the person's administration history. Unauthorized viewers must see neither action. The result and original audit chain must match People → History.
- [ ] Edit a future medication schedule; historical events do not change. Check timezone and DST edge-case behavior.
- [ ] B with a grant can record permitted profiles but cannot manage a medication or see unrelated profiles. C without grants cannot access their records.
- [ ] Verify scheduled reminder permission and generic payload if device subscription is configured. A push is best-effort, **not** a guaranteed medication alarm.

## 2a — RxTerms medication lookup (new before feature freeze)

- [ ] Search `adderall` in the **Add medication** editor; choose an actual RxTerms result and strength/form. Verify the **prescribed dose, instructions and schedule are never autofilled or altered**.
- [ ] Save a scheduled medicine and a PRN medicine from catalog selections. Edit and reopen them: RxCUI, exact chosen name and product strength remain intact, with all original dosing/scheduling information.
- [ ] Enter an OTC preparation, a supplement, and a veterinary medication using **Use custom medication name**. Verify manual entry remains usable even if the API is available.
- [ ] Simulate RxTerms timeout/unavailability and empty results. Saving a custom medication must still work, without losing entered form, dose or schedule.
- [ ] Rapidly type different medication names and verify stale responses cannot replace the new search. Arrow keys, Enter, Escape, narrow phone width and dark mode work.
- [ ] A member without `manage_medication` cannot search for a restricted profile or save its medication. An authorized caregiver can.
- [ ] Verify old medications with null catalog fields, administration snapshots and historical schedules survive migration `0009`.

## 3 — Private Words, saved journals and recovery

- [ ] Explore prompts by category, relationship and search; shuffle and attach a prompt to an unsent entry.
- [ ] Enable draft autosave, type a fictional entry, refresh, lock and return; the encrypted draft restores without exposing its text in a URL or API request.
- [ ] Save the entry in **My journal**. It appears locally and is invisible to B/C and the Worker until deliberately shared. Editing and intentional deletion work.
- [ ] Export an encrypted journal backup using a separate 12+ character passphrase. Open the downloaded file as text: it contains neither the example prompt nor the example journal response.
- [ ] Wrong passphrase fails. Correct passphrase with a matching account/care circle restores into a separate or cleared **fictional-only** browser profile. Repeat import: no duplicate entries or silent overwrites.
- [ ] The backup does **not** restore shared-space message keys, unsent drafts or medication records; the UI explains this accurately. Avoid clearing irreplaceable browser data to exercise restore.

## 4 — Shared prompts, journal responses and unread behavior

- [ ] A sends a **prompt-only invitation** to B and explicitly excludes C. B sees the original prompt and a new Words badge/activity entry without manually refreshing.
- [ ] A sends a **completed journal entry** to B and includes another selected recipient. The shared space displays the prompt, initial author's text and selected participant list.
- [ ] B writes a private reflection and saves it locally. A and other selected participants do **not** see it.
- [ ] B explicitly shares a reflection, and then adds a separate discussion reply. All selected participants see the newly posted contents in the shared space.
- [ ] Recipients see unread indicators and can clear them privately by opening decryptable content. The sender has **no** read receipts, view timestamps, typing information or automatic alerts about an ignored prompt.
- [ ] C (not selected) cannot retrieve the shared space even by requesting its actual ID via the authenticated API, despite C being a household member.
- [ ] A simulated lost POST response or retry produces one shared item, not duplicates.
- [ ] The secondary Messages screen still works as before, with unread counts and explicit sending, without becoming the default prompt/journal editor.
- [ ] Confirm a wrong browser key shows an error, retains unread activity, and never silently rotates a registered identity.

## 5 — Notifications and mobile presentation

- [ ] Words notifications are opt-in independently of medication reminders; enabling Words alone does not enable medication reminders, and vice versa.
- [ ] Actual push receipt contains only generic wording, never sender names, prompt titles, journal responses or medication details.
- [ ] Check dark/light/system themes and mobile nav on a narrow screen. No clipped buttons, browser-native prompts, unexpected zoom, or blocked textarea controls.
- [ ] Top-right header shows **one circular sun/moon button** instead of three rectangular theme buttons; it toggles light/dark. Settings still permits the OS System preference.
- [ ] With **one** care circle, the header shows a tidy non-interactive label with no useless dropdown arrow. With two, open the styled care-circle list using mouse and keyboard (up/down, Home/End, Enter, Escape) and confirm changing circles navigates to Today and updates authorized data.
- [ ] Verify PWA icon, refresh restoration, keyboard-only controls and focus visibility.
- [ ] On actual mobile devices, repeat the multi-account flow **only after** a deliberately configured private HTTPS staging origin exists. `localhost:5173` on a phone is the phone itself, not the developer Mac.

## 6 — Private HTTPS staging gate (separate from the local E2E pass)

The repository still uses placeholder staging Cloudflare D1 identifiers and hostname. **No deployment is implied** by this checklist. Before remote migration or deployment, configure staging in `wrangler.jsonc`, create its own D1, set unique secrets, verify `APP_ORIGIN` and the passkey RP ID match the real HTTPS hostname, and run:

```bash
npm run preflight:staging
```

This check only rejects obvious wrong targets; it cannot verify live secrets, Cloudflare access, D1 content or deployment health. After checking the real destination and taking a restorable backup, separately approve any `db:remote` or `deploy:staging` action. Do not copy local auth/medication data into staging without an explicit migration and privacy decision.

## Decision and next steps

- **GO for household medication bookkeeping:** prerequisites are green, independent backup/restore tested, dose and correction flows tested, and the intended family access works on the actual target. Continue cross-checking administration against prescription labels and prior records; this app isn't a dispenser or verified alarm.
- **GO for fictional journaling collaboration:** source and browser tests pass including multi-participant privacy, lost-device handling is understood, and only fictional entries are used.
- **NOT YET GO for real confidential child, medical or therapeutic journals:** recipient-key identity, secure loss/recovery, family/minor privacy and deletion rules, and independent review are still open. Personal household usage does not make data loss or mistaken disclosure impossible.
- **NO-GO:** any unexpected access, plaintext journal API traffic, automatic sharing of a draft, duplicate administration, incorrect dose status, lost private data or failed passkey behavior.

Record failures with the specific step, account role, relevant HTTP response/status and sanitized screenshot. Never paste real medicine, journal, invitation token or authentication secrets into an issue report.

## Post-E2E correction regression

The initial local household E2E checklist was reported passing. Subsequent usability feedback led to new features and migrations **not included in that first pass**. **Before deployment**, follow the full focused verification in [POST_E2E_FEEDBACK.md](./POST_E2E_FEEDBACK.md): mistaken/refused/not-administered dose corrections and later observations; automatic draft autosave; draft clearing on share/new prompt; titled searchable/paginated journal; unified discussion and device-only private notes; adult-to-adult prompt filtering; 3-minute active session; medication/profile archive-and-restore, historical conversations, RxTerms form deduplication and role/permission isolation.


## Mandatory new-account recovery during onboarding (STAGING ACCEPTANCE — NOT YET PASSED)

- [ ] In a new persistent browser profile with a **fictional** staging account, create the account and add its passkey. Confirm the **03 / KEEP YOUR WRITING SAFE** recovery screen appears **before** any care-circle setup, Today, People, Messages, or Words.
- [ ] Generate a CH1 code. Do not save it; confirm **Continue**/enrollment remains disabled. Save it in a secure vault outside the browser, hide the displayed code, then retrieve and enter the same code. The enrollment action must enable only after matching verification.
- [ ] Finish enrollment, then continue to personal prompt preferences and create/join a circle. Confirm existing sessions do not silently regenerate keys.
- [ ] Close Carehold and sign in again in the original persistent browser: the enrolled key should match and the app should resume without a replacement prompt.
- [ ] Sign in to the *same fictional account* from a second persistent browser with passkey/password; it must require the saved CH1 code before exposing the care circle, and reject incorrect codes without replacing any key. Correct code must restore synced encrypted content.
- [ ] Simulate interrupting first enrollment while switching to a password manager: the encrypted pending envelope must remain resumable, and no code can be retrieved from the server. Do not clear IndexedDB on the original profile.
- [ ] Check a genuine legacy browser identity prompts non-destructive migration instead of creating a new key; test interrupted resume with the saved code.
- [ ] From staging, confirm `GET /api/health/ready` succeeds **only after** migration 0016 tables are applied. Run the exact latest `npm run verify:pre-e2e` on the branch before staging.
- [ ] Do **not** use real child, medication, therapy or confidential journal content on this unaudited pilot.

## Recovery-first re-test after migration 0011 (fictional test accounts ONLY)

This section is **not yet passed**. A new household with existing accounts does not reset account-scoped encryption keys; use new fictional user accounts for fresh-enrollment testing. Do not delete the old Sara/browser-test keys or D1 ciphertext to make a test pass.

- [ ] Back up and verify restore of the local/staging fictional D1 database; apply additive migrations 0011–0015 only to a backed-up local test database (and later separately reviewed staging).
- [ ] Create fresh account A and fresh account B, each with a passkey; create a new household and join B explicitly.
- [ ] For first enrollment, confirm **Set up secure backup** appears and a one-time CH1 code can be saved securely outside the browser, retrieved and verified before completion. On a new device, the gate must offer **Restore my writing**. In Settings → Encrypted writing, detailed recovery options remain collapsed when everything is healthy; legacy accounts still get a non-destructive migration path.
- [ ] **Recovery-code custody:** For fresh enrollment, legacy migration and rotation, the app displays a one-time CH1- code, gives a single default Copy recovery code action, and hides alternative storage methods under optional details. It still requires retrieving the externally saved code before enrollment or migration is allowed. Wrong code and Show code again do not overwrite enrolled keys. Never test with real private writing.
- [ ] **Missing-code scenario after completed enrollment:** Settings → Encrypted writing → Recovery & advanced security must distinguish an enrolled browser key from an externally saved code and offer **I didn't save my recovery code** guidance. No button should reset keys or delete ciphertext. The trusted-original-browser replacement flow is implemented in migration 0016, but remains **unverified in actual browser E2E and not production-approved**. Confirm the new code is saved and test recovery in a second persistent browser profile before relying on it.
- [ ] Complete equivalent enrollment as B; verify two distinct public keys and ciphertext-only recovery rows.
- [ ] Send fictional direct message and shared Words reply A↔B; verify actual plaintext can decrypt on intended accounts.
- [ ] Sign A into a different browser/profile and enter the saved code; verify BOTH old direct and Words history decrypt there.
- [ ] Sign out and clear site storage on the second browser; repeat restoration with valid code.
- [ ] Invalid recovery code, modified ciphertext and code for the wrong account must fail without altering backend keys.
- [ ] Confirm that someone who can log in but does not know the recovery secret cannot decrypt on a new device.
- [ ] Confirm household Owner who was never included in a conversation gets 404, not plaintext or envelope.
- [ ] Confirm a session switch between A and B does not cross-expose keys, journals, messages, or care data.
- [ ] Simulate interrupted enrollment (network failure after POST, browser reload before local IndexedDB save) and recover using the displayed saved code.
- [ ] Test two tabs enrolling at once; only one identity must win and old ciphertext must remain intact.
- [ ] Confirm the existing legacy account with lost Incognito key is blocked with an actionable warning and is NEVER silently rotated.
- [ ] Verify the Today summary strip in light/dark themes and on phone.
- [ ] Save a **new v2 encrypted journal entry** on A, recover A on another browser using the saved code, and verify the entire title, text and prompt decrypt. Confirm D1 contains ciphertext only.
- [ ] Edit the same journal on two recovered devices: stale revision must yield conflict without silently losing data.
- [ ] Import an old local-only journal entry explicitly and confirm original IndexedDB copy remains intact after successful remote encryption.
- [ ] On a v2 recovery account, save an unsent draft and verify it hydrates on a second browser after recovery. When offline, verify local encrypted save continues but does not falsely say 'synced'.
- [ ] Execute all automated tests, TypeScript check and build using \`npm run verify:pre-e2e\`; record actual results and unresolved failures.

**Not a production sign-off.** Distinct device keys, cryptographic revocation, key authentication and independent security review still require separate architecture and release gates. The legacy migration, journal sync and permissions implemented in this draft must pass the tests below.


## Authoritative account-class regression (unverified)

- [ ] New Owner has Adult classification; invited Member begins Unverified until Owner sets classification.
- [ ] Owner can assign Adult, Teen or Child and sees the updated status after reload.
- [ ] Teen/Child/Unverified accounts cannot record, correct, add, edit, archive or restore medication through forged API requests, regardless of grants.
- [ ] Teen/Child cannot change their classification via Words audience, onboarding, another client, or another household.
- [ ] Adult Member linked to their own Adult profile can view/add/edit medication and record their own administrations without caregiver promotion.
- [ ] Adult Member cannot read or edit another unrelated Adult profile without a grant.
- [ ] Owner/Caregiver authority to change medicines does not grant journal or message decryption.
- [ ] Removing a household member cascades account-class records and does not expose shared writing or restore revoked threads.


## Focused final E2E additions — 0014/0015 (NOT YET EXECUTED)

Use **fictional accounts and writing only**. The older shared account key and its historical ciphertext must be retained throughout the test. Run the automated suite on the exact latest draft commit first, then apply local migrations 0011–0016 and verify the D1 backup is restorable. Do not start staging or production deployments from this checklist.

- [ ] **Legacy fixture:** On a test account whose original trusted browser still has its non-exportable legacy ECDH private key, send a direct message and shared Words prompt/reply. Confirm another selected recipient can read their own copy.
- [ ] **Proof gate:** A signed-in account with no original private key must not be able to stage migration. A wrong/expired challenge proof must return 403; the active key must remain unchanged.
- [ ] **Staging:** Original browser decrypts challenge, generates a new saved recovery code, stages its v2 key and begins migrating each authorized direct/Words copy. Existing message and Words reads must still use the old ciphertext until finalization.
- [ ] **Resume:** Interrupt migration after a few copies, refresh Settings, enter the saved code and resume. Already-uploaded copies must verify and skip without 409 duplicates or plaintext loss.
- [ ] **Cancellation:** Stage again on a fictional fixture, cancel using original-key proof. Confirm old public key, all old ciphertext and other participants' access remain intact; abandoned replacement copies are removed.
- [ ] **Finalize:** Verify no authorized copies are missing before changing the active key. After finalizing, restore the account on a new browser with only the saved code and confirm all older direct and Words items decrypt. The original per-recipient copies in D1 must remain unchanged.
- [ ] **Recipient-key continuity:** Start sending a message or a shared reply while the other account is staged. The Worker must reject it without accepting stale ciphertext; after refresh/finalization, re-encrypt with the new public key and send successfully.
- [ ] **Drafts:** On a v2 account, type an unsent Words/Message/Discussion draft, wait for encrypted sync, log into the same account with its recovery code on another browser, and confirm the exact content returns. Neither message recipient nor household owner receives draft plaintext.
- [ ] **Offline drafts:** Disconnect networking, continue typing and verify local autosave still works without a 'synced' claim. Restore connectivity and explicitly retry if necessary. Simulate a concurrent edit on another device and verify no automatic overwrite; exercise BOTH remote-copy and local-copy choices.
- [ ] **Discard and tombstone:** After remote sync, discard a draft and confirm it does not reappear on either device after refresh. If another device changed the draft meanwhile, deletion must fail safely and preserve both copies.
- [ ] **Session switch:** Start a draft sync, switch to another account in the same browser, then let the old request finish. It must not write into the new account's journal/draft record; Worker must reject stale account IDs.
- [ ] **Database:** No plaintext content, prompts, titles, recovery codes, original private keys, medication notes, or unverified sender-key rosters in logs, D1 recovery rows, migrated copies or draft-sync rows.
- [ ] **Regression:** Check direct/Words activity privacy, Household Member Adult/Teen/Child profile permissions, passkey setup, Today light/dark mode and all medication history/correction flows.

**Important residual risk:** Restoring the same P-256 account key to several browsers is not a cryptographically independent per-device hierarchy. Revoking a session or removing a passkey does not revoke a private key already copied to another device. This remains a release-blocking design decision before real family/confidential use.

## Recovery-code custody and iPhone Passwords UX (NOT YET TESTED)

- [ ] Start fresh enrollment on iPhone Safari and the installed Carehold PWA. Confirm the recovery code is visible, the default storage instructions are for Apple Passwords, and the searchable label is **Carehold — Encryption Recovery Key**.
- [ ] Copy the key, background Carehold long enough to trigger its inactivity lock, save the code in Apple Passwords, then sign in again. Confirm enrollment resumes from the **same encrypted envelope**, accepts the saved code and does not generate a different key. Repeat for the original-browser legacy migration before server staging.
- [ ] Discard an unregistered pending setup when the code wasn't saved; confirm the active account key and all historic ciphertext stay intact. An enrollment already staged or completed must not offer destructive cancellation.
- [ ] Tap **Copy recovery code**, open **Passwords**, create a *separate* password entry with the code and a Carehold recovery label, then return. Confirm it can be retrieved and pasted in the verification field. Copy alone must **not** mark enrollment complete.
- [ ] Confirm optional **Other safe ways to store the code** explains another password manager, locked note or offline copy, without adding required choices. Do not open a native browser alert or show a fake “Saved to Passwords” notification.
- [ ] Without selecting the save confirmation, the enrollment and legacy-migration completion buttons remain disabled. Once saved is explicitly confirmed, enrollment can proceed.
- [ ] Sign in on another browser and search the chosen password app for **Carehold**. Enter the saved code and verify that encrypted journal/message recovery works. A wrong or missing code must not cause a silent reset.
- [ ] Start a staged legacy migration; verify it reuses the exact same save guide and shows the same searchable label on Resume. No password, passkey, or prior encryption key is overwritten.
- [ ] Check copy failures gracefully (clipboard permission denied or unavailable), light/dark contrast, small iPhone screens, VoiceOver labels, and recovery code display after rotating or switching apps.
- [ ] Confirm the recovery secret is never copied into logs, API request bodies, browser storage, notification payloads, or unencrypted exports. The only saved server artifact is the encrypted recovery envelope.


## Recovery-code replacement after a completed migration — migration 0016 (NOT YET PASSED)

Use fictional data only, two persistent browser profiles, and a freshly backed-up **local** D1 database. This is a release-blocking test; do not attempt to fix failures by deleting browser storage or keys.

- [ ] On original browser A with a completed v2 identity whose old CH1 code was deliberately *not* saved, open **Settings → Encrypted writing → Recovery & advanced security → Replace lost recovery code**. Verify a second browser without the code cannot decrypt existing content.
- [ ] Prepare a new code; confirm migration cannot begin until code is hidden and correctly re-entered from a separate password-manager entry or secure offline copy. A wrong code keeps the action disabled. Preserve the saved code throughout.
- [ ] Before starting, create fictional direct messages and Words prompts/replies, a synced private journal entry, and unsent synced drafts for Words, direct Messages and a shared discussion. Also keep a second recipient able to read their own encrypted copies.
- [ ] Start replacement; verify API challenge proves possession of the *existing browser private key*, and another signed-in browser without that key cannot start it. During the staged phase the original key, recipient copies, journals and drafts remain unchanged, and concurrent writes fail closed.
- [ ] Interrupt after several staged copies. Resume on original browser using the saved new code. Previously staged copies must be verified and not overwritten. Cancel a separate test using the original-key challenge and confirm original data and key remain usable.
- [ ] Simulate an unknown legacy draft scope or corrupted ciphertext; finalization must fail **without activating the new account key**. The old data must remain available on the original browser. Do not silently omit a draft.
- [ ] On successful finalization confirm each existing direct/Words ciphertext, synced private journal, and synced draft can be opened from a **second browser that did not have the original key**, using only account sign-in and the newly saved CH1 code. Confirm the other participant still decrypts their own copies.
- [ ] Verify the previous original journal/draft ciphertext is preserved in the rotation audit tables and no plaintext or recovery code enters D1 or request bodies. Confirm another browser with the older identity can explicitly restore using the new code without clearing its IndexedDB.
- [ ] Verify background/local UI auto-lock during migration pauses cleanly and can be resumed. Verify actual Chrome desktop/mobile layouts, errors, keyboard interaction and a full `npm run verify:pre-e2e` on the latest commit.
- [ ] **NO-GO:** mismatched revisions, incomplete source inventory, expired/wrong saved code, browser key mismatch, unverified content, partial finalization or any loss of original ciphertext.

Original-browser key re-enrollment remains **experimental**, not independently security reviewed. This still does not provide per-device cryptographic revocation or verified recipient-key identity.

## Phase 2 — Trusted devices & encrypted recovery (NOT YET PASSED)

The canonical threat model and detailed acceptance criteria are in [TRUSTED_DEVICE_RECOVERY.md](TRUSTED_DEVICE_RECOVERY.md). Run **once** in the consolidated final two-browser pass after the branch's test/build verification is green. Do not erase or change live encryption keys for test fixtures.

- [ ] Migration `0019_trusted_devices.sql` is additive and has passed SQLite tests and an encrypted D1 backup + restore rehearsal on a disposable database.
- [ ] A new account verifies and saves its one-time CH1 recovery code, then obtains a trusted-device record and **locally encrypted** approval escrow with a non-exportable key. No plaintext CH1 in D1, logs, HTTP, localStorage, backup files or push.
- [ ] On another persistent browser, sign in with the *same account* and tap **Request approval**. Two devices independently show the same eight-digit pairing number.
- [ ] A trusted device lists pending requests only for the same account. The user explicitly confirms a matching number; approval is forbidden without the confirmation, a valid enrolled-device private-key challenge proof, and the correct current encrypted backup.
- [ ] The new device decrypts the server-relayed encrypted CH1 credential and restores the current account encryption identity, private journal, synced drafts and authorized Words/direct history without manually entering CH1.
- [ ] Browser reload mid-request, duplicate requests, expired requests, revocation, tampered ciphertext, wrong-account transfers, stale server key, unavailable storage, network outages and cancellation all fail closed without overwriting or clearing existing keys or ciphertext.
- [ ] CH1 restore still works when no other trusted device exists. Existing legacy accounts without a saved CH1 remain intact; no silent reset/migration.
- [ ] Device list removal blocks further approvals, but the UI explicitly says it is **not independent cryptographic revocation**. Run existing recovery-key rotation on disposable test data and verify old-key devices cannot open future newly encrypted content, while historic ciphertext remains retained.
- [ ] The optional WebAuthn PRF approach remains **design-only** until verified authenticator support, server-verified assertions, signature-counter management, and Better Auth integration are completed. No unverified PRF get() call is made.
- [ ] Local `npm run verify:pre-e2e` passes, staging HTTPS passkeys and installed PWA work, and an independent adversarial review resolves account/directory key substitution, device removal, concurrency, XSS and child/privacy concerns before declaring sensitive-data readiness.

