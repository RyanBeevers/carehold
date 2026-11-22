-- Linking an account is identity only; it never grants access.
CREATE UNIQUE INDEX profile_link_one_per_circle
 ON profiles(household_id,linked_user_id) WHERE linked_user_id IS NOT NULL;
CREATE TABLE profile_link_changes (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL REFERENCES households(id),
 profile_id TEXT NOT NULL REFERENCES profiles(id),
 previous_user_id TEXT REFERENCES user(id),
 next_user_id TEXT REFERENCES user(id),
 changed_by TEXT NOT NULL REFERENCES user(id),
 changed_at TEXT NOT NULL
);
CREATE INDEX profile_link_change_profile ON profile_link_changes(profile_id,changed_at);
-- Limits user-initiated push tests. Never records notification contents.
CREATE TABLE push_test_rate_limits(
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 last_sent_at TEXT NOT NULL
);
