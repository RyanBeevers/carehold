PRAGMA foreign_keys=ON;
-- Device-proven, ciphertext-only recovery-code replacement. Every rotation has
-- its own immutable audit history; no old key/ciphertext is deleted.
CREATE TABLE account_recovery_rotations (
 rotation_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 original_jwk TEXT NOT NULL,
 next_jwk TEXT NOT NULL,
 next_envelope_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('staged','complete')),
 created_at INTEGER NOT NULL,
 completed_at INTEGER
);
CREATE UNIQUE INDEX one_pending_account_rotation ON account_recovery_rotations(user_id) WHERE state='staged';
CREATE INDEX recovery_rotation_latest ON account_recovery_rotations(user_id,state,completed_at DESC);
CREATE TABLE account_recovery_rotation_challenges (
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 original_jwk TEXT NOT NULL,
 proof_digest TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE account_recovery_rotation_copies (
 rotation_id TEXT NOT NULL REFERENCES account_recovery_rotations(rotation_id) ON DELETE CASCADE,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('direct','words')),
 source_id TEXT NOT NULL,
 envelope_json TEXT NOT NULL,
 PRIMARY KEY(rotation_id,source_kind,source_id)
);
CREATE TABLE account_recovery_rotation_journals (
 rotation_id TEXT NOT NULL REFERENCES account_recovery_rotations(rotation_id) ON DELETE CASCADE,
 household_id TEXT NOT NULL,
 entry_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL CHECK(expected_revision>0),
 iv TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 PRIMARY KEY(rotation_id,household_id,entry_id)
);
CREATE TABLE account_recovery_rotation_drafts (
 rotation_id TEXT NOT NULL REFERENCES account_recovery_rotations(rotation_id) ON DELETE CASCADE,
 household_id TEXT NOT NULL,
 scope_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL CHECK(expected_revision>0),
 iv TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 PRIMARY KEY(rotation_id,household_id,scope_id)
);
-- A complete rotation is immutable: old enrolled envelopes and all historical
-- staged copies must stay available for audit and interruption analysis.
CREATE TRIGGER protect_completed_rotation_delete BEFORE DELETE ON account_recovery_rotations
WHEN OLD.state='complete'
BEGIN SELECT RAISE(ABORT,'Completed recovery rotations cannot be deleted'); END;
CREATE TRIGGER protect_completed_rotation_copies_delete BEFORE DELETE ON account_recovery_rotation_copies
WHEN EXISTS(SELECT 1 FROM account_recovery_rotations WHERE rotation_id=OLD.rotation_id AND state='complete')
BEGIN SELECT RAISE(ABORT,'Completed recipient copies cannot be deleted'); END;
CREATE TRIGGER protect_completed_rotation_journal_delete BEFORE DELETE ON account_recovery_rotation_journals
WHEN EXISTS(SELECT 1 FROM account_recovery_rotations WHERE rotation_id=OLD.rotation_id AND state='complete')
BEGIN SELECT RAISE(ABORT,'Completed journal ciphertext cannot be deleted'); END;
CREATE TRIGGER protect_completed_rotation_drafts_delete BEFORE DELETE ON account_recovery_rotation_drafts
WHEN EXISTS(SELECT 1 FROM account_recovery_rotations WHERE rotation_id=OLD.rotation_id AND state='complete')
BEGIN SELECT RAISE(ABORT,'Completed draft ciphertext cannot be deleted'); END;
-- Final transition is the commit barrier, validated atomically inside the D1
-- transaction, after old-key ciphertext has been staged and verified.
CREATE TRIGGER verify_recovery_rotation_finalization BEFORE UPDATE OF state ON account_recovery_rotations
WHEN NEW.state='complete'
BEGIN
 SELECT CASE WHEN OLD.state<>'staged' OR NEW.next_jwk<>OLD.next_jwk
  THEN RAISE(ABORT,'Invalid rotation state transition') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM message_device_keys WHERE user_id=OLD.user_id AND public_jwk=OLD.next_jwk
 ) OR NOT EXISTS(
  SELECT 1 FROM message_account_recovery WHERE user_id=OLD.user_id AND public_jwk=OLD.next_jwk AND envelope_json=OLD.next_envelope_json
 ) THEN RAISE(ABORT,'Recovery identity was not committed') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM encrypted_message_copies c JOIN encrypted_messages m ON m.id=c.message_id
  JOIN direct_threads t ON t.id=m.thread_id
  JOIN direct_thread_members tm ON tm.thread_id=t.id AND tm.user_id=OLD.user_id
  JOIN household_members hm ON hm.household_id=t.household_id AND hm.user_id=OLD.user_id
  WHERE c.recipient_id=OLD.user_id
  AND NOT EXISTS(SELECT 1 FROM account_recovery_rotation_copies sc
   WHERE sc.rotation_id=OLD.rotation_id AND sc.source_kind='direct' AND sc.source_id=m.id)
 ) THEN RAISE(ABORT,'Unmigrated direct messages remain') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM shared_word_copies c JOIN shared_word_posts p ON p.id=c.post_id
  JOIN shared_word_spaces s ON s.id=p.space_id
  JOIN shared_word_participants sp ON sp.space_id=s.id AND sp.user_id=OLD.user_id
  JOIN household_members hm ON hm.household_id=s.household_id AND hm.user_id=OLD.user_id
  WHERE c.recipient_id=OLD.user_id
  AND NOT EXISTS(SELECT 1 FROM account_recovery_rotation_copies sc
   WHERE sc.rotation_id=OLD.rotation_id AND sc.source_kind='words' AND sc.source_id=p.id)
 ) THEN RAISE(ABORT,'Unmigrated shared Words remain') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM private_journal_sync j WHERE j.user_id=OLD.user_id AND j.deleted_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM account_recovery_rotation_journals sj
   WHERE sj.rotation_id=OLD.rotation_id AND sj.household_id=j.household_id AND sj.entry_id=j.entry_id
   AND j.revision=sj.expected_revision+1 AND j.iv=sj.iv AND j.ciphertext=sj.ciphertext)
 ) THEN RAISE(ABORT,'Unmigrated private journal entries remain') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM private_draft_sync d WHERE d.user_id=OLD.user_id AND d.deleted_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM account_recovery_rotation_drafts sd
   WHERE sd.rotation_id=OLD.rotation_id AND sd.household_id=d.household_id AND sd.scope_id=d.scope_id
   AND d.revision=sd.expected_revision+1 AND d.iv=sd.iv AND d.ciphertext=sd.ciphertext)
 ) THEN RAISE(ABORT,'Unmigrated synchronized drafts remain') END;
END;
