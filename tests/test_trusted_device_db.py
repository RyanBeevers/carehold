"""Additive trusted-device state must remain account-scoped and ciphertext-only."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class TrustedDeviceSchema(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for f in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(f.read_text())
        for uid in ('owner_a','owner_b'):
            self.db.execute(
                'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,1,1)',
                (uid, uid, uid+'@test.invalid'))
            self.db.execute('INSERT INTO message_device_keys(user_id,public_jwk,created_at) VALUES(?,?,?)',
                            (uid,'account-public-'+uid,'now'))
    def tearDown(self):
        self.db.close()

    def test_devices_are_per_account_and_cannot_reuse_duplicate_ids_for_same_account(self):
        for uid in ('owner_a','owner_b'):
            self.db.execute('''INSERT INTO trusted_devices
                (user_id,device_id,label,account_public_jwk,created_at,last_seen_at)
                VALUES(?,?,?,?,?,?)''',(uid,'d','A fictional phone','account-public-'+uid,'now','now'))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('''INSERT INTO trusted_devices
                (user_id,device_id,label,account_public_jwk,created_at,last_seen_at)
                VALUES('owner_a','d','duplicate','old','now','now')''')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM trusted_devices').fetchone()[0],2)
        self.db.execute("UPDATE trusted_devices SET revoked_at='later' WHERE user_id='owner_a' AND device_id='d'")
        self.assertIsNone(self.db.execute("SELECT revoked_at FROM trusted_devices WHERE user_id='owner_b'").fetchone()[0])

    def test_recovery_transfer_rows_contain_no_recovery_secret_or_plaintext_private_key(self):
        cols=[r[1] for r in self.db.execute('PRAGMA table_info(trusted_device_requests)')]
        for forbidden in ('recovery_code','private_key','journal_key','plaintext','secret'):
            self.assertFalse(any(forbidden in name for name in cols),cols)
        self.db.execute('''INSERT INTO trusted_device_requests
             (id,user_id,device_id,device_label,candidate_public_jwk,account_public_jwk,state,created_at,expires_at)
             VALUES('r1','owner_a','new-device','Test phone','candidate-a','account-public-owner_a','pending','now',9999999999)''')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE trusted_device_requests SET state='invalid' WHERE id='r1'")
        self.db.execute('''UPDATE trusted_device_requests SET state='approved',ciphertext_json='{"v":1,"ct":"opaque"}'
             WHERE id='r1' AND user_id='owner_a' AND state='pending' ''')
        self.assertEqual(self.db.execute("SELECT ciphertext_json FROM trusted_device_requests WHERE id='r1'").fetchone()[0],
                         '{"v":1,"ct":"opaque"}')
        self.db.execute("UPDATE trusted_device_requests SET state='consumed',ciphertext_json=NULL WHERE id='r1'")
        self.assertIsNone(self.db.execute("SELECT ciphertext_json FROM trusted_device_requests WHERE id='r1'").fetchone()[0])

    def test_challenge_is_scoped_to_user_device_and_foreign_key(self):
        self.db.execute("INSERT INTO trusted_device_challenges VALUES('owner_a','d','digest',9999999999)")
        self.db.execute("INSERT INTO trusted_device_challenges VALUES('owner_b','d','other',9999999999)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO trusted_device_challenges VALUES('owner_a','d','dupe',9999999999)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO trusted_device_challenges VALUES('missing','z','digest',9999999999)")
        self.db.execute("DELETE FROM trusted_device_challenges WHERE user_id='owner_a' AND device_id='d'")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM trusted_device_challenges').fetchone()[0],1)

    def test_legacy_message_keys_and_encrypted_journal_schema_are_not_mutated(self):
        cols=[r[1] for r in self.db.execute('PRAGMA table_info(message_device_keys)')]
        self.assertEqual(cols,['user_id','public_jwk','created_at'])
        for table in ('private_journal_sync','private_draft_sync','message_account_recovery',
                      'encrypted_message_copies','shared_word_copies'):
            self.assertIsNotNone(self.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone())

if __name__=='__main__':
    unittest.main()
