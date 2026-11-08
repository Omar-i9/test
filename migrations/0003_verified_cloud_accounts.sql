-- TAAMEN V19 — verified cloud identity, OAuth identities, short-lived challenges and sessions.
-- Additive migration only. Preserve V17 users/tactical_plans and V18 sync data.

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN display_first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN display_last_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN cloud_sync_consent_at TEXT;
ALTER TABLE users ADD COLUMN cloud_sync_consent_version TEXT;
ALTER TABLE users ADD COLUMN cloud_sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK (cloud_sync_enabled IN (0, 1));
ALTER TABLE users ADD COLUMN account_policy_accepted_at TEXT;
ALTER TABLE users ADD COLUMN account_policy_version TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
  ON users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('email', 'google')),
  provider_subject TEXT NOT NULL CHECK (length(provider_subject) BETWEEN 1 AND 320),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  email_verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_account_identities_user
  ON account_identities(user_id, created_at);

CREATE TABLE IF NOT EXISTS email_auth_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  first_name TEXT NOT NULL DEFAULT '' CHECK (length(first_name) <= 60),
  last_name TEXT NOT NULL DEFAULT '' CHECK (length(last_name) <= 60),
  policy_version TEXT NOT NULL DEFAULT '2.3' CHECK (length(policy_version) BETWEEN 1 AND 20),
  code_hash TEXT NOT NULL CHECK (length(code_hash) = 64),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_auth_challenges_email_created
  ON email_auth_challenges(email, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope_key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL CHECK (window_start >= 0),
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 100)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS cloud_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  csrf_hash TEXT NOT NULL CHECK (length(csrf_hash) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT NOT NULL DEFAULT '' CHECK (length(user_agent) <= 180),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cloud_sessions_user_active
  ON cloud_sessions(user_id, expires_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS google_oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL CHECK (length(state_hash) = 64),
  code_verifier TEXT NOT NULL CHECK (length(code_verifier) BETWEEN 43 AND 128),
  browser_binding_hash TEXT NOT NULL CHECK (length(browser_binding_hash) = 64),
  return_path TEXT NOT NULL DEFAULT '/#home' CHECK (length(return_path) <= 240),
  policy_version TEXT NOT NULL DEFAULT '2.3' CHECK (length(policy_version) BETWEEN 1 AND 20),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;
