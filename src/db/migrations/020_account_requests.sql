-- Account deletion / deactivation requests, raised from the apps by any user
-- (customer, business owner, staff, BQuee team member) and handled by the super admin.
CREATE TABLE IF NOT EXISTS account_requests (
  id            text PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('deactivate', 'delete')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rejected', 'cancelled')),
  role          text NOT NULL CHECK (role IN ('customer', 'owner', 'staff', 'platform_staff')),
  user_id       text REFERENCES users (id) ON DELETE SET NULL,
  customer_id   text REFERENCES customers (id) ON DELETE SET NULL,
  salon_id      text REFERENCES salons (id) ON DELETE SET NULL,
  -- Kept as text so the record still says who asked after the account is deleted.
  name          text NOT NULL DEFAULT '',
  email         text NOT NULL DEFAULT '',
  mobile        text NOT NULL DEFAULT '',
  business_name text NOT NULL DEFAULT '',
  reason        text NOT NULL CHECK (reason IN ('not_using', 'privacy', 'other_app', 'business_closed', 'left_job', 'too_expensive', 'other')),
  details       text NOT NULL DEFAULT '',
  admin_note    text NOT NULL DEFAULT '',
  handled_by    text REFERENCES users (id) ON DELETE SET NULL,
  handled_by_name text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  handled_at    timestamptz,
  CHECK ((user_id IS NULL) OR (customer_id IS NULL))
);
CREATE INDEX IF NOT EXISTS account_requests_status_idx ON account_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS account_requests_user_idx ON account_requests (user_id);
CREATE INDEX IF NOT EXISTS account_requests_customer_idx ON account_requests (customer_id);
CREATE INDEX IF NOT EXISTS account_requests_salon_idx ON account_requests (salon_id);
CREATE INDEX IF NOT EXISTS account_requests_handled_by_idx ON account_requests (handled_by);
-- One open request per account at a time.
CREATE UNIQUE INDEX IF NOT EXISTS account_requests_one_pending_user ON account_requests (user_id) WHERE status = 'pending' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_requests_one_pending_customer ON account_requests (customer_id) WHERE status = 'pending' AND customer_id IS NOT NULL;
