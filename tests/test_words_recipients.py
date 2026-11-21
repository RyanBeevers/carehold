import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
QUERY="""SELECT u.id,u.name FROM household_members hm
 JOIN user u ON u.id=hm.user_id
 WHERE hm.household_id=? AND hm.user_id<>?
 AND (?='owner' OR hm.role='owner')
 ORDER BY hm.joined_at LIMIT 30"""

class RecipientPreviewScope(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        for uid in ('owner','teen','child'):
            self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,1,1)",(uid,uid.title(),uid+'@example.invalid',0))
        self.db.execute("INSERT INTO households VALUES('circle','Test','America/New_York','owner','now')")
        for idx,(uid,role) in enumerate((('owner','owner'),('teen','member'),('child','member'))):
            self.db.execute("INSERT INTO household_members VALUES(?,?,?,?)",('circle',uid,role,f'2026-01-01T00:00:0{idx}Z'))

    def test_child_or_teen_sees_only_household_owner(self):
        rows=self.db.execute(QUERY,('circle','teen','member')).fetchall()
        self.assertEqual(rows,[('owner','Owner')])

    def test_owner_sees_other_members_but_not_themselves(self):
        rows=self.db.execute(QUERY,('circle','owner','owner')).fetchall()
        self.assertEqual(rows,[('teen','Teen'),('child','Child')])

    def test_other_household_produces_no_options(self):
        self.assertEqual(self.db.execute(QUERY,('no-such-household','teen','member')).fetchall(),[])

if __name__=='__main__':unittest.main()
