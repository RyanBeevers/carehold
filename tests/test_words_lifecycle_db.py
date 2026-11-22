"""Words lifecycle migration: preserve immutable encrypted history but block removed content."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class WordsLifecycleDB(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        for uid in ('owner','sara'):
            self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,1,1)",
                            (uid,uid,uid+'@example.invalid'))
        self.db.execute("INSERT INTO households(id,name,timezone,created_by,created_at) VALUES('h','Care','America/New_York','owner','now')")
        for uid in ('owner','sara'):
            self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h',?,?,'now')",
                            (uid,'owner' if uid=='owner' else 'caregiver'))
        self.db.execute("INSERT INTO shared_word_spaces(id,household_id,created_by,initial_kind,created_at) VALUES('s','h','owner','journal','now')")
        for uid in ('owner','sara'):
            self.db.execute("INSERT INTO shared_word_participants(space_id,user_id,joined_at) VALUES('s',?,'now')",(uid,))
        self.db.execute("INSERT INTO shared_word_posts(id,space_id,author_id,kind,body_hash,created_at) VALUES('p','s','owner','journal','hash','now')")
        for uid in ('owner','sara'):
            self.db.execute("INSERT INTO shared_word_copies(post_id,recipient_id,envelope_json) VALUES('p',?,'{}')",(uid,))

    def test_deleted_space_is_tombstoned_and_copies_preserved_for_recovery(self):
        self.db.execute("UPDATE shared_word_spaces SET deleted_at='now' WHERE id='s'")
        self.assertEqual(self.db.execute("SELECT deleted_at FROM shared_word_spaces WHERE id='s'").fetchone()[0],'now')
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM shared_word_copies WHERE post_id='p'").fetchone()[0],2)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO shared_word_posts(id,space_id,author_id,kind,body_hash,created_at) VALUES('late','s','owner','discussion','hash','later')")

    def test_departed_participant_cannot_receive_new_encrypted_copies(self):
        self.db.execute("UPDATE shared_word_participants SET left_at='now' WHERE space_id='s' AND user_id='sara'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO shared_word_posts(id,space_id,author_id,kind,body_hash,created_at) VALUES('left','s','sara','discussion','hash','now')")
        self.db.execute("INSERT INTO shared_word_posts(id,space_id,author_id,kind,body_hash,created_at) VALUES('reply','s','owner','discussion','hash','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO shared_word_copies(post_id,recipient_id,envelope_json) VALUES('reply','sara','{}')")
        self.db.execute("INSERT INTO shared_word_copies(post_id,recipient_id,envelope_json) VALUES('reply','owner','{}')")

    def test_deleted_reply_is_hidden_without_rewriting_ciphertext(self):
        self.db.execute("INSERT INTO shared_word_posts(id,space_id,author_id,kind,body_hash,created_at) VALUES('reply','s','sara','discussion','hash','now')")
        self.db.execute("UPDATE shared_word_posts SET deleted_at='now' WHERE id='reply'")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM shared_word_posts WHERE id='reply' AND deleted_at IS NULL").fetchone()[0],0)
        self.db.execute("INSERT INTO private_word_activity(id,user_id,household_id,source_kind,source_id,post_id,event_kind,created_at) VALUES('a','owner','h','words','s','reply','reply','now')")
        self.assertEqual(self.db.execute("SELECT post_id FROM private_word_activity WHERE id='a'").fetchone()[0],'reply')

if __name__=='__main__':
    unittest.main()
