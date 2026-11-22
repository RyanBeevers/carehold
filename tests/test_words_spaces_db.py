"""D1-compatible integrity checks for encrypted multi-recipient Words and private activity."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class SharedWordsIntegrity(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted((ROOT/'migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        for uid in ('owner','child','teen','other'):
            self.db.execute("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,1,1)",(uid,uid,uid+'@test.invalid'))
        self.db.execute("INSERT INTO households VALUES('h','Test','America/New_York','owner','now')")
        self.db.execute("INSERT INTO households VALUES('other-h','Separate','America/New_York','other','now')")
        for uid,role in (('owner','owner'),('child','member'),('teen','member')):
            self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h',?,?, 'now')",(uid,role))
        self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('other-h','other','owner','now')")
        self.db.execute("INSERT INTO shared_word_spaces VALUES('s','h','child','prompt','now')")
        for uid in ('child','teen'):
            self.db.execute("INSERT INTO shared_word_participants VALUES('s',?,'now')",(uid,))
        self.db.execute("INSERT INTO shared_word_posts VALUES('p','s','child','prompt','hash','now')")
        for uid in ('child','teen'):
            self.db.execute("INSERT INTO shared_word_copies VALUES('p',?,'fictional ciphertext')",(uid,))

    def test_group_access_is_participant_and_household_scoped(self):
        sql="""SELECT s.id FROM shared_word_spaces s
            JOIN shared_word_participants p ON p.space_id=s.id AND p.user_id=?
            JOIN household_members h ON h.household_id=s.household_id AND h.user_id=?
            WHERE s.id=?"""
        self.assertEqual(self.db.execute(sql,('child','child','s')).fetchone(),('s',))
        self.assertEqual(self.db.execute(sql,('teen','teen','s')).fetchone(),('s',))
        # Household owners and unrelated accounts cannot browse journal writing.
        self.assertIsNone(self.db.execute(sql,('owner','owner','s')).fetchone())
        self.assertIsNone(self.db.execute(sql,('other','other','s')).fetchone())
        # Removing household membership denies access, even before explicit space deletion.
        self.db.execute("DELETE FROM household_members WHERE household_id='h' AND user_id='teen'")
        self.assertIsNone(self.db.execute(sql,('teen','teen','s')).fetchone())
        self.db.execute("DELETE FROM shared_word_participants WHERE space_id='s' AND user_id='teen'")
        self.db.execute("INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('h','teen','member','later')")
        self.assertIsNone(self.db.execute(sql,('teen','teen','s')).fetchone())

    def test_duplicate_and_missing_ciphertext_copies_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO shared_word_copies VALUES('p','teen','duplicate')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO shared_word_copies VALUES('missing','child','cipher')")
        columns=[r[1] for r in self.db.execute("PRAGMA table_info(shared_word_copies)")]
        self.assertEqual(columns,['post_id','recipient_id','envelope_json'])

    def test_recipient_activity_is_private_and_push_opt_in_independent(self):
        self.db.execute("INSERT INTO private_word_activity(id,user_id,household_id,source_kind,source_id,event_kind,created_at) VALUES('e','teen','h','words','s','shared','now')")
        self.assertEqual(self.db.execute("SELECT count(*) FROM private_word_activity WHERE user_id='teen' AND seen_at IS NULL").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM private_word_activity WHERE user_id='owner'").fetchone()[0],0)
        self.db.execute("UPDATE private_word_activity SET seen_at='later' WHERE user_id='teen' AND source_id='s'")
        self.assertEqual(self.db.execute("SELECT count(*) FROM private_word_activity WHERE user_id='teen' AND seen_at IS NULL").fetchone()[0],0)
        # No one becomes push-enabled by joining, even if medication preferences exist.
        self.assertEqual(self.db.execute("SELECT count(*) FROM private_word_push_preferences").fetchone()[0],0)
        self.db.execute("INSERT INTO private_word_push_preferences VALUES('teen','h',1)")
        self.assertEqual(self.db.execute("SELECT enabled FROM private_word_push_preferences WHERE user_id='teen' AND household_id='h'").fetchone()[0],1)

    def test_unread_activity_has_shared_metadata_even_without_client_key(self):
        # An activity badge and a shared-space listing must agree for each
        # authorized recipient. Decryption keys live only in browser IndexedDB
        # and do not participate in this server-side metadata query.
        self.db.execute("INSERT INTO private_word_activity(id,user_id,household_id,source_kind,source_id,event_kind,created_at) VALUES('notice','teen','h','words','s','shared','now')")
        query="""SELECT s.id,s.initial_kind,s.created_by,s.created_at,u.name creator_name,
          p.id initial_post_id,c.envelope_json FROM shared_word_spaces s
          JOIN shared_word_participants own ON own.space_id=s.id AND own.user_id=?
          JOIN user u ON u.id=s.created_by
          JOIN shared_word_posts p ON p.space_id=s.id AND p.kind IN ('prompt','journal')
          JOIN shared_word_copies c ON c.post_id=p.id AND c.recipient_id=?
          WHERE s.household_id=? ORDER BY s.created_at DESC LIMIT 100"""
        row=self.db.execute(query,('teen','teen','h')).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row[0],'s')
        self.assertEqual(row[1],'prompt')
        # Other circle members aren't allowed to browse this private space,
        # even though its metadata can be returned without local keys.
        self.assertIsNone(self.db.execute(query,('owner','owner','h')).fetchone())
        self.assertIsNone(self.db.execute(query,('teen','teen','other-h')).fetchone())

if __name__=='__main__':unittest.main()
