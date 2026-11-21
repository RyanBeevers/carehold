"""Recovery migration integrity: additive, ciphertext-only, and per-account."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class RecoverySchemaIntegrity(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        for uid in ('legacy','new','other'):
            self.db.execute(
                "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,1,1)",
                (uid,uid,uid+'@test.invalid')
            )
        self.db.execute(
            "INSERT INTO message_device_keys(user_id,public_jwk,created_at) VALUES(?,?,?)",
            ('legacy','old-public','earlier')
        )

    def tearDown(self):
        self.db.close()

    def test_recovery_schema_does_not_change_old_key_table(self):
        key_columns=[x[1] for x in self.db.execute('PRAGMA table_info(message_device_keys)')]
        self.assertEqual(key_columns,['user_id','public_jwk','created_at'])
        stored=self.db.execute(
            "SELECT public_jwk FROM message_device_keys WHERE user_id='legacy'"
        ).fetchone()
        self.assertEqual(stored,('old-public',))
        cols=[x[1] for x in self.db.execute('PRAGMA table_info(message_account_recovery)')]
        self.assertEqual(cols,['user_id','public_jwk','envelope_json','created_at'])
        self.assertFalse(any('private_key' in x or 'recovery_code' in x for x in cols))

    def test_single_recovery_record_per_user_and_foreign_key(self):
        self.db.execute(
            "INSERT INTO message_account_recovery VALUES(?,?,?,?)",
            ('new','public','{"v":1,"ct":"opaque"}','now')
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO message_account_recovery VALUES(?,?,?,?)",
                ('new','another','{"v":1}','later')
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO message_account_recovery VALUES(?,?,?,?)",
                ('nonexistent','key','{"v":1}','now')
            )
        self.assertEqual(
            self.db.execute("SELECT user_id FROM message_account_recovery").fetchall(),
            [('new',)]
        )

if __name__=='__main__':unittest.main()
