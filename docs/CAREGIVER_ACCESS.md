# Care Circle medication access

The owner manages invitations, medication profiles and grants. `Caregiver` is **not** a household owner and never grants journal, private Words, direct message or conversation access. Member classification is a server-side restriction independent of the self-selected prompt audience.

- **Full-circle caregiver:** sees every active person/pet, their medication plans, history and Today's entries, including profiles added after invitation; full-circle access (viewing and editing) becomes effective only after the owner classifies the account Adult.
- **Limited caregiver:** sees only expressly selected profiles and a configured set of medication capabilities. Viewing schedules is mandatory when selecting a profile; recording, history viewing and editing a plan can be independently included.
- **Member:** remains limited by granted capabilities and their own linked Adult profile. Teen and Child account classifications cannot mutate medication records.
- **Circle roster:** owners and caregivers see names/roles; only owners see member email/classification and access-control settings. Roster access does not confer medication or Words access.

Existing caregivers start **limited** after migration 0017. To upgrade a current caregiver, the owner visits **Care Circle → Manage access → Full circle → Save access**. No new invitation, account reset, identity relink, deletion, or loss of dose history is needed. Owner changes append `member_access_changes` audit rows. Switching a full-circle caregiver to limited removes implicit all-profile privileges immediately and applies the explicitly selected profile grants.

Test on staging with fictional profiles: owner grants full-circle caregiver; caregiver sees all old and new people, can edit/record after Adult classification, cannot edit another household, cannot view private Words; switch to limited and confirm other profiles disappear from People/Today and API denies direct access. Test revocation and an invited Teen/Child separately. Never use a client's ability to hide a button as the authorization mechanism; every care read/write is rechecked by the Worker.

The same code adds a separate manual mobile-friendly GitHub Actions release path; see [GitHub manual release guide](GITHUB_MANUAL_RELEASES.md).
