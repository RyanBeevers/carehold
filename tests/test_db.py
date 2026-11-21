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
        self.db.execute("INSERT INTO household_members VALUES('h1','u1','owner','now')")
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
        self.db.execute("INSERT INTO household_members VALUES('h1','u2','caregiver','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO profile_grants VALUES('h1','p1','u2','journal_read','now')")
    def test_duplicate_member_and_push_delivery_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO household_members VALUES('h1','u1','caregiver','now')")
        self.db.execute("INSERT INTO push_deliveries(id,user_id,occurrence_key,state) VALUES('x','u1','occ','failed')")
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO push_deliveries(id,user_id,occurrence_key,state) VALUES('y','u1','occ','failed')")

if __name__=='__main__':unittest.main()
