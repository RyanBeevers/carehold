PRAGMA foreign_keys=ON;
-- Private journals are encrypted on the user's device with an independent
-- recovery-backed content key. No journal plaintext, titles or prompts in D1.
-- Only the authenticated owner can access this table through the API.
CREATE TABLE private_journal_sync (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 entry_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 iv TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 deleted_at INTEGER,
 PRIMARY KEY(user_id,household_id,entry_id)
);
CREATE INDEX private_journal_sync_owner ON private_journal_sync(user_id,household_id,entry_id);
