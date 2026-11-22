# Carehold: post-E2E household usability fixes

The user's first full local E2E pass passed 10/10 scenarios but exposed workflow gaps. This corrective phase stays on the original **draft** `feat/carehold-mvp-foundation` branch; no staging/production deployment or merge is authorized.

## Dose records: observations, corrections, later outcomes

- A prior refused, skipped, missed, uncertain or *erroneously recorded* administration should never silently reopen a second scheduled dose. The unique initial occurrence record remains intact.
- New migration **0010_dose_correction_kind.sql** adds a nullable `dose_events.correction_kind` flag. A correction explicitly labeled **Not administered — earlier record was entered in error** stores `event_type='skipped'` plus `correction_kind='not_administered'`. The **original** event remains in history, and new corrections append to the existing chain.
- **Record a later outcome** is placed beside **Correct record** in administration history, not as a second primary action on the Today ledger. It opens a factual follow-up editor for the latest recorded status. It creates a new corrective successor with actual time and reason, rather than recording a duplicate initial occurrence. The earlier refusal or error remains in history. Only the current event may be corrected.
- This is a medication ledger, not medical advice: corrections do **not** decide whether another dose is clinically appropriate. The user checks original directions and history before administering.

## Words: journal-first without duplicated text fields

- The local encrypted autosave vault is now initialized automatically on first use (still local device storage, not cloud synchronization or a recovery system). Remove repeated enable controls; show storage errors and preserve explicit sending.
- After a successfully shared **Write** draft, the local draft is discarded; successful sharing of an existing saved journal entry updates only its device-local `sharedAt` marker. Starting a new prompt clears the previous draft after an explicit confirmation when unsaved text exists.
- Saved entries now support optional **encrypted titles**, local search over title/prompt/body, date range, shared/not-shared filters, and 10-entry pagination. Old title-less entries and encrypted backups still load.
- The shared space now has **one Discussion composer** with two explicit actions: **Post private note · only me** (encrypted in local journal, linked to `spaceId`) or **Post reply · everyone** (per-recipient encrypted share). Private notes are visibly labeled and never transmitted to the space API. Previously shared reflections remain readable in the same board; an older unfinished reflection draft can be moved into the unified composer.
- Manual encrypted journal backups include title, sharing markers, and private discussion note associations. They still exclude live shared-space private keys and unsent drafts. An unexported browser vault can still be lost when browser storage is cleared.

## People, roles, relationships and history

- Household access roles remain **Owner (administrator)**, **Caregiver (granted medication capabilities)** and **Member (no implicit medication privileges)**. An adult child may have an **Adult** medication profile and a **Member** account (or Caregiver when explicitly granted duties). Linked profiles do not imply journal access.
- Words prompt audiences **Adult/parent** (internally `parent`), **Teen**, **Child** remain **self-selected display preferences**, not verified age gates or privacy permissions. Adult-to-adult prompts are shown only in the Adult/parent prompt audience; all journal sharing requires explicit recipients. **Do not claim adult-only prompts are technically inaccessible to a minor who can self-select another audience.** A server-enforced family age/role system is deferred.
- Medication and profile archiving use existing `archived_at` columns, keep dose events and medication-change records and permit restore. Archived medicines leave Today; archived profiles leave active People lists.
- Archiving a **linked** profile does not revoke the account's household membership, remove them from existing discussions, delete old conversations, or erase prior encrypted copies. It excludes that linked account from **new** Words invitations and new direct-message contacts/conversations. Existing shared spaces may still receive replies; additional participant-retirement policy is needed before claiming archived accounts have stopped receiving new content in old spaces.
- Household member **Revoke access** remains separate and stronger than **Archive profile**. Revocation removes current access; it should not destroy historical dose event records.

## Consolidated QA requirements

Before using sensitive household data or deploying remotely, run:

```bash
git pull --ff-only
npm run db:backup:local
npm run db:local
npm run verify:pre-e2e
```

Then repeat a focused **post-E2E regression**:

1. Correct refused to not administered (entered in error), then record later observed outcome. Check ordered history and no second initial dose.
2. In Words, select prompt, write, share, return to Write; old text and prompt should be gone. Starting another prompt when there is an unsent draft asks before clearing.
3. In one shared space, post a device-private note and a public discussion reply from the same editor. Another participant can see only the shared reply, never the private note. Check old reflections still display.
4. Add a titled unprompted journal entry; search, date filter, shared filter, paginate, export and restore its encrypted backup.
5. Continue typing or dictating for more than three minutes while the tab remains visible; active sessions should refresh rather than lock. The local screen still locks after 3 minutes idle or 1 minute away, independent of a 30-minute sliding Better Auth server-session grace period. Reauthentication is still required after a local lock.
6. Review adult-to-adult prompts in adult audience, absent from Teen and Child audiences. Do not treat self-selection as verified age.
7. Archive and restore a medication and a profile, including a linked account. Verify Today excludes archived plans, dose history persists, existing shared conversations remain readable, and archived linked accounts cannot be added to **new** conversations.
8. Verify RxTerms search still works and selecting a product strength/form does not ask for duplicate form information; prescribed dose remains mandatory and manual.
9. Confirm responsive mobile layout, account boundaries, no native browser prompts, and passkey lock/unlock.

All new SQL migrations are **local-first**. Cloudflare staging and production have separate D1 stores and need explicit verification, backup and approval before migration/deploy. No production action is implied by local E2E success.

## Second feedback: activity without accessible shared spaces and interrupted correction writing

- **Do not confuse activity metadata with decryption success.** `WordsHub` first checks the browser-local nonextractable ECDH key against the enrolled `message_device_keys` public key. One account has **one browser-profile device key** in this pilot; signing into the same account in a different browser, incognito profile or different origin creates a different key. Do not rotate/reset the server public key to work around this; old envelopes could become unreadable. The intended remedy is to revisit the original browser profile for that account, avoiding site-data deletion. Secure multi-device/key recovery requires separate design before real data.
- `SharedSpaces` fetches the **authorized server metadata even when `identity` is null**. A key mismatch no longer fakes an empty shared list; list entries carry encrypted-content-unavailable labels, and Activity navigation never stays indefinitely on a spinner without a specific error. A metadata-only list does not expose journal plaintext and does **not** grant access to excluded accounts. If the server returns no entries for an account, the app tells the user to check the intended **user account**, not merely a medication profile.
- While interacting (including actual text input and composition), the inactivity hook initiates a throttled **real network** `/api/auth/get-session` refresh rather than relying on an SDK cache or background interval alone. Confirm server inactivity and away rules still apply. A session invalidated by a concurrent account switch in another tab is intentionally **not** silently carried over.
- If a passkey lock interrupts an **unfinished dose correction**, preserve its reason, selected outcome, timestamp and idempotency key **in the same JavaScript tab's memory only**. After passkey sign-in, restore it only when the authenticated user ID and household both match. A deliberate sign-out/account change clears it, and closing or refreshing the tab still loses it. This is not durable autosave, not encrypted storage, and not a replacement for the still-unreviewed care data security model.
- Always use separate browser profiles or separate browsers **per test account**. Switching from one account to another in the same browser profile changes the session for every tab of that profile and may trigger a defensive lock.

### Focused regression for this feedback
1. In a single browser profile/account, type a fictional correction reason continuously for 4+ minutes. Confirm no idle lock, with actual GET session refresh calls in network logs and a current server session. Stop interacting for >3 minutes and verify the intended screen lock still works. Unlock using the **same account** and confirm the unfinished reason and chosen event are restored. Check deliberate sign-out does not restore writing. An unexpectedly timed lock on an active tab remains a NO-GO.
2. Verify the later-outcome action now appears only beside the latest non-given event in administration history.
3. Send a fictional Words prompt to a second account that was enrolled in its **own** browser profile. Verify server metadata list, decryption, and discussion/private-notes boundaries on both profiles.
4. Log into the recipient account from a *different* browser profile that lacks its original encryption key. Confirm Activity links to a shared space that **shows an explicit key error** and Shared Spaces still lists its metadata, not a false empty state. Return to its original profile and confirm the writing is readable there.
5. If Activity shows an item but even the server metadata list is truly empty, inspect that exact account/household permission and the corresponding `shared_word_participants`/`shared_word_copies` D1 records without changing or deleting ciphertext.

Remain in fictional-data pilot. No key replacement, reset, staging or production deployment is authorized by this corrective pass.
