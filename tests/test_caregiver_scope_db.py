"""Migration contract: least privilege defaults and auditable role changes."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class CaregiverAccessScope(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        for uid in ('owner','caregiver'):
            self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,1,1)",
                (uid,uid,uid+'@example.invalid'))
        self.db.execute("INSERT INTO households(id,name,timezone,created_by,created_at) VALUES('h','Care','America/New_York','owner','now')")
        self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h','owner','owner','now')")
        self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h','caregiver','caregiver','now')")

    def test_existing_caregivers_default_to_limited(self):
        scope=self.db.execute("SELECT access_scope FROM household_members WHERE user_id='caregiver'").fetchone()[0]
        self.assertEqual(scope,'limited')
        self.db.execute("UPDATE household_members SET access_scope='full' WHERE household_id='h' AND user_id='caregiver'")
        self.assertEqual(self.db.execute("SELECT access_scope FROM household_members WHERE user_id='caregiver'").fetchone()[0],'full')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE household_members SET access_scope='administrator' WHERE user_id='caregiver'")

    def test_invites_are_limited_unless_explicitly_upgraded(self):
        self.db.execute("""INSERT INTO invitations(id,household_id,token_hash,role,grants_json,created_by,created_at,expires_at)
         VALUES('i','h','hash','caregiver','[]','owner','now','later')""")
        self.assertEqual(self.db.execute("SELECT access_scope FROM invitations WHERE id='i'").fetchone()[0],'limited')

    def test_member_change_audit_survives_member_revocation(self):
        self.db.execute("""INSERT INTO member_access_changes
          (id,household_id,user_id,previous_scope,next_scope,before_grants_json,after_grants_json,changed_by,changed_at)
          VALUES('change','h','caregiver','limited','full','[]','[]','owner','now')""")
        self.db.execute("DELETE FROM household_members WHERE user_id='caregiver'")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM member_access_changes").fetchone()[0],1)

if __name__=='__main__':
    unittest.main()
