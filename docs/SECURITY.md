> **Implementation update — November 21, 2026:** The draft branch includes a version-2 recovery envelope wrapping an independent journal/draft key, a proof-of-legacy-key staged migration for direct and Words ciphertext, owner-only encrypted journal and unsent draft sync, explicit legacy journal import, and server-enforced Adult/Teen/Child classes. Earlier sections document historical pilot limitations and must be interpreted with the current implementation status in [RECOVERY_ARCHITECTURE.md](RECOVERY_ARCHITECTURE.md). Cross-device message recovery for new accounts is **not** secure device revocation. Legacy non-exportable keys can be migrated only while their original browser remains accessible; successfully synced unsent drafts are portable using the v2 recovery code, but unsynced offline edits are not. No production security certification or real-user approval is implied.

# Carehold threat boundaries and launch gates

**Status: first source foundation, not security certified, not ready for real sensitive records.** This repository is public source code; database contents, credentials, OAuth secrets, patient data and invite tokens must remain private.

## Authorized access

Better Auth handles login/session and WebAuthn. `/api/me` only exposes the signed-in account and whether a passkey exists; all care APIs require a passkey in the database. All data APIs check membership. Profile-specific operations additionally demand `view_schedule`, `record_dose`, `view_history` or `manage_medication`; owners have medication administration rights by policy, **not** future private journal read rights.

Caregiver invitations are random, SHA-256-hashed at rest, expire after 48 hours, and are claimed once. The code is intentionally exposed to the generating owner only once. The current service has no delivery service or member-management/revocation UI, so production invitations are blocked by the release checklist until revocation, rate limiting, and account recovery are implemented and tested.

## Medication integrity

Dose events form an append-only chain. A unique constraint on initial scheduled occurrence prevents duplicate submissions at the database layer. A unique `idempotency_key` handles retries; corrections reference a unique superseded event. Correction notes, acting user, scheduled local date/time, timezone, actual event time, server record time, and a medicine/dose snapshot are retained. Changing a prescription never updates history. Occurrences not recorded are *unrecorded*, not *missed*. A daily screen may omit a schedule that has been edited; history remains accessible.

Records represent caregiver observations—not advice, clinical decisions, or evidence that a dose was definitely administered. Users must consult their prescriber if unsure about medication administration or duplicate doses.

## Notifications

Push delivery is opt-in per household plus browser/device subscription, generic lock-screen text only, no recipient/medication names. Client-supplied endpoints are restricted to recognized HTTPS push-provider hosts to reduce SSRF risk. Delivery is best effort with deduplication; failures can occur due to OS, browser, cron, connectivity, and push-service conditions. No sensitive API response is cached by the service worker. Browser app icons and fonts are self hosted.

## Future encrypted communication (hard gate)

A passkey proves account/device possession. It is **not** automatically a client journal decryption key. Before saving journal entries, responses, or messages: choose established reviewed E2EE primitives, decide multi-device provisioning and lost-device recovery, authenticate recipient keys, prevent parent/owner blanket access, implement selected-recipient sharing and deletion/retention, and assess revocation limits. Prompt-sender view/open/ignored/draft telemetry must not exist. Do not store sensitive text in plaintext while planning encryption.

## Incomplete for public launch

Email verification, caregiver revocation, anti-enumeration and rate limits, threat-model review, external security testing, child/guardian policy and legal review, user consent, professional records, incident response, deletion/export/retention, backups/restore, production monitoring, CSP/cookie review, server-permission integration tests, and signed dependency audit. See `AGENTS.md` for the full discovery list.

## Account prompt audience and invite staging (pilot)
The `parent`, `child`, and `teen` labels select **local, prewritten prompt copy only**. They do not alter profile grants, clinical access, consent rights, or privacy policies; a self-declared label cannot establish a minor's age or a clinician's status. No exact DOB is collected in the pilot.

An invitation may be referenced by user ID and invitation ID after sign-up but before passkey registration. The staging record does **not** create household membership, expose household details, or store the bearer code. Actual acceptance still requires an authenticated passkey and checks the one-time invitation state. Clinical enrollment and children's age/guardian validation are deliberately deferred.

## Linked profile boundary
A household owner's account link associates an already-joined user with an existing care profile; it is **not** a profile grant. The link cannot be used to read unshared medication schedules or private content. Linking/unlinking and unlink-on-revocation are auditable. Do not use a self-declared parent/teen/child prompt audience as a substitute for relationship verification or consent.

## Real push testing
Notification preferences are opt-in. VAPID private key stays secret; the public key alone is sent to the browser. A test push is authenticated, checked for household membership and enabled preference, rate-limited (at most once per minute/user), and carries no medication, person or journal contents. Third-party push-service acceptance alone is not a delivery receipt from the browser; installed device display must be tested separately.

## Session continuity and on-resume screen lock
Better Auth server sessions now use a **30-minute sliding expiration** (refresh after 60 seconds of eligible use; active-client heartbeat every 30 seconds) and cookie caching remains disabled. The earlier three-minute server expiry caused an unacceptable race with background scheduling and active editor heartbeats, leading to involuntary mid-edit session loss. The client independently masks data and clears in-memory care state after three minutes of detected inactivity or one minute away; returning requires real passkey or password reauthentication (never a cosmetic unlock). **Automatic inactivity/background locks intentionally do not call server sign-out:** a backgrounded tab shares the authentication cookie with actively used tabs, and revoking that cookie would unexpectedly sign out another tab. Explicit Lock now and Sign out do revoke the server session. On resume, the elapsed background time is checked even if the OS suspended JavaScript timers. Heartbeats cease when idle or hidden; a suspect missing session heartbeat is confirmed through an independent authenticated endpoint before an active tab locks.

The client must not treat timestamps, background events, or a toast as an authorization boundary. An automatically locked tab may still share a valid cookie with a separately active tab: locked-tab content is hidden and its client state cleared, while server-side access remains governed by the 30-minute sliding expiry and API authorization checks. This is a **security tradeoff**: an automatically locked tab's cookie may remain usable until server expiry or explicit sign-out, and the UI lock alone is not a server authorization boundary. Audit and test XSS defenses and physical-device/session-revocation requirements before real confidential use. Sensitive APIs must reject expired/revoked sessions. Confirm WebAuthn, multi-tab isolation, genuine server expiry, screen masking and reauthentication behavior during real device testing before clinical use.

A one-time database migration explicitly revokes long-lived sessions minted before this stricter policy. Merely lowering the `expiresIn` configuration cannot be assumed to invalidate already-issued cookies or rows. Running the migration signs all users out once, preserving their account/passkey and care records.

## Web Push diagnostics and linked self metadata
Push diagnostics report three distinct states: upstream gateway acceptance, service-worker push event receipt and browser's `showNotification()` completion. None proves macOS displayed a banner. Service-worker messages carry only a random test ID and an enum state; never medical data or endpoints.

Self-link lookup is scoped to the authenticated user and household membership. It exposes limited self-profile identity and per-capability flags, **not** actual records. Any medication/history endpoint retains its independent grant checks. Linking identity is not permission or implied consent to future communication.

## Nonpersistent Words UX prototype

The Words draft editor is currently **React memory only** and intentionally includes no save/send action. It is unmounted when navigating away from Words or locking Carehold; content is not placed in localStorage, IndexedDB, D1, push payloads, URL parameters, analytics or log output. Recipient preview requests contain only householdId and return scoped account IDs/names after membership and role checks; no journal content is transmitted.

This remains a **privacy UX prototype, not an encryption/privacy-control implementation**. An in-memory browser field is not proof of end-to-end confidentiality. No minor, medical or clinical writing should be entered before approved persistence, key management, consent, recovery, deletion and security review.

## Public route continuity without private-draft persistence

Page navigation uses only five constant paths (Today / People / Words / Circle / Settings), so browser history remains useful while signed out and during passkey reauthentication, without encoding personally identifying, medical or journal information in URLs. Access to every protected API still requires the server-side Better Auth session and scoped permissions. An old URL must never bypass the screen lock.

Navigation restoration intentionally does not restore unsaved local-only writing. Future autosave requires client-side encryption, device-bound key protection/recovery, authenticated restoration and account/household isolation before any persistent drafts are introduced. Never solve the usability issue by persisting plaintext drafts in browser storage.

The PWA may store the last visited **public page label only** in `localStorage` to restore navigation when the launcher opens `/`. It is not a draft cache or an authorization/session cache. Unknown or storage-blocked values fall back to Today; explicit path links always win. This preference can persist across different users of the same browser, so never attach private profile/account metadata to it.

## Experimental Words encrypted local draft store (NOT E2EE)

The new opt-in encrypted autosave encrypts content before device-local IndexedDB writes using AES-GCM 256, unique random 96-bit nonces and account/circle-bound additional authenticated data; the same-origin database stores a nonexportable CryptoKey and ciphertext. This is **not cryptographic account isolation, not independent key unlock, and not E2EE**. Same-origin scripts or a sufficiently compromised browser can invoke stored keys. Do not rely on this feature for private medical, therapeutic, child or high-risk writings. Device loss and site-data clear destroy recoverability.

The app deliberately persists no recipient selection. Version checks and explicit conflict choices mitigate simultaneous tabs. Actual secure journaling and selective sharing require independent cryptographic architecture review, external security testing, consent policies and key recovery before release.

## Experimental direct messages — NOT reviewed confidential messaging
The `/messages` developer pilot uses browser-side P-256 ECDH, HKDF-SHA-256
and AES-GCM-256 with ephemeral sender keys and separate ciphertext copies for
the two explicit participants. The API stores ciphertext only. Thread reads
require both a valid passkey-authenticated session and explicit thread membership
plus active household membership. Household owners/caregivers cannot query a
child's unrelated thread or unsent draft. No read receipts, open/typing status,
draft events or sensitive push are transmitted.

The server is the *unverified* source of recipient public keys (TOFU), so
active server compromise/key substitution, malicious same-origin code or XSS
are not covered by the encryption design. The private key is nonextractable but
available for WebCrypto operations to any script running on that origin.
There is only one message device per user and no secure account recovery,
device transfer, verified key rotation, export/deletion workflow, independently
reviewed protocol, retention policy or minors' consent/legal release gate.
Clearing site data can make messages permanently unreadable.

Only fictional test copy may be used. The existing encrypted local draft vault
is independent and does not become a message key store. Server/message error
logs must remain content-free. Revocation closes the existing thread and
prevents silent old-history restoration if a removed member is invited back;
previously received plaintext cannot be remotely retracted from devices.

## Journal-first shared writing pilot (2026-11-21)
- New Words routes are protected by Better Auth + required passkey and explicit `shared_word_participants` membership **plus** current `household_members` membership. A household owner or linked caregiver not selected to a space receives 404, not a journal list. No private shelf entries are sent to the Worker.
- Each shared post has per-participant ciphertext copies; the server can access only metadata and public keys. The initial prompt, journal body, reflection and discussion reply are encrypted before requests. The device-local journal shelf uses nonexportable AES-GCM keys stored alongside ciphertext in IndexedDB. Neither key design has independent review or secure device recovery.
- Recipient-private `private_word_activity` tracks unread and acknowledgements without exposing read/view/typing/response activity to senders. Words push has a separate default-off preference and generic copy. Authentication and authorization remain required for all activity routes.
- Limitations: TOFU key substitution and browser compromise, device loss, incomplete deletion/retention, shared snapshots not retractable from already-authorized recipients, child/guardian/legal questions, and group rekey on membership changes. Only fictional pilot testing is authorized; do not deploy these features with real confidential information.


## Experimental fresh-account recovery foundation (2026-11-21)

See [RECOVERY_ARCHITECTURE.md](RECOVERY_ARCHITECTURE.md) for exact trust assumptions, the staged protocol, browser test matrix and unresolved launch gates. A fresh messaging account can create a separately held high-entropy recovery secret and a client-wrapped P-256 message private key. An authenticated account can fetch only its own encrypted recovery envelope, and a new browser can reimport the original key **only with that recovery code**.

This does **not** resolve legacy one-device account keys, private journal/draft synchronization, per-device crypto isolation, key continuity/authentication, revoked-device future access, or legal/privacy review. No existing message/public key is reset or deleted. A new household does not create a new encryption identity for an existing user. A test of the new setup requires fresh fictional user accounts. The existing experimental messaging/journal caveats above remain applicable. All changes are staged on the draft branch and have not yet been verified by executing the full suite.


## Experimental trusted-browser replacement of a missing recovery code (migration 0016)

An already enrolled v2 account may have lost its CH1 recovery code while the original browser still has its nonextractable P-256 private key and independent AES-GCM journal/draft key. **The old code is not derivable from D1 or the device key.** The new "Replace lost recovery code" action generates an entirely new account encryption identity, requires external saved-code retrieval verification, and uses a challenge encrypted to the existing registered public key to prove possession of the old private key. All encryption/decryption remains browser-side.

The Worker stages per-recipient direct/Words ciphertext plus owner-scoped synchronized journal and draft revisions in new tables. Staged journal/draft entries retain both the old ciphertext and replacement ciphertext. Incoming messages to a staged recipient and concurrent journal/draft writes are rejected. Finalization runs inside a single D1 batch and is guarded by a SQLite trigger that rejects any missing authorized shared copy or owner-held live journal/draft, mismatched revision or incomplete new account identity. The active key/envelope changes only at the final commit. Interrupted work can resume with the *new* saved CH1 code or be cancelled with another original-browser private-key proof; historical copies/keys are retained.

Caveats: the rotation can fail closed if an older synced draft has an unrecognized opaque scope or inaccessible household data, if a source changes while staging, or if the atomic D1 operation count exceeds the bounded limit. Browser-local unsynced journal/draft entries are not synchronized by this procedure and remain dependent on their own original browser storage. Other trusted browsers holding the old identity must explicitly restore the new identity using the new saved code. The code is never uploaded, auto-saved to Apple Passwords, or reconstructed after finalization.

**Not release-approved:** execute `npm run db:backup:local`, `npm run db:local`, `npm run verify:pre-e2e`, and the complete migration 0016 browser acceptance test on fictional data. Verify direct/Words messages, synced journal and draft restoration from a second browser that did not have the old device key. Perform independent security and threat-model review; per-device key revocation, hostile-client trust, recipient-key authenticity, and clinical/minors privacy remain open.
