# Carehold — next release design gate: private words and selective sharing

**Status:** design-only workstream. No journal or message API/storage is enabled here. The pilot is not authorized to hold real sensitive personal writing.

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
