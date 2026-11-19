-- Two-step sign-in (authenticator app codes) – required for super admin, BQuee team and owners.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret text;              -- encrypted (see services/secret-box.js)
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes text[] NOT NULL DEFAULT '{}'; -- SHA-256 of unused codes
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step bigint NOT NULL DEFAULT 0;      -- a code works only once
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- After the password is right: a short-lived step waiting for the code (or for setting it up).
CREATE TABLE IF NOT EXISTS mfa_challenges (
  id         text PRIMARY KEY,                     -- SHA-256 of the token given to the browser/app
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify', 'setup')),
  secret     text,                                 -- setup only: the new secret (encrypted)
  attempts   integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_challenges_user_idx ON mfa_challenges (user_id);
CREATE INDEX IF NOT EXISTS mfa_challenges_expires_idx ON mfa_challenges (expires_at);

-- Which kind of client a session belongs to (web = cookie, app = bearer token), for "signed-in devices".
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT 'app' CHECK (client IN ('web', 'app'));
