PRAGMA foreign_keys=ON;
-- Fictional-data pilot only. No plaintext journal, prompt, reflection or discussion fields.
CREATE TABLE shared_word_spaces (
 id TEXT PRIMARY KEY,
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 created_by TEXT NOT NULL REFERENCES user(id),
 initial_kind TEXT NOT NULL CHECK(initial_kind IN ('prompt','journal')),
 created_at TEXT NOT NULL
);
CREATE INDEX shared_word_spaces_household ON shared_word_spaces(household_id,created_at);
CREATE TABLE shared_word_participants (
 space_id TEXT NOT NULL REFERENCES shared_word_spaces(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 joined_at TEXT NOT NULL,
 PRIMARY KEY(space_id,user_id)
);
CREATE INDEX shared_word_participants_user ON shared_word_participants(user_id,space_id);
CREATE TABLE shared_word_posts (
 id TEXT PRIMARY KEY,
 space_id TEXT NOT NULL REFERENCES shared_word_spaces(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES user(id),
 kind TEXT NOT NULL CHECK(kind IN ('prompt','journal','reflection','discussion')),
 body_hash TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX shared_word_posts_space ON shared_word_posts(space_id,created_at,id);
CREATE TABLE shared_word_copies (
 post_id TEXT NOT NULL REFERENCES shared_word_posts(id) ON DELETE CASCADE,
 recipient_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 envelope_json TEXT NOT NULL,
 PRIMARY KEY(post_id,recipient_id)
);
CREATE INDEX shared_word_copies_recipient ON shared_word_copies(recipient_id,post_id);
-- A private, recipient-scoped inbox. No sender access to seen_at or activity reads.
CREATE TABLE private_word_activity (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('words','direct')),
 source_id TEXT NOT NULL,
 event_kind TEXT NOT NULL CHECK(event_kind IN ('shared','reply','message')),
 created_at TEXT NOT NULL,
 seen_at TEXT
);
CREATE INDEX private_word_activity_inbox ON private_word_activity(user_id,household_id,seen_at,created_at);
CREATE INDEX private_word_activity_source ON private_word_activity(user_id,source_kind,source_id,seen_at);
