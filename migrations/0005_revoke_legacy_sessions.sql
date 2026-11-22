-- A one-time reauthentication boundary when switching from the old
-- seven-day Better Auth session policy to a three-minute banking-style policy.
-- Existing sessions are deliberately invalidated; users sign in again with
-- their existing passkeys/passwords. Accounts, profiles, care and audit data
-- remain intact. Run remote migrations only with explicit authorization.
DELETE FROM session;
