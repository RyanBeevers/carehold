# Carehold: first household pilot day

**Status:** Developer branch `feat/carehold-mvp-foundation`, not a cloud deployment. This guide helps verify the app today, not certify it as secure, clinical or production-ready. Do not put real sensitive family writing in the shared-journal experiment before the encryption/recovery and minors' privacy gates are reviewed.

## Preflight on the Mac

From the existing Carehold project:

```bash
git switch feat/carehold-mvp-foundation
git pull --ff-only
npm install
npm run db:local
npm test
npm run typecheck
npm run build
npm run db:backup:local
```

Do not enter actual household medication history unless the tests/build pass, the intended care circle is correct, and a backup/restore procedure is ready. `db:backup:local` creates a local SQL export in an ignored `backups/` directory, with restrictive file permissions. **This SQL export contains sensitive medication and authentication data in readable form.** Keep it on a protected device. The journal's separate IndexedDB keys and entries are **not** backed up by this export.

Run `npm run dev:worker` and `npm run dev` in separate terminals. Use **http://localhost:5173** on the same Mac. Do not change this to port 8787 or to a LAN hostname for passkey testing.

### Medication setup (owner/caregiver)

1. Sign in via a passkey. Create/select the intended care circle; confirm its timezone.
2. Go to **People** and add relevant adults, children, and pets. Do not create duplicated profiles for the same person.
3. For each person, add their currently prescribed medicines. **Copy the medication name, dose, instructions, start date and schedule from the prescription/container or veterinarian's directions**—not from memory or guesses. Available schedules: daily, specific weekdays, every N days, and PRN (as needed).
4. Return to **Today**. Check the correct date, each person, medication, dosage and scheduled time. The day will contain scheduled doses; PRN medications are recorded from the person's profile rather than a fictitious scheduled occurrence.
5. To log a dose, choose an outcome explicitly: **Taken/given, Skipped, Refused, Not sure, or Confirmed missed**. Confirm the actual timestamp and person. `Not sure` is a real recording option, not a cue to give a repeat dose. Do not automatically convert unrecorded/overdue items to missed.
6. After recording, verify the Today status and the person's **Administration history**. Correct mistakes through **Correct**, which appends an auditable correction instead of erasing the original.
7. If scheduling details change, verify Today again; history remains preserved, but a new scheduled time can generate a new occurrence. Use the original prescription and administration log to avoid accidental duplicate doses, and involve the prescriber if unsure.

**Safeguard:** Until household devices and backups are verified, keep the prescription label/paper or your previously reliable medication process as the primary reference. Carehold is not a medication dispenser or guaranteed medical alarm.

### Private journal and prompt-first shared spaces

1. Go to **Words → Explore prompts**. Choose a question using the relationship/category filters or shuffle. Use **Write from this** to keep the prompt attached, or **Share prompt** to invite selected members without writing first.
2. In **Write**, enable encrypted local draft autosave if you might be interrupted. **Save privately** to add a separate encrypted entry to **My journal**; writing is never shared automatically. In **My journal**, export a separate *passphrase-encrypted* backup and verify that you can restore it using the same account and care circle, without overwriting current entries. Store the file and its unique passphrase separately; this backup does not contain shared-space keys, unsent drafts, or medication records.
3. For a fictional/test entry, **Share this entry** or **Share snapshot**, confirm the exact recipients (1–10), then press the final share button. Each recipient must first open Words or Messages on their own browser origin to enroll a key.
4. Recipients open **Words → Activity** or **Shared spaces** to see the prompt, original entry, their optional private response, and the discussion. **Save privately** is not the same as **Share response with everyone**.
5. New items appear as recipient-only unread counts in navigation and refresh while the app is attended. Words device notifications are separately opt-in and generic; they need VAPID configuration, an installed browser push subscription, and OS permission.

**Critical storage distinction:** Local D1 medication data, local encrypted journal entries, and Cloudflare staging/production data are three different stores. None automatically migrates to another. `My journal` uses browser-local IndexedDB ciphertext + a same-origin key; **clearing browser data, switching browser profiles or moving to a new cloud hostname can make those entries unavailable or permanently unrecoverable.** Do not rely on this experimental journal for irreplaceable writing.

### Why family devices cannot join the localhost pilot yet

`localhost:5173` means the development computer itself. Other family devices will not access the same Carehold server just by opening that URL. To test across phones/laptops, configure a **private HTTPS Cloudflare staging deployment** with its own D1 database ID, actual `APP_ORIGIN`, separate secrets, a working passkey RP ID, and an explicit migration/backup step. The repository's `wrangler.jsonc` still has placeholder staging/production IDs/hosts; no cloud deployment is configured by this branch. Do not put actual family data into a public, guessed, or temporary test origin.

### Home acceptance smoke test

- [ ] `npm test`, `npm run typecheck`, `npm run build` pass after `npm run db:local`
- [ ] Sign in, lock and passkey-unlock restore the correct account and page
- [ ] Each medication's schedule and dose match the source directions; PRN is not auto-scheduled
- [ ] A dose cannot be recorded without selecting an explicit outcome
- [ ] Duplicate scheduled-dose submission is rejected; original log and correction history preserved
- [ ] Words prompt → Write → local private save → reopen and edit works
- [ ] Two fictional accounts share a prompt or entry and discuss with the expected recipient-only access
- [ ] Unread badge appears for recipient, clears when readable, and never exposes read status to sender
- [ ] Browser/site-data reset has not been used as a supposed recovery method; separate backups are understood
- [ ] No remote/staging/production migration has been run without inspecting the actual database targets

**Stop and report failures before switching from fictional test cases to household data.** See [E2E_ACCEPTANCE.md](./E2E_ACCEPTANCE.md) for the consolidated final E2E test instead of repeating partial manual testing after each code change.
