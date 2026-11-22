-- Pilot audience classification is intentionally separate from household permissions.
-- No dates of birth or clinician privileges are stored at this stage.
CREATE TABLE account_audiences (
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 audience TEXT NOT NULL CHECK(audience IN ('parent','child','teen')),
 updated_at TEXT NOT NULL
);
-- A one-time invite can be staged after account signup, without recording its
-- bearer token or granting membership until the passkey gate has succeeded.
CREATE TABLE pending_household_invites (
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 invitation_id TEXT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL
);
