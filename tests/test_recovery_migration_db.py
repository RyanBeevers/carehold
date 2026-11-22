"""Staged recovery and private encrypted draft schema: no destructive key resets."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class RecoveryMigrationDatabase(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        for uid in ('a','b','outsider'):
            self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,1,1)",
                            (uid,uid,uid+'@test.invalid'))
        self.db.execute("INSERT INTO households VALUES('h','Fictional','America/New_York','a','now')")
        for uid,role in [('a','owner'),('b','member')]:
            self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h',?,?, 'now')",(uid,role))
        for uid in ('a','b'):
            self.db.execute("INSERT INTO message_device_keys VALUES(?,?,'now')",(uid,'old-'+uid))
        self.db.execute("INSERT INTO direct_threads VALUES('t','h','a:b','a','now')")
        for uid in ('a','b'):
            self.db.execute("INSERT INTO direct_thread_members VALUES('t',?,'now')",(uid,))
        self.db.execute("INSERT INTO encrypted_messages VALUES('m','t','a','hash','now')")
        self.db.execute("INSERT INTO encrypted_message_copies VALUES('m','a','legacy-a')")
        self.db.execute("INSERT INTO encrypted_message_copies VALUES('m','b','legacy-b')")
        self.db.execute("INSERT INTO shared_word_spaces(id,household_id,created_by,initial_kind,created_at) VALUES('s','h','a','prompt','now')")
        for uid in ('a','b'):
            self.db.execute("INSERT INTO shared_word_participants(space_id,user_id,joined_at) VALUES('s',?,'now')",(uid,))
        self.db.execute("INSERT INTO shared_word_posts(id,space_id,author_id,kind,body_hash,created_at) VALUES('p','s','a','prompt','digest','now')")
        self.db.execute("INSERT INTO shared_word_copies VALUES('p','a','old-word-a')")
        self.db.execute("INSERT INTO shared_word_copies VALUES('p','b','old-word-b')")
    def tearDown(self):
        self.db.close()

    def test_staged_copies_do_not_mutate_or_delete_legacy_records(self):
        self.db.execute("INSERT INTO account_key_migrations(user_id,original_jwk,next_jwk,recovery_envelope_json,state,created_at) VALUES('a','old-a','next-a','opaque','staged','now')")
        self.db.execute("INSERT INTO account_migrated_copies VALUES('a','direct','m','new-a','now')")
        self.db.execute("INSERT INTO account_migrated_copies VALUES('a','words','p','new-word-a','now')")
        self.assertEqual(self.db.execute("SELECT envelope_json FROM encrypted_message_copies WHERE message_id='m' AND recipient_id='a'").fetchone(),('legacy-a',))
        self.assertEqual(self.db.execute("SELECT envelope_json FROM encrypted_message_copies WHERE message_id='m' AND recipient_id='b'").fetchone(),('legacy-b',))
        self.assertEqual(self.db.execute("SELECT envelope_json FROM shared_word_copies WHERE post_id='p' AND recipient_id='b'").fetchone(),('old-word-b',))
        self.assertEqual(self.db.execute("SELECT public_jwk FROM message_device_keys WHERE user_id='a'").fetchone(),('old-a',))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO account_migrated_copies VALUES('a','direct','m','different','now')")

        self.db.execute("INSERT INTO message_account_recovery VALUES('a','next-a','opaque','now')")
        self.db.execute("UPDATE message_device_keys SET public_jwk='next-a' WHERE user_id='a' AND public_jwk='old-a'")
        self.db.execute("UPDATE account_key_migrations SET state='complete',completed_at='now' WHERE user_id='a'")
        self.assertEqual(self.db.execute("SELECT public_jwk FROM message_device_keys WHERE user_id='a'").fetchone(),('next-a',))
        self.assertEqual(self.db.execute("SELECT public_jwk FROM message_device_keys WHERE user_id='b'").fetchone(),('old-b',))
        self.assertEqual(self.db.execute("SELECT envelope_json FROM encrypted_message_copies WHERE message_id='m' AND recipient_id='a'").fetchone(),('legacy-a',))
        self.assertEqual(self.db.execute("SELECT envelope_json FROM account_migrated_copies WHERE user_id='a' AND source_kind='direct' AND source_id='m'").fetchone(),('new-a',))

    def test_draft_schema_is_owner_scoped_and_revision_constrained(self):
        fields=[r[1] for r in self.db.execute('PRAGMA table_info(private_draft_sync)')]
        self.assertEqual(fields,['user_id','household_id','scope_id','revision','iv','ciphertext','updated_at','deleted_at'])
        self.assertFalse(any(x in fields for x in ('text','title','prompt','password','private_key')))
        self.db.execute("INSERT INTO private_draft_sync VALUES('a','h','opaque',1,'iv','cipher',1,NULL)")
        self.db.execute("INSERT INTO private_draft_sync VALUES('b','h','opaque',1,'iv','other',1,NULL)")
        updated=self.db.execute("UPDATE private_draft_sync SET revision=revision+1,ciphertext='new' WHERE user_id='a' AND household_id='h' AND scope_id='opaque' AND revision=0")
        self.assertEqual(updated.rowcount,0)
        self.assertEqual(self.db.execute("SELECT ciphertext FROM private_draft_sync WHERE user_id='b'").fetchone(),('other',))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO private_draft_sync VALUES('outsider','h','other',0,'iv','cipher',1,NULL)")

if __name__=='__main__':unittest.main()
