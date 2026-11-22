PRAGMA foreign_keys=ON;
-- Additive trusted-device enrollment. Existing account identity, CH1 envelope,
-- private journals, drafts, message copies and migrations are NOT altered.
-- An enrolled device is a recovery approver, not an independent message-key epoch.
CREATE TABLE trusted_devices (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL,
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 60),
 account_public_jwk TEXT NOT NULL,
 created_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL,
 revoked_at TEXT,
 PRIMARY KEY(user_id,device_id)
);
CREATE INDEX trusted_devices_active ON trusted_devices(user_id,revoked_at);

-- Challenge can only be decrypted with the current account private key.
-- Its random plaintext and recovery secrets are never stored in D1.
CREATE TABLE trusted_device_challenges (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL,
 proof_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,device_id)
);
CREATE INDEX trusted_device_challenges_expiration ON trusted_device_challenges(expires_at);

-- A recipient-generated ephemeral public key binds every pending approval.
-- Ciphertext-only CH1 transfer; no plaintext backup code or private key.
CREATE TABLE trusted_device_requests (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL,
 device_label TEXT NOT NULL,
 candidate_public_jwk TEXT NOT NULL,
 account_public_jwk TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','approved','consumed','cancelled')),
 ciphertext_json TEXT,
 approved_by_device_id TEXT,
 created_at TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 approved_at TEXT,
 consumed_at TEXT
);
CREATE INDEX trusted_device_requests_user ON trusted_device_requests(user_id,state,expires_at);
CREATE INDEX trusted_device_requests_expiration ON trusted_device_requests(expires_at);

-- Optional passkey PRF-assisted recovery, bound to an actual credential.
-- Only authenticated browser-derived ciphertext is stored, never a PRF output
-- or a CH1 recovery secret. Not all synced passkeys support PRF.
CREATE TABLE passkey_recovery_wrappers (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 credential_id TEXT NOT NULL,
 account_public_jwk TEXT NOT NULL,
 salt TEXT NOT NULL,
 iv TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,credential_id)
);
