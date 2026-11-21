"""D1-compatible medication catalog migration and rate-limit contract checks."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
UPSERT="""INSERT INTO medication_catalog_search_limits(user_id,window_start_ms,request_count)
 VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET
 window_start_ms=CASE WHEN medication_catalog_search_limits.window_start_ms<? THEN excluded.window_start_ms ELSE medication_catalog_search_limits.window_start_ms END,
 request_count=CASE WHEN medication_catalog_search_limits.window_start_ms<? THEN 1 ELSE medication_catalog_search_limits.request_count+1 END
 WHERE medication_catalog_search_limits.window_start_ms<? OR medication_catalog_search_limits.request_count<45"""

class MedicationCatalogDBTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        # Build the existing pre-catalog schema, insert medication data, then
        # upgrade to 0009 to verify this is a non-destructive in-place migration.
        migration_paths=sorted((ROOT/'migrations').glob('*.sql'))
        for migration in migration_paths:
            if migration.name!='0009_medication_catalog.sql':
                self.db.executescript(migration.read_text())
        self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('owner','Owner','owner@test.invalid',0,1,1)")
        self.db.execute("INSERT INTO households VALUES('h','Home','America/New_York','owner','now')")
        self.db.execute("INSERT INTO household_members VALUES('h','owner','owner','now')")
        for kind,pid in (('adult','adult'),('pet','pet')):
            self.db.execute("INSERT INTO profiles(id,household_id,display_name,kind,created_at) VALUES(?,'h',?,?,'now')",(pid,pid,kind))
            self.db.execute("INSERT INTO medications(id,profile_id,name,dose,cadence,start_date,created_at,updated_at) VALUES(?,?,?,?,'daily','2026-11-01','now','now')",
                ('med_'+pid,pid,'Original Name','1 prescribed tablet'))
        self.db.executescript((ROOT/'migrations'/'0009_medication_catalog.sql').read_text())

    def test_old_records_are_unmodified_and_metadata_is_nullable(self):
        columns={r[1] for r in self.db.execute('PRAGMA table_info(medications)')}
        for field in ('catalog_source','catalog_identifier','normalized_name','brand_name','product_strength','dosage_form'):
            self.assertIn(field,columns)
        for pid in ('adult','pet'):
            values=self.db.execute("""SELECT name,dose,cadence,product_strength,catalog_identifier
                 FROM medications WHERE id=?""",('med_'+pid,)).fetchone()
            self.assertEqual(values,('Original Name','1 prescribed tablet','daily',None,None))

    def test_cataloged_human_and_pet_medications_preserve_prescribed_dose(self):
        for pid in ('adult','pet'):
            self.db.execute("""UPDATE medications SET name=?,catalog_source=?,catalog_identifier=?,
             normalized_name=?,product_strength=? WHERE id=?""",
                ('Example (Oral Pill)','rxterms','12345','Example (Oral Pill)','10 mg Tab','med_'+pid))
            actual=self.db.execute("""SELECT dose,product_strength,catalog_source FROM medications WHERE id=?""",
                ('med_'+pid,)).fetchone()
            self.assertEqual(actual,('1 prescribed tablet','10 mg Tab','rxterms'))

    def test_catalog_edit_and_dose_event_history_remain_independent(self):
        self.db.execute("""INSERT INTO dose_events
         (id,household_id,profile_id,medication_id,occurrence_key,scheduled_date,scheduled_time,schedule_timezone,
          event_type,med_name_snapshot,dose_snapshot,occurred_at,recorded_at,actor_user_id,idempotency_key)
         VALUES('e','h','adult','med_adult','occ','2026-11-21','08:00','America/New_York',
          'given','Original Name','1 prescribed tablet','2026-11-21T13:00:00Z','2026-11-21T13:05:00Z','owner','once')""")
        self.db.execute("""UPDATE medications SET name='New Catalog Name',catalog_source='rxterms',
           catalog_identifier='55555' WHERE id='med_adult'""")
        history=self.db.execute("SELECT med_name_snapshot,dose_snapshot FROM dose_events WHERE id='e'").fetchone()
        self.assertEqual(history,('Original Name','1 prescribed tablet'))

    def test_authenticated_rate_limit_is_atomic_and_resets(self):
        def try_search(moment):
            before=self.db.total_changes
            cutoff=moment-60000
            self.db.execute(UPSERT,('owner',moment,cutoff,cutoff,cutoff))
            return self.db.total_changes>before
        moment=1000000
        for _ in range(45):
            self.assertTrue(try_search(moment))
        self.assertFalse(try_search(moment))
        self.assertEqual(self.db.execute("SELECT request_count FROM medication_catalog_search_limits").fetchone()[0],45)
        self.assertTrue(try_search(moment+61000))
        self.assertEqual(self.db.execute("SELECT request_count FROM medication_catalog_search_limits").fetchone()[0],1)

if __name__=='__main__':
    unittest.main()
