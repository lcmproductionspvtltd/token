-- Customer accounts for the BQuee customer app. Kept apart from staff/owner/admin users.
CREATE TABLE IF NOT EXISTS customers (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL DEFAULT '',
  mobile        text NOT NULL,
  password_hash text NOT NULL,
  photo_url     text NOT NULL DEFAULT '',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz
);
-- One account per mobile number, and per email when given.
CREATE UNIQUE INDEX IF NOT EXISTS customers_mobile_idx ON customers (mobile);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_idx ON customers (email) WHERE email <> '';

CREATE TABLE IF NOT EXISTS customer_sessions (
  token       text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_sessions_customer_idx ON customer_sessions (customer_id);

-- Tokens booked from the customer app belong to that customer.
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS customer_id text REFERENCES customers (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tokens_customer_idx ON tokens (customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
