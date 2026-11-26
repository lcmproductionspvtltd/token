-- Sign in / sign up with Google or Apple (business owners only).

-- A business owner's Google or Apple account, linked to their BQuee account.
CREATE TABLE IF NOT EXISTS user_identities (
  provider   text NOT NULL CHECK (provider IN ('google', 'apple')),
  subject    text NOT NULL,                       -- the provider's fixed id for that person ("sub")
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS user_identities_user_idx ON user_identities (user_id);

-- A sign-in started at Google/Apple and not back yet (10 minutes).
CREATE TABLE IF NOT EXISTS oauth_states (
  id         text PRIMARY KEY,                    -- SHA-256 of the "state" sent to the provider
  provider   text NOT NULL,
  client     text NOT NULL CHECK (client IN ('web', 'app')),
  nonce      text NOT NULL,                       -- must come back inside the provider's signed answer
  binding    text NOT NULL,                       -- SHA-256 of the browser cookie (web) or app verifier (PKCE)
  expires_at timestamptz NOT NULL
);

-- The verified answer, picked up once by the same browser/app: sign in, or sign up with these details.
CREATE TABLE IF NOT EXISTS oauth_tickets (
  id         text PRIMARY KEY,                    -- SHA-256 of the ticket
  kind       text NOT NULL CHECK (kind IN ('login', 'signup')),
  provider   text NOT NULL,
  subject    text NOT NULL,
  email      text NOT NULL DEFAULT '',
  name       text NOT NULL DEFAULT '',
  user_id    text REFERENCES users (id) ON DELETE CASCADE,
  client     text NOT NULL,
  binding    text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON oauth_states (expires_at);
CREATE INDEX IF NOT EXISTS oauth_tickets_expires_idx ON oauth_tickets (expires_at);
