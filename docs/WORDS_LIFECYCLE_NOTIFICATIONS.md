# Words lifecycle, private journal sharing and notifications

## Scope (fictional-data pilot)

This feature remains a fictional-writing pilot, **not** an independent security/privacy certification. Keep medical, therapeutic and child-confidential content out until the release gates in `AGENTS.md`, `docs/SECURITY.md` and `docs/CLOUDFLARE_PRODUCTION.md` have been completed.

### Sharing does not delete your private journal entry

- Sharing from **Write** creates a separate encrypted shared snapshot and **saves the author's private journal entry** before clearing the local draft.
- Sharing an already saved entry preserves the original entry and updates its `sharedAt` status and most recent `spaceId`.
- The recipient cannot edit the private journal copy. Later edits to the private original do **not** silently change the shared snapshot.
- If recipients receive the share but the separate private save fails, the author sees an explicit warning. The app keeps their current device draft intact instead of pretending the share was canceled.
- Earlier unsaved entries that disappeared after sharing were **not actually written to the private journal**. The original author can open the still-accessible shared journal space and select **Save a private journal copy** to recover its decrypted shared snapshot into their own journal. This does not change other participants' copies and avoids duplicating a matching private entry. If the original is undecipherable, preserve the original browser and encrypted backups; do not reset keys or invent data.

### Shared space lifecycle

- **Creator:** Can **Remove shared space → Remove for everyone** with an inline confirmation. It disappears from participants' shared lists and its replies no longer load, but unrelated private journal entries remain intact.
- **Other participants:** Can **Leave this shared space** with confirmation. Only their membership is marked inactive; the original creator and others can retain their shared space. New replies exclude the departed account.
- **Reply author:** Can **Remove my reply** on their own shared reflection/discussion, with confirmation. Other participants cannot remove that reply, and the original shared entry is handled at the space level.
- An owner/caregiver household role never confers access to or deletion rights over another person's private journal or shared space. Server enforcement is based on explicit space membership, creator and post author.
- Removal uses **tombstones**, preserving encrypted historical copies and account recovery/rotation audit data. This is **not secure erasure** and cannot recall content already decrypted, seen, screenshotted or retained by another participant. Don't promise recipients' devices are wiped.
- `0018_words_lifecycle.sql` adds `deleted_at`, `left_at`, `post_id` and race-prevention triggers; it must be applied to staging after a verified encrypted D1 backup. Do not run migrations on production before a separate reviewed release.

### Words notifications

- **In-app Activity** is recipient-only, independent of device push, and has no read/typing receipts.
- **Device push is optional and defaults OFF separately for Words.** Existing medication reminder opt-in does not automatically opt an account into private Words notifications.
- Each recipient opens **Words → Activity → Quiet device notifications** and enables notifications on their own installed iPhone Home Screen app (or another supported browser). The app requests OS permission only after a user gesture.
- With Words push enabled, **Send a test notification** checks whether the server/provider accepted generic notification delivery requests; acceptance does **not** guarantee the operating system displayed anything. The test is rate-limited and never includes content, names, recipients or medications. Check app notification permission, Focus modes and the registered device if nothing appears.
- Shared-space creation and shared replies enqueue generic push only to the other selected active participants when their Words preference is enabled and they have a registered push subscription. Private drafts and journal saves never trigger a shared push.
- If a push attempt fails, sharing itself must remain successful. In-app Activity remains the authoritative fallback.

## Manual multi-account acceptance test

Use **fictional content** and distinct browsers/profiles for two accounts (for example Ryan/Sara test identities). After local automated verification, test on isolated staging:

1. Start an unsaved Write entry, share it with the other account. Confirm the recipient sees a shared space and **the author still has their own private journal entry**. For an older shared-only journal space, test **Save a private journal copy** without changing the recipient's snapshot.
2. Edit the author's private entry. Confirm the recipient's shared snapshot stays unchanged.
3. Post a discussion reply as the other account. Confirm both participants can see it.
4. Remove only the author's reply; confirm it disappears from both views and the other person's replies remain.
5. Have the **recipient leave**; confirm their list and access disappear while creator retains the space. Confirm no future replies are sent to the departed account.
6. As the **creator**, remove the entire space. Verify no participant can list or open it, but the author's private journal entry still exists.
7. Verify a different participant cannot remove the creator's space or reply, even by calling the API directly; the API should return 403 or 404.
8. Confirm in-app Words Activity appears for share and reply independently of device notifications. When a space or post is removed, unrelated unread activity remains untouched.
9. On each device enable **Words notifications**; send a self-test and check OS notification settings. Share and reply between the test accounts. Check actual delivery when the app is in the background and on an installed iPhone PWA, not only in Safari.
10. Confirm incomplete/lost recovery, encryption mismatch and undecryptable messages still fail closed; no app owner inherits a private journal.

Review cloud D1 migration and the encrypted backup artifact before touching staging. Do **not** infer production readiness from passing automated tests.
