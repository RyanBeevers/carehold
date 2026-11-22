# Carehold — instructions for every development agent

## Mission and delivery order
Carehold is an invite-only household care pilot, built to grow into a subscription platform and optionally clinician-referred product. **Medication safety first, private communication second, professional workflows later.** The homepage is `Today → Person → Medication → Status / Action`. Make changes as small, reviewable, and testable vertical slices; never claim untested functionality works.

## Non-negotiable data boundaries
- Every API read/write rechecks an authenticated session, household membership, **profile-level capability** and resource ownership on the server. No broad `householdId` lookup grants journal access.
- A household owner manages medications but is **not** automatically an owner of personal journals or conversations.
- Keep an immutable administration event history. `unrecorded/overdue` is not `missed`. Time passing does NOT imply that a dose was administered or missed.
- Scheduled administration events use a deterministic occurrence key and unique DB constraint; retries use separate idempotency keys; corrections append superseding events. Treat a double-dose warning as a safety concern, not a dose recommendation.
- Record the acting authenticated user, actual administration time, server recording time and the schedule timezone. Preserve historical records when schedules change; edits need audit trails.
- Do not recommend dosage, substitute medications, infer PRN minimum intervals, or automate medication administration.
- Do not log passwords, access tokens, invitation tokens, push endpoints, clinical content, or journal content. No secrets in repository, telemetry, URLs, or browser storage.
- Never store readable private journal or message content in D1. Phase-two communications require a reviewed client-side/E2EE design, independent per-recipient sharing, revocation semantics, multi-device/recovery analysis, and penetration testing before enabling real sensitive content.
- No real medical/child data in test fixtures or preview deployments. Public repository must NEVER contain personal data.
- Do not enable open public registration. Pilot access codes and per-household invitations are the only entrypoints; revocation supported.
- Notifications default to non-sensitive copy. No medication, patient, journal, or recipient names in lock-screen pushes.

## Design contract: editorial care, not SaaS boilerplate
- The mark is an open, protective loop holding a small seed. **Same original motif** in header, SVG favicon, PWA icon, Apple touch icon, and push badge.
- An off-center editorial typographic hierarchy. `Fraunces` as expressive headline, `DM Sans` as UI face, `IBM Plex Mono` for date/time metadata (self-hosted font packages). Intentional cream/ink/coral/chartreuse palette in both light and dark themes.
- Avoid a wall of rounded cards, colored metric tiles, generic gradients, stock illustrations, unnecessary motion, and icon-only actions. Use ledger rules, timelines, negative space, texture, and clear labeled controls.
- Both themes from the start: system default plus user override, WCAG contrast, focus-visible, reduced-motion and 44px touch targets. No medication status communicated by color alone. Responsive mobile first.
- Copy sounds human and calm, never clinical, childish, or gamified. The interface must always show the *current person* before a record action.
- No fake success states or phantom functionality: clearly mark planned features as such.

## Engineering conventions
- React + TypeScript + Vite, Cloudflare Worker + D1, Better Auth + passkey, PWA, service-worker Web Push; avoid dependency sprawl. Use version-controlled D1 migrations and an auth schema check.
- `main` stays stable; use short-lived branches / PRs. Never run production deployment or remote database migrations without explicit user authorization.
- Local `.dev.vars` and production secrets are never committed. Distinct local/staging/production databases and secrets. No on-by-default third-party analytics.
- Add tests for: auth bypass, membership and capability denial, duplicate submissions, race/concurrency, correction history, timezone/DST, invitation replay, and notification deduplication. Prefer server-held policy checks and database constraints to UI-only checks.
- Never cache sensitive API responses in the PWA service worker. Offline recording is disabled until reconciled sync is deliberately designed and tested.
- Change logs, docs, and test steps must accurately reflect what was and was not verified. No accessibility or security claims without testing.

## MVP stage gates
1. **Core care:** Account (invited signup) → add passkey before access → create household → add adults/children/pets → medications/schedules → Today ledger → log administered/skipped/refused/uncertain/confirmed missed → immutable corrections/history → caregiver permission checks and invites.
2. **Notifications:** Explicit opt-in to PWA push, scheduled reminders, preference and device management, delivery retry/dedupe, non-sensitive push copy. Validate actual installed-iOS/Android notification behavior before calling it production-ready. The push service is a reminder, not a safety guarantee.
3. **Private words:** Curated parent/child prompts may appear locally now, with no server-stored responses. Before persistent communication or journaling, implement and independently review client-side key management, selective recipient encryption, safe account recovery, revoked access and multi-device semantics. Invitation to a discussion gives no access to unrelated entries. Prompt sender must never see open/draft/response activity unless explicitly shared.
4. **Professional:** Referrals are invitation/onboarding actions **without implicit access**. Therapist/psychiatrist accounts, consent, clinically relevant records, and optional paid workspaces are deferred.
5. **Commercial:** Subscription entitlements, monthly/annual billing, complimentary accounts, beta/founder lifetime access, staff entitlement admin are future work. Billing roles never imply care-content access.

## Household pilot security UX (November 2026)

See [docs/HOUSEHOLD_PILOT_SECURITY.md](docs/HOUSEHOLD_PILOT_SECURITY.md). The owner is testing this privately with invited household accounts. Everyday Words/Messages surfaces should **not** show a permanent fictional-writing banner; do show actionable errors for authentication, encryption, recipient-key mismatches, recovery and failed sync. Settings exposes the remaining privacy and recovery limitations.

Before any send, remember/check recipient key continuity **per signed-in account, household and recipient**. Unexpected changes must block sending until the sender compares the recipient's full public verification code outside the app and explicitly approves. This browser-local TOFU improvement is **not independently verified E2EE**, protection against XSS or per-device revocation. Do not weaken authorization, fake review signoffs, erase recovery ciphertext, or silently trust changed keys to make the UX smoother. Public/clinical and minor-confidential release gates below remain open.

## Open discovery / release blockers (do not quietly assume solved)
- Minors' privacy, age thresholds, guardian consent/oversight, children's right to private writing, account deletion, and teen transition to adulthood.
- Therapist/psychiatrist authorization, referral workflow, clinician role/licensure, professional record retention, cross-jurisdiction and emergency disclosure.
- HIPAA applicability, state child/privacy laws, COPPA and other relevant rules, legal terms, privacy notice, consent records, and security incident response.
- Handling high-risk disclosures, self-harm or abuse content, emergency-use disclaimers, boundaries of human monitoring and notifications.
- E2EE cryptography and its independent review; key storage/device loss; passkey is **not** a journal encryption key; client key backup and rotation; server/operator access and subpoenas; recipient revocation limits.
- Data portability, deletion, archival, audit retention, backup/restore tests, retention minimization and optional encryption of medication fields.
- AI processing (optional future only), children's data, on-device vs third-party inference, consent for shared text, provider retention/training.
- Billing compliance, beta/public launch checklist, international availability, support model, and professional contract terms.

Household-only use does **not** waive baseline security. Stop new sensitive-data features if the necessary controls cannot be implemented safely.
## Pilot prompt audiences and invitation flow
- `account_audiences` stores a self-declared **parent / child / teen** prompt preference. This is NEVER an access-control role, age verification, guardian consent or a clinician identity. Authorization continues through `household_members` and `profile_grants`.
- Never enable a `doctor` account type or professional access solely based on an onboarding dropdown. Professional enrollment/referral and consent require their own verified workflow and release gate.
- The curated Words library must show parent-to-child prompts only to the parent audience and age-distinct child/teen-to-parent prompts only to their selected audience. Shared prompts are allowed. Never log read, view, copy, draft or unshared response activity.
- A signup invitation can be staged before passkey completion as `pending_household_invites.user_id -> invitation_id` with NO reusable plaintext code stored. Stage ≠ acceptance; only a fully authenticated passkey-enabled user may claim it, and claim must honor revocation, expiry, duplicate membership and profile grants.
- Do not collect minors' exact dates of birth before consent, retention and age-transition decisions are made. A UI prompt audience remains self-selected and intentionally non-authoritative.

## Linked accounts and push checks
- `profiles.linked_user_id` is an optional, auditable **identity association**, never an authorization shortcut. Linking requires an owner and existing household member; no pet links; one user per profile per household. Revoking membership unlinks the profile and writes history. Do not infer permission from the link.
- Test push requests are opt-in, authenticated, rate-limited per user, and contain no sensitive medication/patient data. Browser registration, server push-service acceptance, and actual OS notification display are three distinct states.
- Never overwrite an existing VAPID private key as part of local setup; doing so invalidates existing push subscriptions. Keep VAPID material in ignored local secrets or secret manager only.

## Sensitive-screen timeout and feedback
- Keep **server-enforced 30-minute sliding sessions** (refresh age 60s) independent of the frontend's **3-minute inactivity / 1-minute background screen lock**. The earlier matching three-minute server expiry repeatedly logged out active editors during throttled/suspended refreshes. The client lock must mask care content, clear in-memory care state and require a fresh passkey/password sign-in; it is NOT a server-side authorization boundary. Automatic locks remain local to the affected tab to avoid revoking another actively used tab; explicit Lock now/Sign out revoke the shared session. The longer token lifetime is a documented security tradeoff; revisit with independent security review.
- Never send session tokens or medication records to browser persistence for unlock. Avoid refresh heartbeats when hidden/inactive. Respect OS suspension: check elapsed time on visibility/focus/pageshow.
- Every user action should have local visible feedback. Prefer inline errors for form/dialog fields and notification settings, and a fixed, accessible toast for page-wide success/error. Do not force a scroll to a page-header banner.

## Next phase: private words release prerequisite
- Linked self-profile metadata may help users recognize their profile but MUST NOT be used as implicit permission for medication records or future private messages.
- Future journaling/messaging requires an independently reviewed client-side E2EE design; do not store readable private content in D1, introduce tracking/read receipts, or grant a parent/professional automatic access to private words.
- Distinguish push gateway acceptance, service worker receipt, and notification display request. None proves the OS showed the alert; confirm natively. No sensitive data in diagnostics or lockscreens.

## Words prototype implementation constraints
- `src/WordsDraftStudio.tsx` intentionally keeps fictional draft text only in mounted React state. Never add autosave, telemetry, background sync, WebSocket, server POST, copy-to-clipboard, browser storage, or a "send" control without the E2EE/consent release gate.
- Sharing selection is a **preview only**, defaults to "Just me," clears selections when returning to private, and must not infer access rights from household membership. `GET /api/words/recipient-options` is names/IDs only, permission-scoped; it is not a message-recipient authorization token.
- The prototype should unmount and discard drafts on page change and banking-style lock. Don't make it look like a production confidential journal.

## URL navigation and encrypted draft backlog
- The active page must be addressable by `/today`, `/people`, `/words`, `/circle`, `/settings`; restore it after refresh, lock and reauthentication. Respect browser Back/Forward and new-tab link semantics. Keep the SPA fallback configured in Wrangler without routing API requests to `index.html`.
- Route URLs are public navigation labels only. Never embed profile/household IDs, medication names, recipient IDs, journal content or credentials in URL paths/search/hash. The route does not authorize access.
- **High-priority next slice:** autosave encrypted private writing, with restoration after inactivity locking / sign-in and refresh. Do **not** implement draft persistence without client-side encryption, independent key management, recovery, account isolation, deletion and security tests. Current Words text is fictional, unsaved and erased on navigation/sign-out.

- For a fresh PWA icon launch at `/`, the only stored navigation preference permitted is one of the five public page labels. Direct links override it, and storage exceptions must not break the app. This metadata is not user-scoped; never expand it to include IDs or content.

## Experimental encrypted autosave scope
- `src/lib/words-vault.ts` and `src/lib/useWordsDraftVault.ts` implement an **opt-in device-local prototype**, for fictional writing only. Ciphertext, AES-GCM IV, revision and last save time are persisted in IndexedDB; the nonexportable CryptoKey is also stored by the same origin. This is **not** independent account cryptographic isolation, secure key recovery, E2EE or protection against XSS. Keep medical/minor/therapeutic real content out pending review.
- No plaintext in browser storage, network, logs or notifications. Never persist recipient selections or silently share drafts. Bind ciphertext to account+circle, detect simultaneous-tab revisions, and preserve the option to discard.
- For real production content, design separate secure key management, passkey PRF compatibility + fallback, wrap/recovery/device rotation, encryption and independent review. Do not describe current opt-in vault as production-ready secure journaling.

## Direct Messages fictional pilot (branch feat/carehold-mvp-foundation; 2026-11-21)
A new `/messages` page, `worker/messages.ts`, `src/lib/message-crypto.ts` and
`migrations/0006_encrypted_direct_messages.sql` form a **fictional-text-only,
unreviewed developer pilot**, not a released confidential communications system.
The parent/child/teen Words editor remains a separate private local-draft feature.
Its recipient preview does not send anything.

The message client generates a nonexportable P-256 ECDH private key per signed-in
account on the browser origin and stores it in IndexedDB. It sends only the
canonical public JWK to the server, which pins the first enrolled public key.
For each message the client uses an ephemeral ECDH key and HKDF-SHA-256 to
derive separate AES-GCM-256 keys for each explicit participant; associated data
binds conversation, message ID and recipient ID. D1 stores only ciphertext
envelopes, minimal metadata and public keys. The sender receives an encrypted
copy for their own history. No message-body text is sent to the Worker, logs,
notification payloads or analytics by application code. No message push, read
receipts, typing events, prompt opens, drafts or acknowledgement telemetry.

**Hard limitations:** Server-provided recipient keys use trust-on-first-use,
without identity verification/key transparency or authenticated key changes.
The same origin can invoke IndexedDB private keys if compromised, and recovery,
device enrollment/transfer, key rotation and deletion/retention semantics are
not implemented or independently reviewed. A second device cannot silently
replace the first device's key. Browser storage clear can permanently remove
decryption capability. This is NOT independently verified E2EE. Do not enroll
real minor/medical/therapeutic content. Independent security/privacy review and
consent/legal decisions remain hard release blockers.

Conversations are strictly one-to-one. Only explicit thread participants with
current household membership may read them. For new threads, owners may choose
another household member, and members/caregivers may choose an owner; age label,
profile identity association and medication grants never authorize access.
On membership revocation, archive the old pair key and remove that member's
thread participation in the same D1 batch, so reinvitation cannot restore prior
thread access or silently reopen its message history. Other participant's old
thread is closed as well; server backups/history may retain ciphertext. Group
threads, push and clinician access remain disabled.

Never market or deploy messaging for sensitive content without security,
device-recovery and minors/consent approval. Never invent read receipts.

## Journal-first Words pilot (branch feat/carehold-mvp-foundation, after 0007–0008)
- **Words is now the primary communication surface.** Explore relationship/category-filtered prompts, write an opt-in device-local encrypted draft, explicitly save private journal entries in the AES-GCM IndexedDB shelf, invite selected people to a prompt-only space, or share an immutable snapshot of a written entry. Discussion and shared reflections belong to that space. Existing direct Messages remain secondary and may be removed in future; do not expand them without product justification.
- The local journal shelf and shared-space transport are experimental **fictional-data-only** implementations. A private journal entry is **never** exposed via a household membership, medication owner role, or a shared-space invitation. Only an explicit participant on a particular space can read it. Replies can be written privately and either saved locally or consciously shared.
- Migrations `0007_shared_words_activity.sql` and `0008_word_push_preferences.sql` add per-participant encrypted journal copies, recipient-scoped unread activity, and a **separate opt-in** for generic word notifications. Do not use activity events to create recipient-open/read/typing indicators for senders; unread is visible only to its recipient. Push copy is generic and never names people, prompts, or journal content.
- Group participants are fixed at creation for the pilot; adding/removing participants from an existing space, account recovery/rotation, full cross-device private journals, per-entry deletion/retention and safe group key updates are **not** production-ready. On household membership revocation, remove that person's explicit shared-space memberships and private activity entries. Old ciphertext or already-decrypted material cannot be revoked from other devices.
- **Release gates remain blocking**: identity-verified encryption keys, recovery/multi-device, XSS hardening, privacy and minor-consent/legal review, audit, backup/retention/deletion semantics, and security testing. No staging/production migration or deployment for real journals without authorization and review. Earlier local-only comments describe prior iterations and must not be mistaken for the current feature matrix.
- Keep the UI editorial, with a prompt dashboard and journal ledger rather than overlapping message composition surfaces. Do not automatically share a private entry or reflection. No response obligations, view indicators, participation streaks or unanswered-prompt pressure.

## Private journal backup and final E2E (2026-11-21)
- The single-device private journal shelf now has a **manual, passphrase-encrypted export/import** using PBKDF2-SHA256 (400,000 iterations) and AES-256-GCM with fresh randomness. The downloaded file is ciphertext; no server routes receive the passphrase or decrypted journal. A restore requires the **same user ID and household ID**, skips existing entry IDs and never silently overwrites; it does not include shared-space private keys, unsent drafts or medication records. This is **not** an audited recovery system.
- Cloud staging/production targets in `wrangler.jsonc` are placeholders. Both `npm run db:remote` and `npm run deploy:staging` now invoke `npm run preflight:staging`; the guard only validates target configuration and cannot check secrets or cloud identity.
- The user requests a **single consolidated browser E2E test at the end** of coding. Do not ask for ad hoc partial browser tests after each source change. When the code is frozen, use `npm run verify:pre-e2e` and follow `docs/E2E_ACCEPTANCE.md` for authenticated multi-account medication, journal, notification, recovery, and access-control tests. No cloud deployment or merge without explicit approval.

## RxTerms / medication catalog pilot (2026-11-21)
- `migrations/0009_medication_catalog.sql` adds **nullable** catalog identity fields and a durable per-account search-rate limit table. **Never require** catalog metadata to create or edit a medication; legacy/manual/veterinary/OTC/compounded entries must remain first-class.
- `GET /api/medications/search?profileId=...&q=...` is a passkey/authenticated, `manage_medication`-authorized Worker proxy that uses only medication-name query terms to NLM RxTerms. Do not transmit user, family, pet, household, diagnosis, medication history or other private identifying information upstream; only the term is sent. The upstream may log full query URLs, and service availability is not guaranteed.
- NLM `STRENGTHS_AND_FORMS` strings and parallel `RXCUIS` are **product identity** metadata, not the patient/pet's prescribed dose. Never fill or recommend `dose`, cadence, dates, instructions, times or PRN status from this API. Do not invent brand/generic equivalence when the source lacks a verified mapping. The `brand_name` and structured `dosage_form` fields are reserved rather than guessed; `product_strength` holds the **unmodified strength/form string**.
- Keep medication autocomplete accessible and touch-friendly, debounced, stale-result safe, and always allow free manual entry when searches fail or return irrelevant matches. The existing form, permissions, dose-event uniqueness and history audit must remain intact. Details: `docs/MEDICATION_CATALOG.md`.
- Include catalog search/selection, manual/veterinary fallback, network failure, metadata-preserving edits, and D1 migration compatibility in **the user's one consolidated final E2E pass**, `docs/E2E_ACCEPTANCE.md`. Do not deploy from this branch without approval.

## First E2E feedback corrections (2026-11-21)
- Preserve **append-only** dose history. Migration `0010_dose_correction_kind.sql` adds `correction_kind='not_administered'` only on an explicit correction with event type `skipped`; a later observed outcome is another corrective successor, not a second first record. No dosing advice, automatic re-administration, or record erasure.
- The Words UX uses **one Discussion composer**: a device-private note is encrypted into the user/circle journal shelf with a `spaceId`, while posting to everyone requires a separate explicit action. Legacy shared reflections remain readable, and a preexisting private reflection draft can be transferred without sending. **Automatic** local encrypted autosave, encrypted optional journal titles, search/date/share filters and 10-item pagination replace repeated enable buttons and nameless lists. A successful Write share clears the matching draft; a new prompt warns before discarding unsaved writing.
- Add adult↔adult prompts to the internally named `parent` audience only. Child/Teen users should not see them in normal prompt discovery, but the self-selected audience is **not age verification**. Account roles remain `owner`/`caregiver`/`member` (medical permissions), distinct from `parent`/`teen`/`child` (prompt UX) and profile types `adult`/`child`/`pet`. Adult children can be adult profiles with member accounts.
- Archive/restore medicines and profiles using the preexisting `archived_at` columns. Preserve dose events, existing shared spaces, old chats and household membership. Exclude archived *linked accounts* from **new** Words spaces/direct contacts; do not claim existing conversations stop receiving future replies. Revoke access is a different, stronger action.
- The idle hook counts text input/composition, pointer movement, touch scrolling and keyboard/wheel events; an authenticated heartbeat refreshes Better Auth's 30-minute session while active. An anomalous null/mismatched heartbeat must be rechecked against the authenticated /api/me endpoint before locking an active tab. Preserve the 3-minute visible idle / 1-minute away locks; do not conflate these UI locks with server-session expiry.
- Follow `docs/POST_E2E_FEEDBACK.md` and `docs/E2E_ACCEPTANCE.md`, apply migration 0010 locally after backup, test/typecheck/build and perform the short focused browser regression. No remote migration or deployment without explicit approval.

## Lost recovery-code handling (explicit release blocker)

- A completed encryption enrollment or old-browser migration may leave a valid locally stored, **non-extractable** v2 private key while the user has **not saved the one-time CH1 recovery code**. Never describe `message_account_recovery` presence as evidence of an externally stored code. The D1 envelope cannot reveal the code.
- The new fresh/legacy setup must hide the displayed secret and require the user to retrieve and re-enter their saved copy before enabling the irreversible enrollment/migration action. This is only a client-side custody check, not a guarantee the user stored it outside the browser; the server must never receive the code.
- When a user reports missing the code after completion, first preserve the original browser profile and IndexedDB identity, old legacy keys, database ciphertext and journal backups. **Do not clear browser storage, rotate IDs, regenerate keys in place, unconditionally reset an account, or expose an endpoint that decrypts/exports private keys.**
- **Migration 0016 introduces an experimental trusted-original-browser recovery-code replacement**: require old private-key challenge proof, a new CH1 code saved and verified outside the browser, staged/verified direct and shared Words recipient ciphertext, synced journals and drafts, and an atomic server commit barrier. It preserves previous browser keys and original recipient/journal/draft ciphertext. If a draft scope is unknown, a revision changes, or anything cannot decrypt, FAIL CLOSED; never delete or reset keys to bypass it. This implementation is **NOT BROWSER E2E VERIFIED OR PRODUCTION APPROVED**. Run full SQLite/crypto/type/build/browser tests, including a second persistent browser restoring historical content, before marking the release gate passed.

## Second post-E2E regression: session continuity and shared-space visibility
- **Critical:** Never auto-rotate, overwrite, reset or replace `message_device_keys` to suppress an identity mismatch. The pilot supports one browser-profile ECDH key per *account*; original copies require that original key. Different browser profiles/incognito/origins cannot decrypt unless a reviewed export/recovery design is implemented. Profiles (adult/child/pet) are not distinct login accounts.
- Shared-space **metadata** must load through authenticated, participant-scoped `GET /words/spaces` even without a local key. Display a decryption error separately; do not show a false empty-list message or an indefinite detail spinner. Never treat unread Activity notifications as evidence of decryption.
- An active correction form triggers throttled real session refreshes on typing/composition. Maintain the 3-minute screen inactivity and 1-minute background locks, with a separate 30-minute sliding server expiry for resilience. If passkey lock occurs, retain only an unfinished **correction** in current-tab memory and restore it only for the **same** authenticated account and household; deliberate logout/account change clears it. Do not send draft reasons to loggers, analytics or unencrypted storage.
- Two different test accounts in the *same* browser profile share a session cookie. **A background/idle Carehold tab must never revoke that cookie** (another tab may be actively in use). Only explicit Lock now and Sign out revoke the session, and explicit locking must first verify the server-side user ID so it does not revoke a newly switched account. Separate browser profiles are required for simultaneous test accounts.
- The **Record a later outcome** action belongs next to Correct record on the latest administration-history row, not in the Today ledger. Never treat it as permission to redose.
- Tests: `tests/post-e2e-regressions.test.mjs`, `tests/test_words_spaces_db.py`, and focused workflow in `docs/POST_E2E_FEEDBACK.md`. No merge/deploy or key replacement until local verification and manual pilot acceptance.


## Encryption recovery implementation status (2026-11-21)

Read \`docs/RECOVERY_ARCHITECTURE.md\` before modifying messaging, journaling, browser storage, or recovery logic. A **fresh-account** experimental recovery-code flow is being added. It is NOT a verified production E2EE/device recovery implementation: legacy nonextractable message keys still need nondestructive migration; the current recovery key is the same account key imported to each browser; per-device revocation/rotation and independent public-key authentication are outstanding; local private journals and drafts do not sync. Preserve all old keys and ciphertext. Never silently change \`message_device_keys\`, clear the original IndexedDB store, or claim recovery restores existing browser-only journals. A new household alone does not change a user's enrolled encryption identity. Keep PR #1 draft, fictional data only, no real-data launch. Run \`npm run verify:pre-e2e\`, then execute two-browser recovery, key-mismatch, unauthorized-user and journal-persistence E2E before considering staging promotion. Do not claim verification passed unless executed.


## Recovery v2 + encrypted journal + household classes (2026-11-21, UNVERIFIED)

Current implementation supersedes the earlier fresh-message-only recovery prototype. Read \`docs/RECOVERY_ARCHITECTURE.md\` before changes. New accounts have a v2 recovery envelope containing the messaging private key and an independent journal content key. Encrypted journals sync under the authenticated account and household; legacy device-only copies can be imported explicitly, without erasing the old ciphertext. Never silently overwrite a journal conflict or imply that local unsent drafts now synchronize.

Account classes are authoritative and household-scoped: Adult / Teen / Child / Unverified, independent of Owner / Caregiver / Member. Newly invited members are unverified; Owner assigns classification. The API blocks minor or unverified medication mutations even with grants, while an Adult Member can manage their linked Adult profile. Do not let a Words audience, onboarding request, client switch or household membership alone upgrade medical privileges. All authorization checks must remain server-side.

**Testing is still required**: run \`npm run verify:pre-e2e\` (Node, Python, typecheck, build), run two-browser account and encrypted journal recovery tests, validate revoked-session/unauthorized-owner cases, confirm local journal migration can resume, and check light/dark themes. Known release blockers remain: legacy direct/Words ciphertext migration for non-extractable keys; device-unique cryptographic keys, revocation and rotation; drafts recovery/offline conflict handling; backup/restore and external security review. Keep PR #1 draft and production untouched.


## Update: staged legacy message migration and recoverable drafts (2026-11-21, NOT E2E VERIFIED)

This section supersedes earlier statements that "legacy messages cannot migrate" or that "all drafts remain device-only." New migrations 0014 and 0015 add **non-destructive** original-browser key migration and encrypted private draft sync. The old browser private key is never exported or overwritten. Starting migration requires a short-lived server-issued ECDH-encrypted challenge that only the old key can decrypt; only the proof hash is stored. A new v2 recovery identity is staged, every authorized old direct/Words recipient copy is decrypted **client side**, re-encrypted for the new account key and checked before the server commits the new public key. All original records remain. Staging pauses new posts to migrating recipients, and sender submissions carry an exact public-key roster to reject stale recipients.

Migration can be resumed with the saved recovery code, or cancelled (before finalization) by proving possession of the old key. Completed migrated copies are immutable. If the old private key is lost, this process cannot recreate it. Do not interpret an account password/passkey alone as authority to reset cryptographic keys.

Unsaved Words/Message discussion drafts still have encrypted local IndexedDB autosave. When a v2 recovery key is present, the same account syncs an encrypted second copy in D1 with exact revision checks, owner-only routes, opaque scope identifiers and tombstones. Never claim a draft reached the server when offline or after a failed sync; never silently overwrite divergent drafts. User choices are "Use other device copy" or "Keep this device's draft"; remote deletion succeeds before local discard. Account-switch requests must verify the expected logged-in user to prevent stale async writes to the wrong account.

**Still blocked for real confidential data:** independent per-device key hierarchy and cryptographic revocation, key authenticity verification beyond TOFU, recovery-code custody/rotation, source-authenticated migrations under hostile conditions, data-retention/deletion requirements, clinical/minors privacy assessment and external security review. New changes must pass \`npm run verify:pre-e2e\` **after pulling the latest branch**, then browser E2E across fresh enrollment, original-browser legacy migration and cancellation, new-device journal and draft restoration, outdated sender keys, offline/conflict and logout races. Do not suggest production deployment until those gates are met.

## iPhone Passwords recovery-code custody (2026-11-21, E2E PENDING)

Fresh recovery and legacy migration share `RecoveryCodeSaveGuide.tsx`: a one-time-display CH1 recovery code, user-initiated **Copy recovery code**, searchable label **Carehold — Encryption Recovery Key**, iPhone Apple Passwords instructions, and alternative trusted managers/locked notes/offline storage. Never claim a web page directly saved to Apple Passwords: no supported Safari/PWA API guarantees that. Saving is user-confirmed, and the code must not enter logs, browser storage, API bodies, analytics or notifications. The username/label for the recovery-code item must be distinct from any login credential.

To accommodate the 1-minute iOS background lock while the user switches to Passwords, IndexedDB version 3 includes `pendingRecoveries`. Only a client-encrypted v2 **unregistered** recovery envelope is stored per signed-in user and flow (`fresh`/`legacy`), NEVER the recovery code or extractable key. After reauthentication, use the saved code to decrypt that envelope, then complete enrollment or legacy staging. A lost code allows discarding only this unregistered setup, not registered keys/ciphertext. Confirm IndexedDB writes have committed before displaying the code. For staged legacy recovery, the server-provided envelope remains authoritative and can be resumed with the saved code on the original trusted browser.

Manual acceptance must include iPhone Safari and installed PWA background-lock + Passwords switching, and test cancelling only unregistered attempts while preserving all prior ciphertext. No production/real confidential data until security and E2E gates are met.
