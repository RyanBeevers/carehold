"""SQLite contract tests independent of Cloudflare, exercising D1-compatible migration SQL."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class DatabaseIntegrity(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for sql in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(sql.read_text())
        self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('u1','A','a@test.invalid',0,1,1)")
        self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('u2','B','b@test.invalid',0,1,1)")
        self.db.execute("INSERT INTO households VALUES('h1','Household','America/New_York','u1','now')")
        self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h1','u1','owner','now')")
        self.db.execute("INSERT INTO profiles(id,household_id,display_name,kind,created_at) VALUES('p1','h1','Person','adult','now')")
        self.db.execute("INSERT INTO medications(id,profile_id,name,dose,cadence,start_date,created_at,updated_at) VALUES('m1','p1','Medication','prescribed label','daily','2026-11-01','now','now')")
    def add(self, eid, idem, supersedes=None, key='m1:2026-11-20:08:00'):
        self.db.execute('''INSERT INTO dose_events(id,household_id,profile_id,medication_id,occurrence_key,scheduled_date,scheduled_time,schedule_timezone,event_type,med_name_snapshot,dose_snapshot,occurred_at,recorded_at,actor_user_id,supersedes_event_id,idempotency_key)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(eid,'h1','p1','m1',key,'2026-11-20','08:00','America/New_York','given','Medication','prescribed label','2026-11-20T13:01:00Z','2026-11-20T13:02:00Z','u1',supersedes,idem))
    def test_first_record_is_unique_per_scheduled_dose(self):
        self.add('a','request-1')
        with self.assertRaises(sqlite3.IntegrityError):self.add('b','request-2')
    def test_request_idempotency_key_is_unique(self):
        self.add('a','request-1')
        with self.assertRaises(sqlite3.IntegrityError):self.add('b','request-1',key='m1:2026-11-21:08:00')
    def test_corrections_are_append_only_and_can_only_supersede_once(self):
        self.add('a','request-1')
        self.add('correction-1','request-2','a')
        with self.assertRaises(sqlite3.IntegrityError):self.add('correction-2','request-3','a')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM dose_events').fetchone()[0],2)
    def test_invalid_capability_rejected_by_db(self):
        self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h1','u2','caregiver','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO profile_grants VALUES('h1','p1','u2','journal_read','now')")
    def test_audience_is_non_privileged_and_restricted_to_pilot_types(self):
        self.db.execute("INSERT INTO account_audiences(user_id,audience,updated_at) VALUES('u1','parent','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO account_audiences(user_id,audience,updated_at) VALUES('u2','doctor','now')")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM profile_grants").fetchone()[0], 0)

    def test_pending_invite_stores_reference_not_bearer_code(self):
        self.db.execute("""INSERT INTO invitations(id,household_id,token_hash,role,grants_json,created_by,created_at,expires_at)
            VALUES('i1','h1','hashed-secret','member','[]','u1','now','later')""")
        self.db.execute("INSERT INTO pending_household_invites(user_id,invitation_id,created_at) VALUES('u2','i1','now')")
        self.assertEqual(self.db.execute("SELECT invitation_id FROM pending_household_invites WHERE user_id='u2'").fetchone()[0],'i1')
        self.assertIsNone(self.db.execute("SELECT 1 FROM household_members WHERE user_id='u2'").fetchone())

    def test_linked_user_must_be_unique_per_household(self):
        self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h1','u2','member','now')")
        self.db.execute("INSERT INTO profiles(id,household_id,display_name,kind,linked_user_id,created_at) VALUES('p2','h1','Person 2','adult','u2','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE profiles SET linked_user_id='u2' WHERE id='p1'")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM profile_grants").fetchone()[0],0)
    def test_profile_link_history_and_push_cooldown(self):
        self.db.execute("INSERT INTO profile_link_changes(id,household_id,profile_id,changed_by,changed_at) VALUES('l1','h1','p1','u1','now')")
        self.db.execute("INSERT INTO push_test_rate_limits(user_id,last_sent_at) VALUES('u1','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO push_test_rate_limits(user_id,last_sent_at) VALUES('u1','later')")
    def test_duplicate_member_and_push_delivery_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h1','u1','caregiver','now')")
        self.db.execute("INSERT INTO push_deliveries(id,user_id,occurrence_key,state) VALUES('x','u1','occ','failed')")
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO push_deliveries(id,user_id,occurrence_key,state) VALUES('y','u1','occ','failed')")

if __name__=='__main__':unittest.main()
