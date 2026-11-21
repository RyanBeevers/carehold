PRAGMA foreign_keys=ON;
-- Staging retains all legacy ciphertext and legacy public keys. A migration
-- completes only after every authorized existing recipient copy is staged.
CREATE TABLE account_key_migrations (
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 original_jwk TEXT NOT NULL,
 next_jwk TEXT NOT NULL,
 recovery_envelope_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('staged','complete')),
 created_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE TABLE account_migrated_copies (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('direct','words')),
 source_id TEXT NOT NULL,
 envelope_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,source_kind,source_id)
);
CREATE INDEX migrated_copies_source ON account_migrated_copies(source_kind,source_id,user_id);

-- Short-lived proof-of-possession for legacy browser private keys.
CREATE TABLE account_key_migration_challenges (
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 proof_digest TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
