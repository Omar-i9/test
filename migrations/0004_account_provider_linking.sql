-- V19 Hotfix 01: bind additional provider-link challenges to the authenticated account.
-- Additive only; existing sign-in challenges/states default to purpose='signin'.
ALTER TABLE email_auth_challenges
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'signin' CHECK (purpose IN ('signin', 'link'));
ALTER TABLE email_auth_challenges
  ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE google_oauth_states
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'signin' CHECK (purpose IN ('signin', 'link'));
ALTER TABLE google_oauth_states
  ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_auth_challenges_user_purpose
  ON email_auth_challenges(user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_oauth_states_user_purpose
  ON google_oauth_states(user_id, purpose, created_at DESC);
