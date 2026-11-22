"""Recovery-code replacement is staged, recipient-scoped, and atomic at finalization."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class RecoveryRotationDatabase(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for migration in sorted((ROOT / "migrations").glob("*.sql")):
            self.db.executescript(migration.read_text())
        for uid in ("a", "b"):
            self.db.execute(
                "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) "
                "VALUES(?,?,?,0,1,1)",
                (uid, uid, uid + "@test.invalid"),
            )
            self.db.execute(
                "INSERT INTO message_device_keys(user_id,public_jwk,created_at) VALUES(?,?,?)",
                (uid, "old-" + uid, "now"),
            )
        self.db.execute(
            "INSERT INTO message_account_recovery(user_id,public_jwk,envelope_json,created_at) "
            "VALUES('a','old-a','old-envelope','now')"
        )
        self.db.execute("INSERT INTO households VALUES('h','Fictional','America/New_York','a','now')")
        for uid in ("a", "b"):
            self.db.execute("INSERT INTO household_members VALUES('h',?,'member','now')", (uid,))
        self.db.execute("INSERT INTO direct_threads VALUES('t','h','a:b','a','now')")
        for uid in ("a", "b"):
            self.db.execute("INSERT INTO direct_thread_members VALUES('t',?,'now')", (uid,))
        self.db.execute("INSERT INTO encrypted_messages VALUES('m','t','a','hash','now')")
        self.db.execute("INSERT INTO encrypted_message_copies VALUES('m','a','old-msg-a')")
        self.db.execute("INSERT INTO encrypted_message_copies VALUES('m','b','old-msg-b')")
        self.db.execute("INSERT INTO shared_word_spaces VALUES('s','h','a','prompt','now')")
        for uid in ("a", "b"):
            self.db.execute("INSERT INTO shared_word_participants VALUES('s',?,'now')", (uid,))
        self.db.execute("INSERT INTO shared_word_posts VALUES('p','s','a','prompt','digest','now')")
        self.db.execute("INSERT INTO shared_word_copies VALUES('p','a','old-words-a')")
        self.db.execute("INSERT INTO shared_word_copies VALUES('p','b','old-words-b')")
        self.db.execute(
            "INSERT INTO private_journal_sync(user_id,household_id,entry_id,revision,iv,ciphertext,created_at,updated_at) "
            "VALUES('a','h','j',1,'old-j-iv','old-j-cipher',1,1)"
        )
        self.db.execute(
            "INSERT INTO private_draft_sync(user_id,household_id,scope_id,revision,iv,ciphertext,updated_at) "
            "VALUES('a','h','draft-hash',1,'old-d-iv','old-d-cipher',1)"
        )
        self.db.execute(
            "INSERT INTO account_recovery_rotations(rotation_id,user_id,original_jwk,next_jwk,next_envelope_json,state,created_at) "
            "VALUES('r1','a','old-a','new-a','new-envelope','staged',100)"
        )

    def tearDown(self):
        self.db.close()

    def stage(self, messages=True, journals=True, drafts=True):
        if messages:
            for kind, source, cipher in (
                ("direct", "m", "new-msg-a"), ("words", "p", "new-words-a")
            ):
                self.db.execute(
                    "INSERT INTO account_recovery_rotation_copies VALUES('r1',?,?,?)",
                    (kind, source, cipher),
                )
        if journals:
            self.db.execute(
                "INSERT INTO account_recovery_rotation_journals "
                "(rotation_id,household_id,entry_id,expected_revision,original_iv,original_ciphertext,iv,ciphertext) "
                "VALUES('r1','h','j',1,'old-j-iv','old-j-cipher','new-j-iv','new-j-cipher')"
            )
        if drafts:
            self.db.execute(
                "INSERT INTO account_recovery_rotation_drafts "
                "(rotation_id,household_id,scope_id,expected_revision,original_iv,original_ciphertext,iv,ciphertext) "
                "VALUES('r1','h','draft-hash',1,'old-d-iv','old-d-cipher','new-d-iv','new-d-cipher')"
            )

    def commit_body(self):
        self.db.execute(
            "UPDATE private_journal_sync SET revision=revision+1,iv='new-j-iv',ciphertext='new-j-cipher' "
            "WHERE user_id='a' AND household_id='h' AND entry_id='j' AND revision=1"
        )
        self.db.execute(
            "UPDATE private_draft_sync SET revision=revision+1,iv='new-d-iv',ciphertext='new-d-cipher' "
            "WHERE user_id='a' AND household_id='h' AND scope_id='draft-hash' AND revision=1"
        )
        self.db.execute("UPDATE message_device_keys SET public_jwk='new-a' WHERE user_id='a'")
        self.db.execute(
            "UPDATE message_account_recovery SET public_jwk='new-a',envelope_json='new-envelope' "
            "WHERE user_id='a'"
        )
        self.db.execute(
            "UPDATE account_recovery_rotations SET state='complete',completed_at=200 WHERE rotation_id='r1'"
        )

    def test_complete_replacement_keeps_every_previous_ciphertext_and_other_recipient(self):
        self.stage()
        self.commit_body()
        self.assertEqual(
            self.db.execute("SELECT public_jwk FROM message_device_keys WHERE user_id='a'").fetchone(),
            ("new-a",),
        )
        self.assertEqual(
            self.db.execute("SELECT envelope_json FROM message_account_recovery WHERE user_id='a'").fetchone(),
            ("new-envelope",),
        )
        self.assertEqual(
            self.db.execute("SELECT envelope_json FROM encrypted_message_copies WHERE recipient_id='b'").fetchone(),
            ("old-msg-b",),
        )
        self.assertEqual(
            self.db.execute("SELECT envelope_json FROM encrypted_message_copies WHERE recipient_id='a'").fetchone(),
            ("old-msg-a",),
        )
        self.assertEqual(
            self.db.execute("SELECT original_ciphertext,ciphertext FROM account_recovery_rotation_journals").fetchone(),
            ("old-j-cipher", "new-j-cipher"),
        )
        self.assertEqual(
            self.db.execute("SELECT original_ciphertext,ciphertext FROM account_recovery_rotation_drafts").fetchone(),
            ("old-d-cipher", "new-d-cipher"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM account_recovery_rotations WHERE rotation_id='r1'")

    def test_incoming_shared_copy_fails_while_original_public_key_is_staged(self):
        self.stage()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO encrypted_message_copies VALUES('m','a','incoming')")
        self.db.execute("INSERT INTO encrypted_messages VALUES('m2','t','b','digest2','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO encrypted_message_copies VALUES('m2','a','incoming')")
        self.db.execute("INSERT INTO shared_word_posts VALUES('p2','s','b','reply','digest2','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO shared_word_copies VALUES('p2','a','incoming')")

    def test_missing_encrypted_copy_or_draft_blocks_final_transition(self):
        for missing_kind in ("messages", "journals", "drafts"):
            with self.subTest(missing=missing_kind):
                self.db.execute("SAVEPOINT attempt")
                try:
                    self.stage(
                        messages=missing_kind != "messages",
                        journals=missing_kind != "journals",
                        drafts=missing_kind != "drafts",
                    )
                    with self.assertRaises(sqlite3.IntegrityError):
                        self.commit_body()
                finally:
                    self.db.execute("ROLLBACK TO SAVEPOINT attempt")
                    self.db.execute("RELEASE SAVEPOINT attempt")
                self.assertEqual(
                    self.db.execute("SELECT public_jwk FROM message_device_keys WHERE user_id='a'").fetchone(),
                    ("old-a",),
                )

    def test_one_staged_rotation_per_account_and_owner_only_foreign_keys(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO account_recovery_rotations(rotation_id,user_id,original_jwk,next_jwk,next_envelope_json,state,created_at) "
                "VALUES('r2','a','old-a','other','other-envelope','staged',101)"
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO account_recovery_rotation_copies VALUES('not-a-rotation','direct','m','cipher')"
            )


if __name__ == "__main__":
    unittest.main()
