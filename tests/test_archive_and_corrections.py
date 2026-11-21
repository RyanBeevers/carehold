"""Archive and correction migration contract tests; no real medication information."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class ArchiveAndCorrections(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('u','Owner','test@test.invalid',0,1,1)")
        self.db.execute("INSERT INTO households VALUES('h','Test circle','America/New_York','u','now')")
        self.db.execute("INSERT INTO household_members VALUES('h','u','owner','now')")
        self.db.execute("INSERT INTO profiles(id,household_id,display_name,kind,created_at) VALUES('p','Fictional person','adult','now')")
        self.db.execute("""INSERT INTO medications(id,profile_id,name,dose,cadence,start_date,created_at,updated_at)
                            VALUES('m','p','Fictional medication','Recorded label','daily','2026-11-01','now','now')""")
        self.db.execute("INSERT INTO medication_times VALUES('m','08:00')")

    def record(self,ident,status,idem,previous=None,correction_kind=None):
        self.db.execute("""INSERT INTO dose_events(id,household_id,profile_id,medication_id,
          occurrence_key,scheduled_date,scheduled_time,schedule_timezone,event_type,
          med_name_snapshot,dose_snapshot,occurred_at,recorded_at,actor_user_id,
          supersedes_event_id,idempotency_key,correction_kind)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
          (ident,'h','p','m','m:2026-11-21:08:00','2026-11-21','08:00','America/New_York',
          status,'Fictional medication','Recorded label','2026-11-21T13:05:00Z',
          '2026-11-21T13:06:00Z','u',previous,idem,correction_kind))

    def test_archiving_medication_does_not_delete_schedule_or_history(self):
        self.record('first','given','one')
        self.db.execute("UPDATE medications SET archived_at='2026-11-22T00:00:00Z' WHERE id='m'")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM dose_events WHERE medication_id=?',('m',)).fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM medication_times WHERE medication_id=?',('m',)).fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM medications WHERE archived_at IS NULL').fetchone()[0],0)
        self.db.execute("UPDATE medications SET archived_at=NULL WHERE id='m'")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM medications WHERE archived_at IS NULL').fetchone()[0],1)

    def test_archiving_person_preserves_account_and_administration_history(self):
        self.record('first','given','one')
        self.db.execute("UPDATE profiles SET archived_at='2026-11-22' WHERE id='p'")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM profiles WHERE archived_at IS NULL').fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM household_members WHERE user_id='u'").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM dose_events WHERE profile_id='p'").fetchone()[0],1)
        self.db.execute("UPDATE profiles SET archived_at=NULL WHERE id='p'")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM profiles WHERE archived_at IS NULL').fetchone()[0],1)

    def test_not_administered_annotation_and_later_observation_keep_chain(self):
        self.record('first','refused','one')
        self.record('correction','skipped','two','first','not_administered')
        self.record('later','given','three','correction')
        latest=self.db.execute("""SELECT id,event_type,correction_kind FROM dose_events e
          WHERE NOT EXISTS(SELECT 1 FROM dose_events n WHERE n.supersedes_event_id=e.id)""").fetchall()
        self.assertEqual(latest,[('later','given',None)])
        history=self.db.execute("SELECT event_type,correction_kind FROM dose_events ORDER BY rowid").fetchall()
        self.assertEqual(history,[('refused',None),('skipped','not_administered'),('given',None)])
        with self.assertRaises(sqlite3.IntegrityError):
            self.record('duplicate-root','given','four')
        with self.assertRaises(sqlite3.IntegrityError):
            self.record('duplicate-correction','given','five','first')

    def test_invalid_correction_classification_fails_closed(self):
        self.record('first','given','one')
        with self.assertRaises(sqlite3.IntegrityError):
            self.record('bad','skipped','two','first','silent-delete')

if __name__=='__main__':
    unittest.main()
