# Carehold encrypted account recovery — staged implementation

**Status (2026-11-21): experimental, UNREVIEWED and not ready for real family data.**
The current branch adds a first recovery-capable path for **freshly enrolled message accounts and encrypted private journals**, not full legacy migration, per-device revocation, cross-device drafts or audited security. Keep PR #1 in draft; do not merge or deploy for sensitive records.

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

Required migration, not yet implemented:

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

**Limitations:** no proven offline-first multi-device conflict merge; changing contents while offline requires the author to retry after connectivity returns. Local unsent draft vaults do not sync or recover; retained local legacy journal copies remain device dependent. No server backup/restore verification, independently validated key hierarchy, independent account-key verification, retention/deletion review, or device revocation is complete. The old manual encrypted backup is still an optional additional safeguard. Do not use sensitive real data yet.

## Authoritative medication permissions

Migration \`0013_member_classification.sql\` records \`adult\`, \`teen\`, \`child\`, or \`unverified\` separately from \`owner\`, \`caregiver\`, or \`member\`. Owner accounts are initialized as adult and new invitees are unverified until classified by the household owner, with audited classification changes. Minors and unverified accounts are denied medication edits and administration recording by server-side authorization regardless of grants. Adults may self-manage their **own linked Adult profile** as Members without extra caregiver privilege. A minor cannot upgrade their own classification by editing Words audiences or replaying onboarding.

Every relevant API and E2E flow needs regression validation. An owner in one circle who is marked minor in another is blocked from owner administration; avoid treating household roles as globally validated age or legal guardianship.


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
8. A **newly synced** private journal entry is readable after second-browser recovery; the original local-only journal is explicitly imported without losing old ciphertext. Unsent drafts remain local.
9. Verify dark/light summary contrast on desktop/mobile; confirm no native browser prompts.
10. Validate that login alone, without an independent recovery code, does not decrypt on a new device.

**Do not use clinical, child or family-confidential content until the remaining release gates are resolved.**

## Remaining prioritized work

1. Implement legacy message/Words copy migration with versioned envelopes, no destructive rotation.
2. Replace shared account-key-on-every-device with verified distinct device credentials and explicit revocation/key epochs.
3. Validate encrypted journal sync, existing-entry import, offline conflicts, backups and recovery in real browsers; separately implement recoverable drafts if product requirements demand them.
4. Execute API-level and browser permission escalation tests for the new Adult/Teen/Child classification implementation.
5. Complete full E2E regression, staging backup/restore, external security review and documented rollback.
6. Only then discuss release and real household data.

See \`docs/SECURITY.md\` and \`AGENTS.md\` for further consent, privacy, clinical, minors and launch obligations.
