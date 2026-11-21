PRAGMA foreign_keys=ON;
-- Authoritative medication permissions are household scoped and separate from
-- self-selected Words prompt copy. 'unverified' fails closed on care mutations.
CREATE TABLE household_member_classes (
 household_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 classification TEXT NOT NULL CHECK(classification IN ('adult','teen','child','unverified')),
 assigned_by TEXT REFERENCES user(id),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(household_id,user_id),
 FOREIGN KEY(household_id,user_id) REFERENCES household_members(household_id,user_id) ON DELETE CASCADE
);
INSERT INTO household_member_classes(household_id,user_id,classification,assigned_by,updated_at)
SELECT household_id,user_id,CASE WHEN role='owner' THEN 'adult' ELSE 'unverified' END,NULL,joined_at
FROM household_members;

CREATE TABLE household_member_class_changes (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 previous_class TEXT NOT NULL,
 next_class TEXT NOT NULL,
 changed_by TEXT NOT NULL REFERENCES user(id),
 changed_at TEXT NOT NULL,
 FOREIGN KEY(household_id,user_id) REFERENCES household_members(household_id,user_id) ON DELETE CASCADE
);
