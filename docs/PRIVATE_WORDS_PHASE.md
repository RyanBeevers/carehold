# Carehold — private Words and sharing pilot

**Current branch status (2026-11-21):** The journal-first Words interface and encrypted multi-recipient shared-space prototype are now implemented on the draft feature branch. **Fictional test data only.** This is not a reviewed E2EE product, not approved for real medical/therapeutic/minor confidential writing and not deployed. Older entries below describe previous iterations; see the latest journal-first section at the end for the current working scope.


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


## Words → Messages handoff (local navigation, unsent, 2026-11-21)
The old Words sharing controls remain a **recipient preview only**. The formerly inert
"Sending not enabled" label is replaced with an explicit **Continue in Messages** action.
This transfers only the user's chosen draft text (or standalone prompt) through ephemeral
React application state, not via the URL, query parameters, browser storage or API. The
recipient preview selections never transfer, because only one-to-one messaging is enabled.
On Messages the user chooses a conversation, confirms whether to apply the Words note to
that conversation draft (replacing any preexisting one), and finally presses **Send
intentionally**. Navigation and applying text never send automatically. The handoff is
cleared when leaving Messages, switching circles, signing out or locking. The original
Words note is not deleted by handoff; if its local autosave was off, leaving Words
still discards its original draft as before. Test exclusively with fictional text.

## Journal-first Words, shared spaces and activity (feature branch, 2026-11-21)

### Product experience
- **Explore prompts:** Browse 100+ audience-scoped prompts using relationship/category filters, keyword search and a non-repeating shuffle. Each prompt offers **Write from this** and **Share prompt** directly from the library. Prompts do not require using Messages.
- **Write:** Prompt-aware private writing in the existing opt-in encrypted local draft vault. **Save privately** persists a separate encrypted journal shelf entry on the current device; **Share this entry** opens an explicit participant selection, creating a separate encrypted immutable snapshot. There is no automatic sending or sharing of drafts.
- **My journal:** Locally encrypted, per-account/per-circle saved entries with explicit edit, snapshot share and two-step deletion. Entries are not automatically synchronized to another browser/device, recoverable after site-data clearing, or safe for real sensitive content.
- **Shared spaces:** Either a prompt-only invitation or a full entry plus optional prompt. Choose 1–10 explicitly named other members who have registered a device key; all recipients share one discussion. Each participant can write a private reflection, save it in their own device journal, or deliberately share it with everyone. Discussion replies are deliberate group posts. The initial prompt/entry remains prominent above the conversation.
- **Activity:** A recipient-only unread inbox for shared spaces, and unread badges for both Words and existing direct Messages. Active screens refresh periodically while attended, without requiring a page reload. Opening a shared space or direct message privately clears that recipient's unread items; the sender cannot query view/read/typing/draft/ack status.
- **Device push:** Generic optional notification on new activity, using an existing device subscription **and a separate, default-off Words notification preference**. It never includes a sender name, prompt, journal text, recipient list or medical detail. The existing medication reminder preference alone does not activate Words push.

### Data and cryptography
- `0007_shared_words_activity.sql` introduces `shared_word_spaces`, `shared_word_participants`, `shared_word_posts`, `shared_word_copies`, and `private_word_activity`. The Worker checks signed-in/passkey status before these routes, current care-circle membership, and explicit space participation on every read/write. Posts are encrypted into one client-generated envelope per currently authorized participant. D1 retains only ciphertext envelopes and metadata, not plaintext prompt, journal, reflection or discussion strings.
- `0008_word_push_preferences.sql` independently governs Words push opt-in. Activity `seen_at` is recipient-private; no API exposes this to senders. Membership revocation removes shared-space participant access and the former member's pending activity.
- `src/lib/private-journal.ts` stores individual journal entries as AES-GCM ciphertext with a nonextractable same-origin IndexedDB key and authenticated account/circle/entry binding. Editing uses revision conflict protection. Deleting an entry deletes its local ciphertext record, **not any previously shared encrypted snapshot**.
- `src/lib/words-space-crypto.ts` wraps the existing per-recipient ECDH/HKDF/AES-GCM pilot for a structured `prompt | journal | reflection | discussion` payload. No sensitive plaintext is sent through the new HTTP routes. The original one-to-one Messages feature remains separate.

### Hard limitations / required release gates
This is **not independently verified E2EE**. Public-key identity uses trust on first use without out-of-band recipient verification; the same-origin browser may invoke nonexportable keys, and there is no robust device backup/recovery, key transparency, cross-device journal sync, participant-change encryption/rotation, security audit, guardian/minor privacy consent or deletion/retention review. Prompts and journal answers may be highly sensitive. Do not store real family, patient, child, or therapeutic content until those issues have been reviewed and resolved.

### Local test checklist (fictional accounts and text only)
1. On `feat/carehold-mvp-foundation`, run `npm run db:local`, `npm test`, `npm run typecheck`, and `npm run build` before UI testing. Do **not** apply these migrations remotely without authorization.
2. Start Worker and Vite in separate terminals, open `http://localhost:5173`. Sign in as the household owner and one or two invited test accounts in separate browser profiles/incognito sessions. Have **each account open Words once** to register a device key.
3. Explore prompts: filter, search, shuffle, write from a prompt. Confirm writing is not lost when switching between Words tabs. Enable device draft autosave; reload and verify restore.
4. Save a fictional entry privately; reopen/edit it, refresh, and verify the local shelf. Confirm a different account/device has no access; test private journal delete confirmation. Verify the Worker received no plaintext for local saves.
5. Share a prompt-only invitation with two explicitly selected participants. Each recipient sees the original prompt, and can optionally write a reflection privately, save it locally, share it, or post a discussion reply.
6. Share a completed fictional entry. Confirm the original prompt plus entry remain visible above the discussion on all selected accounts; never infer receipt from read/typing activity.
7. Verify the Words badge updates for recipients without refreshing and disappears when they open the shared space. Verify direct-message unread badges similarly while Messages remains a separate feature.
8. Verify a household owner **not selected** as a participant cannot request the shared-space URL or ciphertext. Remove a member: the account cannot access the previous shared space after rejoining. Test negative access using different signed-in accounts, not just hidden UI.
9. Opt into Words push only on a device with an existing subscription; verify generic content on the lock screen. Keep Words push OFF if only medication reminder notifications were previously enabled. Check service-worker receipt vs actual OS display separately.
10. Confirm dark/light and mobile widths, three-minute idle lock, one-minute background lock, cross-account and cross-care-circle isolation, and no plaintext in IndexedDB rows, D1, network logs, notifications or analytics. Do not publish or deploy from these local tests alone.
