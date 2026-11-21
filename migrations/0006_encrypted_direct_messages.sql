PRAGMA foreign_keys=ON;
-- Ciphertext-only one-to-one pilot. No plaintext message columns.
CREATE TABLE message_device_keys (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, public_jwk TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE direct_threads (id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE, pair_key TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES user(id), created_at TEXT NOT NULL, UNIQUE(household_id,pair_key));
CREATE TABLE direct_thread_members (thread_id TEXT NOT NULL REFERENCES direct_threads(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, joined_at TEXT NOT NULL, PRIMARY KEY(thread_id,user_id));
CREATE INDEX direct_thread_members_user ON direct_thread_members(user_id);
CREATE TABLE encrypted_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES direct_threads(id) ON DELETE CASCADE, sender_id TEXT NOT NULL REFERENCES user(id), body_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX encrypted_messages_thread ON encrypted_messages(thread_id,created_at,id);
CREATE TABLE encrypted_message_copies (message_id TEXT NOT NULL REFERENCES encrypted_messages(id) ON DELETE CASCADE, recipient_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, envelope_json TEXT NOT NULL, PRIMARY KEY(message_id,recipient_id));
CREATE INDEX encrypted_message_copies_recipient ON encrypted_message_copies(recipient_id,message_id);
