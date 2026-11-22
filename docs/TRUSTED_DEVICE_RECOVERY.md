# Carehold — Trusted Devices & Seamless Recovery (Phase 2)

**Status: DRAFT, requires local build, browser E2E and security review.** Do not use for confidential writing until verified. This is a single PR workstream, NOT evidence that all cryptographic revocation problems have been solved.

## Product contract

1. **Normal use**: sign in and open your writing; no codes, fingerprint comparisons or extra steps.
2. **New phone with old trusted phone**: sign in with your passkey; select **Request approval**. Both screens display the same short eight-digit number; on the old device, explicitly check the match and select **Approve**. The new device decrypts the approved transfer and restores the existing *account* identity without typing CH1.
3. **No old device**: enter the CH1 code saved in your password manager. It remains the reliable recovery fallback.
4. **Existing accounts**: a CH1 recovery code cannot be re-created from a browser's non-exportable private key. An existing browser can become a recovery approver after the person enters their *already saved* CH1 once and it is locally verified. If lost, the original-browser recovery-code rotation is the safe path; do not reset the account or clear IndexedDB.
5. **Devices list**: shows enrolled, removed, and outdated devices. Removal disables that device's trusted approvals, *not* the crypto keys or historic ciphertext already on it. The app must never say otherwise.

## Recovery and enrollment architecture

### Account secrets and local escrow

Carehold's v2 recovery envelope wraps the stable account ECDH private key **plus** an independent journal AES key under a random CH1 code. The code is never uploaded. Existing account private keys are non-exportable; the browser cannot unwrap them to share directly.

After successful fresh CH1 enrollment, CH1 restore, safe legacy migration, or completed key rotation, this branch can re-verify the still-available CH1 code against the server's current recovery envelope. It saves **only an AES-GCM ciphertext of CH1** using a new, **non-exportable device-local CryptoKey** in a separate IndexedDB database. The local wrapping key is origin-accessible; this is protection against casual storage export, **not** a defense against same-origin XSS or stolen unlocked browsers. Failure to save escrow does not destroy the external CH1 backup.

A browser that never saved CH1, and cannot obtain it from its own old device, **cannot** become an approver by guessing the code. Users retain access to the old account key and existing ciphertext while attempting the reviewed replacement flow.

### Request and authenticated approval

- The candidate creates an ephemeral **non-extractable P-256 ECDH keypair**, persisted in browser IndexedDB *before* posting the one-time request. The request contains only account-scoped metadata and its public key; it expires in 15 minutes.
- The server returns only this request's candidate public key to the signed-in account, never another account. Both devices independently calculate an eight-digit truncated SHA-256 pairing number from account ID, request ID, and candidate public key. Humans compare the two visible numbers. This is a short manual integrity check, not long-lived authentication, with a residual 1-in-100-million accidental collision bound per independent guess.
- The approving device validates local enrollment against the current account public key, decrypts its local recovery-code escrow, and verifies CH1 still opens the **current** recovery envelope.
- Before approving, the server also generates a single-use 32-byte challenge, encrypts it to the registered **account public key**, and stores only its digest with a two-minute expiry. An authenticated session or claimed device ID *alone* cannot register or approve a trusted device.
- The approver uses an ephemeral P-256 keypair and ECDH/HKDF-SHA256 to derive AES-GCM; CH1 is encrypted to the candidate's ephemeral public key, binding **user ID, request ID, candidate key and current account key** as authenticated additional data. The server stores only ciphertext until the new device completes.
- The candidate verifies request identity and key, derives the symmetric transfer key using its non-exportable ECDH private key, and decrypts CH1 locally. It uses the existing `openMessageRecoveryIdentity` validation to recover the private account ECDH key and journal key, stores them non-extractably, and proves possession of the current account key before being marked enrolled.
- Completion clears the server's transfer ciphertext and the candidate's pending ephemeral private key. Expired, cancelled, malformed or cross-account requests must fail closed.
- A crash or network failure during enrollment must **never** delete the original ciphertext, installed account keys, external CH1 code, or account. The pending request can be resumed from the same browser profile until expiry.

### Device removal and key epochs

**IMPORTANT: device removal is not full cryptographic revocation in this architecture.** Multiple browsers have copies of the same account private key and journal key. Marking a device `revoked_at` prevents its recorded device ID from making further trusted approvals, but cannot stop it decrypting ciphertext encrypted under a key it already possesses. A signed-in browser holding the old private key may even be able to re-register under a different device ID until the account encryption key is rotated.

The existing recovery-code rotation pipeline independently checks and stages all eligible direct messages, shared Words, synchronized journals and drafts, then atomically switches to a new account key; **that** is the current safe mechanism for preventing a lost old key from decrypting future ciphertext, provided the new key and recovery credential are not transferred to the lost device. Old downloaded messages and retained ciphertext can still be read by whoever already held the old key.

After rotation, previously trusted device rows become *outdated* because they are bound to the old account public key. The currently rotating device can re-enroll under the new key; other legitimate devices must recover/receive approval again. Never silently reauthorize a removed device.

For robust independent device revocation without repeatedly rotating a global account identity, the eventual v3 protocol needs independent per-device encryption identities, explicitly authenticated device enrollment, key epochs, sender membership/key changes, replay resistance, recovery rotation, historic-message access policy and account-wide secure device revocation. These are security-design and independent-review requirements; do not claim they were completed by this PR.

## Passkey PRF: design and compatibility investigation

The WebAuthn `prf` extension can produce secret material from supported credentials; **it is not an automatic property of passkey login**. Authenticator, browser, device and synchronized credential behavior vary, so a universal cross-device restoration guarantee would be false.

Implementation requires full Better Auth integration: use **server-issued challenge**, verify the WebAuthn assertion (including origin, RP ID, credential ID, user verification and signature) and update any authenticator signature counter. Do **not** invoke an unverified `navigator.credentials.get()` just to retrieve a PRF output: that can change an authenticator's counter without updating the Better Auth database and may break future sign-in. Wrap CH1 locally under the PRF result only after a verified assertion, bound to credential and account-key version, with a strong ciphertext-only server record, explicit cancellation and a cross-device sync compatibility test. The CH1/manual and trusted-device paths must always remain available.

Relevant standards: [W3C WebAuthn PRF explainer](https://github.com/w3c/webauthn/blob/main/explainers/prf-extension.md), [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/), [MDN extensions](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions). Migration 0019 reserves a ciphertext-only wrapper table for later reviewed opt-in support; no PRF flow or WebAuthn assertion is being invoked by this branch.

## Manual two-device acceptance (NOT YET PASSED)

Use two newly created disposable accounts and **persistent** browser profiles; never clear production keys or mutate live public identities to simulate failures.

- [ ] Run `npm run verify:pre-e2e` on exact PR head with Node 22 / Python 3.12. Confirm schema 0019 is additive; capture terminal output.
- [ ] Back up staging D1, apply migration 0019 *only after locally approved tests*, confirm `/api/health/ready`.
- [ ] Create Account A, register passkey, save CH1 externally once; confirm the encrypted local escrow is set after account enrollment and no plaintext CH1 is present in D1 or localStorage.
- [ ] Confirm Settings → Trusted devices shows original browser. It must not show other household members' devices or private account data.
- [ ] Sign the *same* Account A into browser B with its normal passkey; press Request approval. Browser B shows an eight-digit pairing number.
- [ ] On browser A, open Settings → Trusted devices, select the pending request, compare the number, check the confirmation and approve. Browser B restores the existing account key, encrypted private journal, drafts, shared Words and direct history without typing CH1.
- [ ] Reject mismatched numbers, wrong account, wrong candidate key, request expiry, invalid ciphertext, cancelled request, replay, missing local escrow, lost connection and two concurrent requests. None may erase original browser keys, historic writing, backup code or unsent drafts.
- [ ] Reload browser B midway through approval: pending private key and request must survive. If the request expires, retry must create a fresh ephemeral key and request and never trust an old ciphertext.
- [ ] From another isolated browser C, manually enter the saved CH1 instead; recover the same account and verify its private writing sync.
- [ ] Test Account A device removal: selected device becomes removed from the approval list and cannot approve a transfer with its revoked ID. The UI must **not** claim it has lost decryption keys.
- [ ] On a disposable account only, run existing account-key rotation to completion and verify that a lost device with the *old key* cannot decrypt newly encrypted writing, while remaining trusted devices re-enroll under the new key.
- [ ] Test legacy browser without saved CH1: normal existing encrypted writing still opens, device approvals explain the need for a verified backup, and the safe original-browser rotation flow remains intact.
- [ ] Verify light/dark themes, mobile PWA and iPhone passkeys, no browser-native prompts, app sign-out, expired server session, account switching, push, browser auto-lock, and accessibility.
- [ ] Test the production backup/restore process separately; never treat passing schema checks as passing browser E2E.
- [ ] Independent security review must sign off before real confidential minor or therapeutic use.

## Release decision

- **No production merge or deploy of this draft just because tests compile.** Hardware/platform integration, recovery on a genuinely different browser, and revocation behavior must be verified. 
- The long-term v3 device-unique cryptographic revocation and optional passkey PRF integration remain explicit requirements, not implied completed features.
