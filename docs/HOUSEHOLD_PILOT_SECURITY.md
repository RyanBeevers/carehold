# Carehold — Household privacy readiness (November 2026)

**Scope:** Invite-only household pilot for family communication, personal writing and medication coordination. This is an engineering readiness effort, **not** a claim of independent audit, HIPAA compliance, clinical suitability, verified child consent, or protection against a compromised browser/server. No public signup, clinician accounts or automatic caregiver access are authorized by this document.

## Interaction principle

**Security by default, prompts by exception.** The app encrypts and checks recipient-key continuity automatically before routine sending. Long fingerprints appear only after an unexpected key change or when someone deliberately opens advanced Settings. A recovery code is currently needed **once during first setup**, and to recover on an untrusted new browser; it is not requested when writing, sharing, or replying. Until reviewed passkey-assisted or trusted-device recovery is implemented, do not pretend that a sign-in passkey can recover lost encrypted data, or skip the backup check.

## What changes in this PR

1. The old persistent “fictional writing only” banners are removed from Words and Messages. Important *operational* errors (unavailable encryption identity, missing key, failed synchronization, wrong account or failed decryption) remain visible and blocking.
2. Settings → Household privacy contains a concise, optional explanation of the actual security boundaries. Settings → Encrypted writing → Recovery & advanced security includes the user's optional **public encryption verification code**, separate from the confidential CH1 recovery code. Routine conversation screens never ask people to compare codes.
3. A browser remembers the **first recipient public key it successfully tries to send to** (scoped by signed-in account, household and recipient). Unexpected changes fail closed *before encryption/sending* in:
   - newly shared journal/prompt spaces;
   - shared-space replies and reflections; and
   - direct messages.
4. Only an unexpected changed key interrupts sharing. The user can expand **How to verify this change**, compare the new code directly with its owner, and deliberately accept or dismiss the change. Regular sends require no manual code comparison; changed keys are never trusted automatically. The server still validates that the submitted key roster matches its current directory.
5. Cloudflare's already-present CSP, nosniff and no-referrer policies remain unchanged. Static assets now include a noindex instruction to avoid indexing this private household pilot.

## Threats this work improves

- An *unexpected post-first-use* recipient key change on the **same browser profile** now blocks sending, rather than quietly encrypting to a new server-provided recipient key.
- Approval is deliberate and scoped to one recipient's new key. A stale approval cannot overwrite a subsequent local change.
- First-use pinning is automatic and does not create a routine prompt. An account's own fingerprint is accessible only in Settings → Encrypted writing → Recovery & advanced security; users ordinarily need not see it.
- No journal content, recipient name, draft, device key or private key is stored in fingerprint records. Only the public-key SHA-256 digest and the account/household/recipient identifiers are stored in that browser's localStorage.

## Explicit limitations — do not overclaim

- **First use remains trust-on-first-use (TOFU).** Without an out-of-band comparison, a malicious first key can still be trusted. Browser localStorage can be cleared, and malicious same-origin JavaScript can modify it or invoke stored non-extractable CryptoKeys. The fingerprint is a change detector, **not** a secure independent identity service or a security certification.
- **Shared account encryption identity:** restored browsers currently use the same recovered account key. Revoking a session or household membership blocks authorized server reads, not cryptographic use of previously received ciphertext or a previously imported key. Dedicated device identities and independent key revocation remain a separate milestone.
- **Offline and recovery:** unsynced drafts can be lost with a device. A CH1 code must be saved externally, and backup/restore and legacy migrations must be tested on distinct browsers. Never clear original IndexedDB data to force recovery.
- **Deletion:** hiding a shared space or reply from live views does not wipe someone else's already-decrypted data or immutable historical ciphertext/backup records. Explain this at deletion time.
- **Minor privacy and public/clinical use:** children's privacy, guardian consent, high-risk disclosures, legal applicability, retention/export and independent crypto/security review are still open. Do not represent this household release as reviewed confidential medical/therapeutic messaging.

## Household acceptance checklist (manual, after automated verification)

Use fake messages and journal examples during validation. Use two actual household accounts on distinct persistent profiles; avoid incognito for recovery tests.

- [ ] `npm run verify:pre-e2e` passes on the exact PR branch. Run Node 22 and preferably Python 3.12 to match GitHub Actions.
- [ ] Words and Messages open without fictional-only banners. Settings → Household privacy accurately describes the current limits.
- [ ] Each account can optionally open Settings → Encrypted writing → Recovery & advanced security → **My encryption verification code** after the local registered key matches.
- [ ] First sharing and ordinary replies work without the sender being asked to locate, compare, copy or enter any code. The automatic first-use fingerprint check still happens.
- [ ] Share a fictional journal entry; verify the author keeps their private journal copy and the recipient has only the selected shared snapshot.
- [ ] Reply in that space and in a direct thread; confirm normal sending still works and unrelated household members cannot access private content.
- [ ] On isolated local/staging test data, simulate a recipient key change via a controlled API fixture (never overwrite a live encryption key). Every send path must stop before ciphertext is posted and display old/new codes. Cancel cannot implicitly approve it. Explicit approval of the matching new code permits a subsequent send.
- [ ] Confirm pinning is scoped by account and household: switching users on a shared browser must not reuse another user's trust history.
- [ ] Test localStorage unavailable or disabled: an attempt to send should fail closed with an actionable error; no drafts should be silently discarded.
- [ ] Test a legitimate recovery-code rotation on separate browsers. The affected sender should see a changed-key review; after comparing with the recipient's **new** Settings code, explicit approval should restore sending.
- [ ] First-run backup requires only the one-time secure-save and retrieved-copy check; secondary storage methods are optional details, and normal messages have no extra code step. Test missing recovery code, new device restore, legacy migration, private draft conflicts, app idle lock, and revoked membership **without deleting any irreplaceable originals**.
- [ ] Check production-like staging static asset response headers: CSP `script-src 'self'`, no-referrer, nosniff, noindex. Confirm icons, theme-init, navigation, push and passkey recovery still work.
- [ ] Confirm no data gets logged by the app in push payloads, URLs, client errors or server errors; push tests are generic, explicit and opt-in.
- [ ] Before staging deployment: encrypted D1 backup. Review migration status and validate `/api/health/ready`. This PR requires no new migration.
- [ ] Production decisions are separate, and signoffs must reflect completed review rather than automated test success.

## Later milestones before broader release

1. Recipient identity authentication beyond TOFU: verified key directory or mutually authenticated device enrollment/QR verification; signed key changes and rollback detection.
2. Distinct cryptographic device keys and key epochs, safe device enrollment and revoked-device *future* access, including group membership changes and recovery-code rotation. Prefer trusted-device approvals and evaluate passkey PRF-assisted wrapping where supported, retaining an auditable fallback for platforms that cannot do it.
3. Independent threat-model review/penetration testing; XSS/session hardening and negative API authorization tests across family roles.
4. Documented child privacy/consent/legal assessment and retention/deletion/export and incident response policies.
5. Restorable encrypted backups with documented, exercised rollback and real-device E2E review.

**Product language rule:** Do not reintroduce loud fictional-writing banners as a substitute for fixing issues, and do not claim Carehold is professionally audited or guarantees confidentiality. Show real failures where they occur and keep risk and recovery guidance findable in Settings and these release documents.
