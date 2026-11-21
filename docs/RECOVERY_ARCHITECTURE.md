# Carehold encrypted account recovery — staged implementation

**Status (2026-11-21): experimental, UNREVIEWED and not ready for real family data.**
The current branch adds only a first recovery-capable path for **freshly enrolled messaging accounts**, not full account/device/journal continuity. Keep PR #1 in draft; do not merge or deploy for sensitive records.

## What was implemented in this development pass

- \`src/lib/message-recovery.ts\`: generates a fresh P-256 ECDH account identity on the client and a random 256-bit, one-time-display recovery code. An HKDF-SHA256-derived AES-256-GCM key wraps the PKCS#8 private key with authenticated user ID and public-key context. The server never receives the recovery code or private key.
- \`migrations/0011_message_account_recovery.sql\`: additive \`message_account_recovery\` table storing public JWK and client-encrypted recovery envelope. Existing \`message_device_keys\`, encrypted direct messages, shared Words posts and journals are not modified.
- \`POST /api/messages/recovery\`: authenticated, first-enrollment-only registration of the wrapped recovery record and original public-key registry atomically, rejecting accounts with an existing key; \`GET\` fetches only the current account's ciphertext envelope.
- \`src/lib/message-crypto.ts\`: a new IndexedDB object store for recovered private keys. It never overwrites the original legacy store. Recovered identities are imported as non-extractable WebCrypto keys.
- \`MessageRecoveryGate.tsx\`: explicit setup with saved-code confirmation for a fresh account, and code-based recovery on another browser. Integrated into Messages and Words. No browser-native prompts.
- Targeted light-theme summary strip correction.
- Automated crypto/policy tests were **added but have not been executed in this environment**.

### IMPORTANT: recovery is scoped to the USER, not the household

A new household on the same Sara/other legacy test account **does not** remove the old public key. A fresh E2E recovery test must use fresh fictional user accounts and a fresh household. Existing accounts must retain their original browser keys until safe migration exists.

## Current crypto trust and limits

The recovery code is **32 bytes of uniformly random entropy**, encoded as \`CH1-\` plus base64url; it is not a user password or account email-reset code. The code never belongs in D1, logs, telemetry, URLs, clipboard persistence, or another participant's account. Account authentication gates the API; the independent recovery code gates decryption.

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

## Private journals are NOT recovered yet

\`private-journal.ts\` still stores a non-extractable AES-GCM key and ciphertext only in that browser's IndexedDB. The separate manual encrypted journal backup is still the only currently available portable backup. The new message recovery code does **not** restore journal shelf entries or drafts.

Before any real use: design a separate, client-side encrypted journal content key, encrypted D1 synchronization, secure wrapping/recovery, versioned edits, conflict detection, offline semantics, deletions and data-retention policy. The server, other household owners/caregivers, and therapists must not receive journal plaintext or decryption access merely because they can manage the household.

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
8. A private journal entry **does not falsely appear to have synced**. This is an outstanding launch blocker, not a successful test.
9. Verify dark/light summary contrast on desktop/mobile; confirm no native browser prompts.
10. Validate that login alone, without an independent recovery code, does not decrypt on a new device.

**Do not use clinical, child or family-confidential content until the remaining release gates are resolved.**

## Remaining prioritized work

1. Implement legacy message/Words copy migration with versioned envelopes, no destructive rotation.
2. Replace shared account-key-on-every-device with verified distinct device credentials and explicit revocation/key epochs.
3. Implement private journal encrypted synchronization and independent recovery.
4. Implement authoritative Adult/Teen/Child classifications and member/caregiver/owner permissions enforced by API tests.
5. Complete full E2E regression, staging backup/restore, external security review and documented rollback.
6. Only then discuss release and real household data.

See \`docs/SECURITY.md\` and \`AGENTS.md\` for further consent, privacy, clinical, minors and launch obligations.
