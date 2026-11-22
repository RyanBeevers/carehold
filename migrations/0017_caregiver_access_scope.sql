-- Existing caregiver invitations and memberships remain limited until an owner explicitly upgrades them.
ALTER TABLE household_members ADD COLUMN access_scope TEXT NOT NULL DEFAULT 'limited'
  CHECK(access_scope IN ('limited','full'));
ALTER TABLE invitations ADD COLUMN access_scope TEXT NOT NULL DEFAULT 'limited'
  CHECK(access_scope IN ('limited','full'));

-- Append-only administrative audit, retained if a member is later revoked.
CREATE TABLE member_access_changes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  previous_scope TEXT NOT NULL,
  next_scope TEXT NOT NULL,
  before_grants_json TEXT NOT NULL,
  after_grants_json TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES user(id),
  changed_at TEXT NOT NULL
);
CREATE INDEX member_access_changes_history ON member_access_changes(household_id,user_id,changed_at);
