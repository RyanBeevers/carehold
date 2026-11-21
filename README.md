# carehold.

**Care, held together.** An invite-only family and pet medication ledger with a journal-first Words prototype.

## Current development milestone

The `feat/carehold-mvp-foundation` draft branch now implements medication schedules, an administration ledger, corrections, profile-scoped permissions, passkeys, optional medication reminders, and a redesigned Words hub with prompts, encrypted local journal entries, explicit multi-person sharing, discussion and recipient-private unread activity.

**Not deployed; not security-audited; not a clinical system.** The RxTerms medication directory provides optional brand/generic suggestions and does not prescribe dosing (see [catalog architecture](./docs/MEDICATION_CATALOG.md)). The draft branch now adds a v2 recovery code for encrypted messages, journals and successfully synced drafts, plus staged non-destructive migration of legacy shared ciphertext from the original browser. Saving a recovery code is guided for Apple Passwords, other managers and locked notes, but Carehold cannot automatically save to the iPhone Passwords app. These recovery features still lack independently revocable device keys and external security testing. Do not use confidential child, medical or therapeutic writing in this pilot. Cloudflare staging and production resource IDs and origins remain placeholders.

**Current release workflow:** `npm run verify:pre-e2e` now runs **TypeScript first**, then 107+ Node cases, 36+ Python cases and the production build. After local E2E, follow **[Cloudflare staging setup and release](./docs/CLOUDFLARE_STAGING.md)**. The guarded `npm run release:staging` command backs up staging D1, applies migrations and deploys fresh assets only after explicit confirmation. This is staging only; it does not deploy production or imply approval for real sensitive records.

For setup and local D1 backup, see **[Household first-day checklist](./docs/HOUSEHOLD_FIRST_DAY.md)**. Run **[the consolidated E2E acceptance gate](./docs/E2E_ACCEPTANCE.md)** once at feature freeze, after all code changes are included. For engineering and privacy boundaries, see [AGENTS.md](./AGENTS.md), [docs/SETUP.md](./docs/SETUP.md), and [docs/SECURITY.md](./docs/SECURITY.md).

## Post-E2E usability corrections

First household functional acceptance exposed dose-correction and Words UX gaps. The development branch now includes append-only **not administered** and **later outcome** workflows, archive/restore for medicines and profiles, automatic encrypted draft autosave, one discussion editor with device-private notes, optional encrypted journal titles, search/date/share filters and pagination, and adult-to-adult prompts. See [post-E2E feedback and regression plan](./docs/POST_E2E_FEEDBACK.md). **These changes require a fresh local migration, full tests and focused browser regression before household deployment.**
