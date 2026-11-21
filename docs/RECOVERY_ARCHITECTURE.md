# Carehold encrypted account recovery — staged implementation

**Status (2026-11-21): experimental, UNREVIEWED and not ready for real family data.**
The draft branch now includes fresh-account recovery, a **staged non-destructive migration of legacy direct/Words ciphertext on the original browser**, recovery-key encrypted private journals and unsent draft sync, and server-side account classification. None of these new paths is browser E2E verified. This is NOT a device-revocation protocol or audited security implementation. Keep PR #1 in draft; do not merge or deploy for sensitive records.

## What was implemented in this development pass

- \`src/lib/message-recovery.ts\`: generates a fresh P-256 ECDH account identity on the client and a random 256-bit, one-time-display recovery code. An HKDF-SHA256-derived AES-256-GCM key wraps a version-2 bundle containing the PKCS#8 messaging key and a separate random 256-bit AES-GCM journal key, with authenticated user ID and public-key context. The server never receives the recovery code or private key.
- \`migrations/0011_message_account_recovery.sql\`: additive \`message_account_recovery\` table storing public JWK and client-encrypted recovery envelope. Existing \`message_device_keys\`, encrypted direct messages, shared Words posts and journals are not modified.
- \`POST /api/messages/recovery\`: authenticated, first-enrollment-only registration of the wrapped recovery record and original public-key registry atomically, rejecting accounts with an existing key; \`GET\` fetches only the current account's ciphertext envelope.
- \`src/lib/message-crypto.ts\`: a new IndexedDB object store for recovered private keys. It never overwrites the original legacy store. Recovered identities are imported as non-extractable WebCrypto keys.
- \`MessageRecoveryGate.tsx\`: explicit setup with saved-code confirmation for a fresh account, and code-based recovery on another browser. Integrated into Messages and Words. No browser-native prompts.
- Targeted light-theme summary strip correction.
- Automated crypto/policy tests were **added but have not been executed in this environment**.

### IMPORTANT: recovery is scoped to the USER, not the household

A new household on the same Sara/other legacy test account **does not** remove the old public key. A fresh E2E recovery test must use fresh fictional user accounts and a fresh household. Existing accounts must retain their original browser keys until safe migration exists.

## Current crypto trust and limits

The recovery code is **32 bytes of uniformly random entropy**, encoded as \`CH1-\` plus base64url; it is not a user password or account email-reset code. The code must never be written to D1, logs, telemetry, URLs, application storage, or another participant's account. The optional user-initiated Copy action puts it on the operating-system clipboard, which may be retained by clipboard managers; instruct testers to store it securely and clear their clipboard when appropriate. Account authentication gates the API; the independent recovery code gates decryption.

Wrapped private keys use WebCrypto HKDF with a random 16-byte salt, SHA-256, an application-specific info string, 12-byte random AES-GCM nonce and user/public-key associated data. The P-256 public/private pairing is verified before a recovered private key is admitted. All sensitive import/export happens client-side; decrypted PKCS#8 bytes are explicitly zeroed in the JS-managed ArrayBuffer after import. This is a defense-in-depth best effort, not a memory-forensics guarantee.

**Do not label this an audited E2EE protocol.** Public key discovery is still TOFU from the server. XSS or compromised first-party code can use a non-extractable local key. The server can deny, delete or substitute public-key metadata; separate key verification and rollback/key-continuity checks are not yet complete.

### Significant security debt: NOT per-device revocation

This temporary design restores one stable account ECDH private key onto multiple devices. Device revocation through account/session controls can stop network API use, but cannot prevent a compromised or previously authorized device from using the already imported key to decrypt ciphertext it has retained or can later obtain. Distinct device keys, secure enrollment, rotation, group membership changes, and key epochs are **mandatory** before launch. Never market current recovery as a fully independent device-key hierarchy.

### Existing legacy keys cannot be wrapped after the fact

The old key in IndexedDB is non-extractable. It is possible to decrypt legacy ciphertext *on the original trusted browser*, but not export its private key for recovery. It is **not** safe to overwrite \`message_device_keys\` or reset a user merely to make new messages work.

Implemented migration design (requires verification):

1. Preserve all original device keys and old envelope rows.
2. On the original authorized browser, decrypt each accessible legacy ciphertext copy client-side.
3. Create/enroll a recovery-capable key only after a staged migration plan is established.
4. Write parallel versioned encrypted copies for the new account key, scoped to the same authorized recipient and original post/message identifiers.
5. Check round-trip decryption against those staged copies, ideally from a second recovered device.
6. Only then consider retirement; keep legacy copies/backups through an audited, reversible transition.
7. Never assume the other participant's decryptable copy can be reassigned without explicit participant consent and permission checks.
8. Missing old key and no independently available authorized ciphertext/source copy means historical ciphertext may remain permanently unreadable; state this explicitly.

## Encrypted private journals for fresh recovery accounts

Migration \`0012_private_journal_sync.sql\` adds \`private_journal_sync\` with \`(user_id,household_id,entry_id)\` ownership and optimistic entry revisions. Routes in \`worker/private-journal.ts\` are passkey-session gated, check membership, and **always** bind the journal owner to the authenticated user ID. The server receives only account/circle identifiers, entry IDs, encryption nonce/ciphertext, versions, timestamps and tombstones—not journal text, titles, prompts or plaintext.

\`src/lib/synced-private-journal.ts\` performs authenticated AES-GCM encryption/decryption client-side with the separate non-extractable journal key from the v2 account recovery bundle. Account recovery imports both the messaging and journal keys on a new browser; a freshly saved journal can therefore be decrypted independently of the original device, **provided the user retained the recovery code and the encrypted server copy remains available**.

Words journal saving, editing, encrypted manual backup/restore, private discussion notes and deletion are wired to this path when a v2 recovery-backed identity is enrolled. Each update uses an exact expected revision; conflicts fail rather than overwriting silently. Deletion creates a server-side tombstone. Older device-only journal keys and ciphertext are **not** erased. Words offers an explicit, resumable import into encrypted sync on an original browser that can still decrypt its legacy local journal.

**Limitations:** no proven offline-first multi-device conflict merge; changing contents while offline requires the author to retry after connectivity returns. On recovery-capable accounts, unsent drafts are synced as encrypted ciphertext with a revision-guarded copy while device-local autosave remains the fallback. Offline edits may be newer than the server; a user must explicitly reconcile conflicts. Legacy journal copies still require import from their original browser. No server backup/restore verification, independently validated key hierarchy, independent account-key verification, retention/deletion review, or device revocation is complete. The old manual encrypted backup is still an optional additional safeguard. Do not use sensitive real data yet.

## Authoritative medication permissions

Migration \`0013_member_classification.sql\` records \`adult\`, \`teen\`, \`child\`, or \`unverified\` separately from \`owner\`, \`caregiver\`, or \`member\`. Owner accounts are initialized as adult and new invitees are unverified until classified by the household owner, with audited classification changes. Minors and unverified accounts are denied medication edits and administration recording by server-side authorization regardless of grants. Adults may self-manage their **own linked Adult profile** as Members without extra caregiver privilege. A minor cannot upgrade their own classification by editing Words audiences or replaying onboarding.

Every relevant API and E2E flow needs regression validation. An owner in one circle who is marked minor in another is blocked from owner administration; avoid treating household roles as globally validated age or legal guardianship.



## Legacy message/Words migration v1 (migrations 0014 and original-browser proof)

The \`account_key_migrations\` record stages a new **v2** recovery envelope without changing the old \`message_device_keys\` public key. The original browser obtains a short-lived, authenticated challenge encrypted for its existing ECDH key. Only the browser that can decrypt the challenge can provide the proof to stage a candidate recovery key. The server stores a one-time SHA-256 proof digest and checks the challenge's bound original public key and expiration.

The client inventories every currently authorized copy addressed to that account (direct messages and shared Words posts). It decrypts each existing copy **on the original browser only**, encrypts a replacement to the staged new account public key, verifies the new ciphertext decrypts to exactly the same content and saves the copy in an append-only per-user staging table. All previously authorized copies, other participants' copies and the old browser private key remain retained.

Staged copies are **not** used for normal reads. A server-side completeness query must find no accessible legacy copies without a replacement before \`finalize\` atomically inserts the recovery envelope and updates the account's public key. Direct and Words reads then prefer the migrated ciphertext for that user, while every other participant still reads their original copy. While a user is staging a migration, new posts to conversations involving them are rejected and can be retried after migration; new submissions also carry the current public-key roster and the Worker rejects stale rosters.

A staged migration can be resumed with the saved code or **cancelled only by proving possession of the original private key**. Cancellation deletes only uncommitted staged copies. Database constraints prohibit deleting completed migrated copies. A permanently lost old browser key cannot be recreated by this protocol; older content with no decryptable authorized source remains inaccessible.

Limitations: TOFU public-key identity, a stable per-account ECDH key imported on each recovered browser, lack of independent revocation/cryptographic key epochs, race conditions at migration boundaries, and the absence of a reviewed recovery/deletion policy remain release blockers. Do not describe the current functionality as independently revocable per-device end-to-end encryption.

## Recoverable unsent drafts (migration 0015)

\`private_draft_sync\` stores the owning authenticated user/household, a client-derived opaque scope hash, ciphertext, nonce, monotonic revision, last modified timestamp and a tombstone. It never stores the draft text, prompt, title or recipient selection. \`src/lib/recoverable-drafts.ts\` encrypts with the independent v2 journal content key, authenticated to the account, exact local draft scope and revision.

The existing local draft vault remains authoritative when offline. After account recovery the same draft scope can hydrate on a different browser; if two copies differ, the client must explicitly choose **Use other device copy** or **Keep this device's draft** rather than silently resolving it. Server writes and deletion use expected revisions. Remote deletion happens before local discard so a previously deleted draft cannot unexpectedly reappear from the cloud. Unsynced local edits may not be recoverable until synchronization succeeds; draft retention is 90 days. This prototype requires a full two-device, slow-network, sign-out and stale-session acceptance pass.

All encrypted journal and draft sync requests include an expected account identifier; the Worker compares it to the active authenticated session to prevent stale asynchronous requests from one account being applied to another account after switching logins.



## User custody: save the recovery code before enrolling

Both fresh enrollment and original-browser migration now use `src/RecoveryCodeSaveGuide.tsx`. The 256-bit `CH1-` recovery code is displayed only during the setup session, with an explicit user-initiated copy action, a searchable entry title **Carehold — Encryption Recovery Key**, and iPhone-first steps for creating a **separate** Apple Passwords entry. The same flow describes a trusted password manager on Android, a locked backed-up note, or a safe offline copy. The user must affirm that storage was completed and the code is retrievable before the app enables enrollment; merely copying it is not confirmation.

The app cannot make an arbitrary iPhone Safari/PWA page create an entry in Apple Passwords through a supported web API, so it must not show a button that falsely implies "Saved to Passwords." The clipboard may retain a copy; do not transmit the code to analytics, logs, account metadata, drafts, shared threads or the recovery endpoint. The app sends only the client-encrypted recovery envelope to the server. The recovery secret remains distinct from passkey login.

On a new browser, restore and migration-resume screens tell users to search Apple Passwords or their trusted vault for the same title. **Never overwrite a person's actual Carehold login credential with the recovery code.** An account with a lost legacy browser key and no saved recovery key still cannot reconstruct its history.

## Required verification before staging promotion

Run \`npm run verify:pre-e2e\` locally. This includes Node tests, Python database tests, TypeScript, and Vite build. Do not claim this has passed until executed. Apply the additive migration only to a backed-up fictional-data **local** database first; then to a reviewed staging database with a tested restore point. Do not apply to production without separate approval.

Mandatory browser flows:

1. Fresh account creates a recovery code, explicitly confirms storage, and enrolls.
2. A different browser signs into the same account and restores using the code, reading a historic direct message and shared Words post.
3. Incorrect recovery code fails; the browser is not enrolled and no key is changed.
4. An authorized participant can decrypt; a household owner not selected as a participant gets denied.
5. A second account and household remain isolated.
6. Reload, lock/unlock, clearing browser storage, account switching, failed network POST and simultaneous enrollment are safe.
7. Existing legacy users are never silently rotated; old message/journal records remain present after migration.
8. A synced journal and an unsent draft both restore after new-browser recovery, while locally saved legacy journal entries require explicit import and original ciphertext remains retained.
9. Verify dark/light summary contrast on desktop/mobile; confirm no native browser prompts.
10. Validate that login alone, without an independent recovery code, does not decrypt on a new device.

**Do not use clinical, child or family-confidential content until the remaining release gates are resolved.**

## Remaining prioritized work

1. Execute and harden the new original-browser legacy message/Words migration E2E, including restart/cancel, ciphertext integrity, and concurrent writes.
2. Replace shared account-key-on-every-device with verified distinct device credentials and explicit revocation/key epochs.
3. Execute encrypted journal and draft synchronization, restore, discard, offline/conflict, and session-switch tests; review retention and user-visible recovery promises.
4. Execute API-level and browser permission escalation tests for the new Adult/Teen/Child classification implementation.
5. Complete full E2E regression, staging backup/restore, external security review and documented rollback.
6. Only then discuss release and real household data.

See \`docs/SECURITY.md\` and \`AGENTS.md\` for further consent, privacy, clinical, minors and launch obligations.
