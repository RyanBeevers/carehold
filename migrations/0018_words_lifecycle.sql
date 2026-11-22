PRAGMA foreign_keys=ON;
-- Mark content inaccessible without deleting immutable encrypted recovery history.
-- Prior recipient plaintext cannot be recalled; historical encrypted copies remain
-- for migration/rotation audit and are excluded from all live Words reads.
ALTER TABLE shared_word_spaces ADD COLUMN deleted_at TEXT;
ALTER TABLE shared_word_posts ADD COLUMN deleted_at TEXT;
ALTER TABLE shared_word_participants ADD COLUMN left_at TEXT;
-- Needed so a removed reply clears only its own recipient-private activity.
ALTER TABLE private_word_activity ADD COLUMN post_id TEXT;
CREATE INDEX private_word_activity_post ON private_word_activity(post_id,user_id);
