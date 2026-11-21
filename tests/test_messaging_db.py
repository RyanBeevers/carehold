"""D1-compatible integrity tests for fictional ciphertext-only direct threads."""
import sqlite3
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class DirectMessageIntegrity(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for f in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(f.read_text())
        for uid in ('a','b','outsider'):
            self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,1,1)",(uid,uid,uid+'@test.invalid'))
        self.db.execute("INSERT INTO households VALUES('h','Test','America/New_York','a','now')")
        for uid,role in [('a','owner'),('b','member')]:
            self.db.execute("INSERT INTO household_members VALUES('h',?,?, 'now')",(uid,role))
        for uid in ('a','b'):
            self.db.execute("INSERT INTO message_device_keys VALUES(?,?,'now')",(uid,'{"kty":"EC"}'))
        self.db.execute("INSERT INTO direct_threads VALUES('t','h','a:b','a','now')")
        for uid in ('a','b'):
            self.db.execute("INSERT INTO direct_thread_members VALUES('t',?,'now')",(uid,))
    def test_only_ciphertext_copy_columns_exist(self):
        cols=[r[1] for r in self.db.execute('PRAGMA table_info(encrypted_message_copies)')]
        self.assertEqual(cols,['message_id','recipient_id','envelope_json'])
        self.assertFalse(any(x in cols for x in ('plaintext','content','body')))
    def test_unique_copy_and_thread_pair(self):
        self.db.execute("INSERT INTO encrypted_messages VALUES('m','t','a','hash','now')")
        self.db.execute("INSERT INTO encrypted_message_copies VALUES('m','a','cipher')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO encrypted_message_copies VALUES('m','a','duplicate')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO direct_threads VALUES('another','h','a:b','a','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO encrypted_message_copies VALUES('missing','b','cipher')")
    def test_revocation_archives_old_pair_without_revival(self):
        self.db.execute("UPDATE direct_threads SET pair_key='revoked:'||id WHERE household_id='h' AND id IN (SELECT thread_id FROM direct_thread_members WHERE user_id='b')")
        self.db.execute("DELETE FROM direct_thread_members WHERE user_id='b'")
        self.db.execute("DELETE FROM household_members WHERE user_id='b'")
        self.db.execute("INSERT INTO household_members VALUES('h','b','member','later')")
        self.assertFalse(self.db.execute("SELECT 1 FROM direct_thread_members WHERE thread_id='t' AND user_id='b'").fetchone())
        self.db.execute("INSERT INTO direct_threads VALUES('new','h','a:b','a','later')")
        self.assertEqual(self.db.execute("SELECT pair_key FROM direct_threads WHERE id='t'").fetchone()[0],'revoked:t')
if __name__=='__main__':unittest.main()
