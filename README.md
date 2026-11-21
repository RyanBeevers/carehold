# carehold.

**Care, held together.** An invite-only family and pet medication ledger with a journal-first Words prototype.

## Current development milestone

The `feat/carehold-mvp-foundation` draft branch now implements medication schedules, an administration ledger, corrections, profile-scoped permissions, passkeys, optional medication reminders, and a redesigned Words hub with prompts, encrypted local journal entries, explicit multi-person sharing, discussion and recipient-private unread activity.

**Not deployed; not security-audited; not a clinical system.** The RxTerms medication directory supports opt-in brand/generic name autocomplete with manually entered dosing and a full custom/veterinary fallback (see [catalog architecture](./docs/MEDICATION_CATALOG.md)). The local journal and shared-content encryption are experimental, single-device, unreviewed and not approved for real confidential child, medical or therapeutic writing. Cloudflare staging and production targets are still placeholders. Medication logging should only replace existing household recordkeeping after tests, account access, backup and recovery are verified.

For setup and local D1 backup, see **[Household first-day checklist](./docs/HOUSEHOLD_FIRST_DAY.md)**. Run **[the consolidated E2E acceptance gate](./docs/E2E_ACCEPTANCE.md)** once at feature freeze, after all code changes are included. For engineering and privacy boundaries, see [AGENTS.md](./AGENTS.md), [docs/SETUP.md](./docs/SETUP.md), and [docs/SECURITY.md](./docs/SECURITY.md).
