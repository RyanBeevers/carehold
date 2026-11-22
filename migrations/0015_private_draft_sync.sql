PRAGMA foreign_keys=ON;
-- Unsynchronized/unsent content remains recipient-private. The server stores
-- only ciphertext and an opaque client-side scope hash, never a draft body.
CREATE TABLE private_draft_sync (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 scope_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=1),
 iv TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 deleted_at INTEGER,
 PRIMARY KEY(user_id,household_id,scope_id)
);
CREATE INDEX draft_sync_owner ON private_draft_sync(user_id,household_id,scope_id);
