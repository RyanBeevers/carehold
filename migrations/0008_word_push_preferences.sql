PRAGMA foreign_keys=ON;
-- Word/activity push is an independent, explicit preference; default OFF.
-- A device subscription is necessary, but opting into medication reminders alone
-- must never silently opt a person into private word notifications.
CREATE TABLE private_word_push_preferences (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 PRIMARY KEY(user_id,household_id)
);
