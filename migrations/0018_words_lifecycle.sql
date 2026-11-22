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
-- Enforce authorization at the storage boundary even if a concurrent
-- household revocation, space removal or departure followed an API check.
-- The insertion order is: space -> participants -> post -> recipient copies.
CREATE TRIGGER shared_words_no_post_in_removed_space BEFORE INSERT ON shared_word_posts
WHEN NOT EXISTS(
 SELECT 1 FROM shared_word_spaces s
 JOIN shared_word_participants p ON p.space_id=s.id AND p.user_id=NEW.author_id AND p.left_at IS NULL
 JOIN household_members hm ON hm.household_id=s.household_id AND hm.user_id=NEW.author_id
 WHERE s.id=NEW.space_id AND s.deleted_at IS NULL
)
BEGIN SELECT RAISE(ABORT,'Shared space or author no longer active'); END;
CREATE TRIGGER shared_words_no_copy_to_departed_participant BEFORE INSERT ON shared_word_copies
WHEN NOT EXISTS(
 SELECT 1 FROM shared_word_posts post
 JOIN shared_word_spaces s ON s.id=post.space_id AND s.deleted_at IS NULL
 JOIN shared_word_participants p ON p.space_id=post.space_id AND p.user_id=NEW.recipient_id AND p.left_at IS NULL
 JOIN household_members hm ON hm.household_id=s.household_id AND hm.user_id=NEW.recipient_id
 WHERE post.id=NEW.post_id AND post.deleted_at IS NULL
)
BEGIN SELECT RAISE(ABORT,'Recipient cannot receive a copy in this shared space'); END;
