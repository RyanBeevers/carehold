# Carehold — next release design gate: private words and selective sharing

**Status:** **experimental, opt-in encrypted device-local draft autosave prototype** (Words → Try writing). No journal/message API, server-stored content, recipient encryption or send capability is enabled. The pilot remains unauthorized to hold real sensitive personal writing.

## Product boundaries

The user may write for **self only** first. A journal entry can be deliberately shared with **one or more individual invited recipients**, or not shared at all. If shared, the selected recipient(s) may read only the specific content/version they were invited to see, and cannot automatically browse older or unrelated entries. Group threads and parent↔child guided prompts are separate surfaces. Do not send read receipts, copy/view events, typing indicators, silent acknowledgements or activity tracking to senders.

Parents/owners have household **medication** capabilities, not the keys to private journals. A therapist/psychiatrist referral must never grant content access. A clinician is not a generic `parent` audience or a way to bypass household invitation/consent.

## Security design tasks before building persistence

1. **Key identity and recovery:** passkeys prove login identity, but aren't cryptographic message encryption keys. Design dedicated client-side encryption keys, device enrollment, optional recovery and key rotation with threat analysis. Never send plaintext journals or export a decrypted copy to server analytics/logs.
2. **Recipient selection:** private-by-default composition; share control with explicit individual account IDs, double-check selected recipients, independent version and sharing state, and server-enforced nonenumerable metadata. Sharing must never rely on household membership or linked profile identity alone.
3. **Revocation:** document how revocation stops *future* access, while explaining it cannot erase screenshots or previously decrypted content. Avoid misleading claims of retracting already-shared information.
4. **Child/teen consent:** legal review of applicable laws, guardian onboarding, age thresholds, minor autonomy, safety escalation and transitioning to adulthood. Do not silently infer age from prompt selection or collect DOB without a retention/consent plan.
5. **Abuse/threat models:** device theft, stolen browser session, cross-household leaks, accidental recipients, server compromise, notification metadata, account removal, session expiry and sign-out, and clinician access.
6. **Operational gates:** independent cryptographic review, privacy assessment, account recovery/device loss test, backup/restore, retention and deletion behavior, and separate negative permission tests for private draft vs shared entry vs group thread.

## Safe implementation order

- First: self-profile identity association and explicit medication grants (current draft PR).
- Next: **prototype an entirely local, nonpersistent composition UI** (fictional data only) and evaluate usability of private/default vs explicit recipient selection; never label this as secure journaling.
- Then: review encryption/recovery architecture and minor/privacy requirements.
- Only after review: encrypted persistence + recipient key exchange, per-item sharing, revocation, security tests, then staged rollout.

The medication-tracking pilot can remain independent of the still-unapproved private communication capability.

## Current local-only prototype (2026-11-21)

The Words page now contains an editorial **Try writing** studio. All parent/child/teen prompts have a **Write with this** action that opens the same editor and displays the chosen prompt without overwriting what the person was already writing. The editor starts with **Just me** selected, a 3,000-character input and an explicit **no save/no send** explanation. It can show a **Preview sharing** selector, which is strictly a non-sending, nonpersistent demonstration; returning to Just me clears selected recipient IDs. Clearing a nonempty draft uses an inline two-step action instead of a browser-native confirm. Changing pages, switching accounts, leaving the household, locking, or signing out unmounts the editor and destroys the in-memory writing state.

The only new API is an authenticated, read-only **recipient-options** lookup. It returns at most 30 members' `id` and display `name`, excluding the requester; only owners see all other members, while other household users see household owners as potential recipients. It does not accept writing content, create invitations, change permissions, send notifications, store messages, log prompt use or add therapist access. Recipient disclosure is a **future UX preview, not verified recipient consent**.

**Not safe for real private or clinical writing.** This is ordinary browser memory, not encrypted persistence. Browser extensions, local device access, crash reports and OS input services may present different risks; do not make confidentiality promises until reviewed. Do not save draft plaintext in localStorage, sessionStorage, IndexedDB, D1, logging or analytics.

### Manual acceptance (fictional content only)

1. Parent account → Words → Try writing: ensure **Just me** is the default, enter fictional writing, and observe the unsaved indicator.
2. Select **Preview sharing**: choose one listed recipient. Ensure the UI says **not sent**, offers no send/save action, and returns to an empty recipient selection when switched back to Just me.
3. Choose another prompt with **Write with this** and confirm it changes the displayed prompt without erasing the draft.
4. Clear draft and verify inline **Keep**/**Discard** actions. Choose Keep first; verify writing remains.
5. Navigate to People, back to Words; verify the previous writing is gone. Repeat by locking and unlocking via passkey.
6. Sign in with a test child or teen; verify different prompts and no general sibling listing in the recipient selector.
7. Open Chrome Network: typing and selecting prompts must not issue POSTs with writing content. Recipient-option GETs can occur only after opening the preview.
8. Retest mobile widths, dark/light themes, keyboard focus and three-minute idle locking with a fictional draft.

## Still not implemented

Encryption/recovery, encrypted storage, real sharing and revocation, read-only recipient permissions, messages, groups, clinician workflows and minor-specific legal/consent gates. Don't call this a finished journal or communication feature.

## Required next: encrypted draft autosave and authenticated restoration (2026-11-21)

**Product requirement:** A user may write a substantial private note and set down their phone. The banking-style inactivity lock, temporary app backgrounding, browser refresh, loss of connectivity or another sign-in should **not** silently destroy already-composed writing once the feature is released. Recover after successful passkey sign-in, ideally at the same page and writing context.

**Not implemented in the current local-only prototype.** It still discards writing on unmount, refresh, lock or sign-out, and explicitly warns users. We are postponing persistence rather than writing plaintext into localStorage/IndexedDB/D1.

Before release, implement and review:
1. **Client-side encryption before any persistence.** Autosave drafts encrypted (not plaintext) using per-user/per-device keys that are not merely Better Auth session cookies. Passkeys validate sign-in; separate encryption key unlock, protection, recovery and rotation must be designed and security reviewed. No plaintext in network logs, notifications or browser storage.
2. **Autosave timing and feedback:** debounce ~1–2 seconds after edits, also flush safely on visibility/background events where possible. Show Saving / Saved locally / Sync pending / Save failed without misleading certainty. Support tab close/reload, interruption, mobile OS suspension and protected retries.
3. **Identity isolation:** index encrypted drafts by authenticated account and care circle; never expose a previous user's drafts on shared devices or across household switches. Require successful reauthentication before decrypting/restoring, with clear choice of current draft and any conflict versions.
4. **Retention and user control:** explicit Discard permanently, recovery from transient network loss, clear deletion semantics across devices/backups, bounded retention for abandoned drafts, and no silent sharing/auto-sending. Ask before replacing one existing unsent draft with another prompt.
5. **Tests:** reauthenticate after 3-minute lock, 1-minute background expiry, refresh / direct `/words` URL, offline resume, cross-tab/device conflicts, passkey recovery, consent-revocation and no plaintext API/storage leaks. Never tie draft access to household owner role.

**Separate navigation milestone now implemented:** Browser URLs such as `/words` remain stable across reload and sign-out. The page is restored *after authentication* without exposing care content before login. This navigation continuity is distinct from (and does not currently include) draft restoration.

## Experimental encrypted device-local autosave (2026-11-21)

**Status:** opt-in, local-encryption prototype is implemented, **NOT approved for confidential medical, child, family or therapeutic writings**. Sending, cross-device sync, shared recipient encryption and clinician access remain disabled.

On Words, the first draft is still in-memory until the user explicitly selects **Enable encrypted device autosave**. This creates a 256-bit, nonextractable WebCrypto AES-GCM key scoped to this account + care circle and stores it using IndexedDB structured cloning, not an exportable raw key. The editor then encrypts the content (text and selected writing prompt) before each device-local write, using a fresh 96-bit IV and AEAD additional authenticated data binding it to account and care circle. Saves debounce after ~1 second of editing, flush on blur, visibility changes and navigation where the browser permits, and show **Saving / Saved on this device / Recovered / Error**. After passkey reauthentication, the same browser and origin can restore the encrypted draft. Drafts older than **90 days since last save** are deleted automatically on inspection. Explicit **Discard** removes the encrypted draft and waits for queued saves to finish first. Selected recipient IDs and sharing mode never persist, and restored content starts private.

**Security limitation:** the nonextractable CryptoKey is stored on the *same browser origin* as the ciphertext, and scripts running on that origin can still invoke it after a browser compromise. Server sign-in gates the Carehold UI but is not itself a cryptographic vault unlock. This does **not** deliver E2EE, withstand an XSS attack, prove one account cannot access another user's key in the same compromised origin, or provide secure device-loss recovery. It is a device-only recovery prototype for fictional writing, not an independent security review or authorization to store real sensitive data. Clearing browser site data or uninstalling the PWA can irrevocably remove the local key and draft. Do not imply the server can recover it.

**Conflict behavior:** optimistic compare-and-swap revisions avoid one tab silently overwriting a newer draft from another. A conflict keeps the current in-memory writing visible and offers explicit two-step **Load saved / Replace saved** controls. No background merge or automatic sharing occurs.

**Release gate remaining:** a separately reviewed account-bound key-wrapping/recovery design (potentially PRF-capable passkeys where supported, with explicit fallback and compatibility testing), recovery after device loss and credential rotation, XSS hardening, cross-device synchronization, minor/guardian consent design, deletion/retention verification, and third-party security review. No real private or clinical writing until those gates close.

### Acceptance: fictional text only

1. Open Words; see **Autosave off**. Type a fictional draft, choose Enable encrypted device autosave, wait for **Saved on this device**. Reload `/words`, confirm the text and prompt recover.
2. Lock after inactivity or click Lock now, sign back in with passkey, confirm the same fictional draft is restored.
3. Switch to another account or circle and verify it does not display the original draft. Switch back and verify restoration (same device only).
4. Change text, wait for the save indicator, refresh, check last saved content. Test visibility/background resume, and network offline (no API draft writes).
5. Open two tabs with the same account/circle and edit the same previously saved draft. The second stale writer must show a conflict and require explicit choice; it must never silently replace the newer ciphertext.
6. Select sharing-preview recipients, refresh, and verify restored draft stays **Just me** with no selected recipients.
7. Discard; verify no draft returns after refresh and the key remains available for a new encrypted draft. Check storage-permission denial and cleared site data.
8. Confirm no journal plaintext is sent through APIs, query strings, push messages, logs or browser network requests. Check IndexedDB `carehold-words-local-v1`: draft records contain ciphertext/nonce/revision only, not typed text.
