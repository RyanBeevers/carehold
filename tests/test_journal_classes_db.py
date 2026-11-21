"""Private ciphertext sync and account classification database integrity."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class JournalAndClassMigration(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for p in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(p.read_text())
        for name in ('a','b','minor'):
            self.db.execute(
                'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,1,1)',
                (name,name,name+'@test.invalid')
            )
        self.db.execute("INSERT INTO households VALUES('h','Fictional','America/New_York','a','now')")
        self.db.execute("INSERT INTO household_members VALUES('h','a','owner','now')")
        self.db.execute("INSERT INTO household_members VALUES('h','b','member','now')")
        self.db.execute("INSERT INTO household_members VALUES('h','minor','member','now')")
        for uid,cls in [('a','adult'),('b','adult'),('minor','child')]:
            self.db.execute(
                'INSERT INTO household_member_classes(household_id,user_id,classification,updated_at) VALUES(?,?,?,?)',
                ('h',uid,cls,'now')
            )

    def tearDown(self):
        self.db.close()

    def test_journal_keys_are_per_owner_per_household(self):
        cols=[row[1] for row in self.db.execute('PRAGMA table_info(private_journal_sync)')]
        self.assertEqual(cols,['user_id','household_id','entry_id','revision','iv','ciphertext',
                                'created_at','updated_at','deleted_at'])
        self.assertFalse({'text','title','prompt','private_key','recovery_code'}.intersection(cols))
        self.db.execute(
            "INSERT INTO private_journal_sync VALUES('a','h','id',1,'nonce','cipher',1,1,NULL)"
        )
        self.db.execute(
            "INSERT INTO private_journal_sync VALUES('b','h','id',1,'different','another',1,1,NULL)"
        )
        a=self.db.execute(
            "SELECT ciphertext FROM private_journal_sync WHERE user_id=? AND household_id=?",
            ('a','h')
        ).fetchall()
        b=self.db.execute(
            "SELECT ciphertext FROM private_journal_sync WHERE user_id=? AND household_id=?",
            ('b','h')
        ).fetchall()
        self.assertEqual(a,[('cipher',)])
        self.assertEqual(b,[('another',)])
        result=self.db.execute(
            "UPDATE private_journal_sync SET revision=revision+1,ciphertext='new' "
            "WHERE user_id='a' AND household_id='h' AND entry_id='id' AND revision=0"
        )
        self.assertEqual(result.rowcount,0)

    def test_minor_classification_is_separate_from_household_role(self):
        classes=self.db.execute(
            'SELECT user_id,classification FROM household_member_classes ORDER BY user_id'
        ).fetchall()
        self.assertEqual(dict(classes),{'a':'adult','b':'adult','minor':'child'})
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "UPDATE household_member_classes SET classification='owner' WHERE user_id='minor'"
            )
        self.db.execute(
            "INSERT INTO household_member_class_changes VALUES('event','h','minor','child','teen','a','now')"
        )
        self.assertEqual(self.db.execute(
            "SELECT next_class FROM household_member_class_changes WHERE id='event'"
        ).fetchone(),('teen',))
        self.db.execute("DELETE FROM household_members WHERE household_id='h' AND user_id='minor'")
        self.assertFalse(self.db.execute(
            "SELECT 1 FROM household_member_classes WHERE user_id='minor'"
        ).fetchone())

if __name__=='__main__': unittest.main()
