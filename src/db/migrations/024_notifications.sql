-- Notifications for every signed-in person: business owners, staff, the BQuee team and customers.
-- Each person gets their own row ("A new token…", "It's your turn…"); old ones are cleared after 60 days.
CREATE TABLE IF NOT EXISTS notifications (
  id          bigserial PRIMARY KEY,
  user_id     text REFERENCES users (id) ON DELETE CASCADE,
  customer_id text REFERENCES customers (id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'info',
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  link        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (customer_id IS NULL))
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_customer_idx ON notifications (customer_id, id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_age_idx ON notifications (created_at);

-- Everything up to this notification id has been read (one number per person – no per-row flags).
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes_read bigint NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes_read bigint NOT NULL DEFAULT 0;
