# Carehold — next release design gate: private words and selective sharing

**Status:** **local-only, nonpersistent prototype implemented** (Words → Try writing). No journal/message storage, encryption key exchange or send API is enabled. The pilot is not authorized to hold real sensitive personal writing.

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
