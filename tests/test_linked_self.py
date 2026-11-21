import sqlite3
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class LinkedProfileVisibility(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('owner','Owner','o@invalid.test',0,1,1)")
        self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('child','Child','c@invalid.test',0,1,1)")
        self.db.execute("INSERT INTO households VALUES('h','Test','America/New_York','owner','now')")
        self.db.execute("INSERT INTO household_members VALUES('h','owner','owner','now')")
        self.db.execute("INSERT INTO household_members VALUES('h','child','member','now')")
        self.db.execute("INSERT INTO profiles(id,household_id,display_name,kind,linked_user_id,created_at) VALUES('p','h','Child','child','now')")
    def test_link_does_not_create_a_care_grant(self):
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM profile_grants WHERE user_id='child'").fetchone()[0],0)
        q="SELECT id FROM profiles WHERE household_id=? AND linked_user_id=? AND archived_at IS NULL"
        self.assertEqual(self.db.execute(q,('h','child')).fetchone()[0],'p')
        self.assertIsNone(self.db.execute(q,('h','owner')).fetchone())
    def test_member_revocation_makes_link_metadata_inaccessible(self):
        self.db.execute("DELETE FROM household_members WHERE user_id='child' AND household_id='h'")
        result=self.db.execute("""SELECT p.id FROM profiles p JOIN household_members hm
         ON hm.household_id=p.household_id AND hm.user_id=p.linked_user_id
         WHERE p.household_id='h' AND p.linked_user_id='child'""").fetchone()
        self.assertIsNone(result)
if __name__=='__main__':unittest.main()
