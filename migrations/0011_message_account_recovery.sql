PRAGMA foreign_keys=ON;
-- Additive, ciphertext-only recovery state for FUTURE fresh accounts. The legacy
-- message_device_keys table, existing public keys, direct message copies, and
-- shared Words ciphertext are intentionally untouched.
--
-- Until the client-side onboarding, journal synchronization, migration, and
-- device-revocation design is complete, this table is only a foundation.
CREATE TABLE message_account_recovery (
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 public_jwk TEXT NOT NULL,
 envelope_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
