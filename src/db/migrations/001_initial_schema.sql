-- BQuee – initial schema
-- Every table belongs to a salon (multi-tenant). Deleting a salon removes all of its data.

CREATE TABLE salons (
  id             text PRIMARY KEY,
  slug           text NOT NULL UNIQUE,
  name           text NOT NULL,
  tagline        text NOT NULL DEFAULT '',
  about          text NOT NULL DEFAULT '',
  hours          text NOT NULL DEFAULT '',
  phone          text NOT NULL DEFAULT '',
  whatsapp       text NOT NULL DEFAULT '',
  instagram      text NOT NULL DEFAULT '',
  email          text NOT NULL DEFAULT '',
  address        text NOT NULL DEFAULT '',
  currency       text NOT NULL DEFAULT '₹',
  brand_color    text NOT NULL DEFAULT '#7b2c9e',
  logo_url       text NOT NULL DEFAULT '',
  cover_url      text NOT NULL DEFAULT '',
  -- subscription (managed by the super admin)
  owner_name     text NOT NULL DEFAULT '',
  owner_mobile   text NOT NULL DEFAULT '',
  owner_email    text NOT NULL DEFAULT '',
  plan_name      text NOT NULL DEFAULT '',
  plan_amount    numeric(12, 2) NOT NULL DEFAULT 0,
  expires_on     date,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id           text PRIMARY KEY,
  salon_id     text NOT NULL REFERENCES salons (id) ON DELETE CASCADE,
  name         text NOT NULL,
  token_prefix text NOT NULL DEFAULT '',
  address      text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX branches_salon_idx ON branches (salon_id);

CREATE TABLE services (
  id           text PRIMARY KEY,
  salon_id     text NOT NULL REFERENCES salons (id) ON DELETE CASCADE,
  name         text NOT NULL,
  category     text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  duration_min integer NOT NULL CHECK (duration_min BETWEEN 1 AND 600),
  price        numeric(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  image_url    text NOT NULL DEFAULT '',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_salon_idx ON services (salon_id);

-- A service with no rows here is offered in every branch of the salon.
CREATE TABLE service_branches (
  service_id text NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  branch_id  text NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, branch_id)
);

CREATE TABLE staff (
  id         text PRIMARY KEY,
  salon_id   text NOT NULL REFERENCES salons (id) ON DELETE CASCADE,
  branch_id  text NOT NULL REFERENCES branches (id) ON DELETE RESTRICT,
  name       text NOT NULL,
  title      text NOT NULL DEFAULT '',
  mobile     text NOT NULL DEFAULT '',
  photo_url  text NOT NULL DEFAULT '',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_salon_idx ON staff (salon_id);

CREATE TABLE staff_services (
  staff_id   text NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  service_id text NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

CREATE TABLE users (
  id            text PRIMARY KEY,
  role          text NOT NULL CHECK (role IN ('superadmin', 'owner', 'staff')),
  username      text NOT NULL UNIQUE,
  email         text UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  salon_id      text REFERENCES salons (id) ON DELETE CASCADE,
  staff_id      text UNIQUE REFERENCES staff (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (role = 'superadmin' OR salon_id IS NOT NULL),
  CHECK (role <> 'staff' OR staff_id IS NOT NULL)
);

CREATE TABLE sessions (
  token      text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- Daily token numbers per branch (allocated atomically).
CREATE TABLE token_counters (
  branch_id   text NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  token_date  date NOT NULL,
  last_number integer NOT NULL,
  PRIMARY KEY (branch_id, token_date)
);

CREATE TABLE tokens (
  id              text PRIMARY KEY,
  salon_id        text NOT NULL REFERENCES salons (id) ON DELETE CASCADE,
  branch_id       text NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  token_date      date NOT NULL,
  number          integer NOT NULL,
  prefix          text NOT NULL DEFAULT '',
  customer_name   text NOT NULL,
  customer_mobile text NOT NULL,
  customer_email  text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'serving', 'done', 'cancelled', 'missed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  UNIQUE (branch_id, token_date, number)
);
CREATE INDEX tokens_branch_day_idx ON tokens (branch_id, token_date);
CREATE INDEX tokens_salon_day_idx ON tokens (salon_id, token_date);
CREATE INDEX tokens_open_idx ON tokens (token_date) WHERE status IN ('waiting', 'serving');

-- One row per service on a token. Names/prices are copied so history never changes.
CREATE TABLE token_items (
  id           bigserial PRIMARY KEY,
  token_id     text NOT NULL REFERENCES tokens (id) ON DELETE CASCADE,
  position     integer NOT NULL,
  service_id   text REFERENCES services (id) ON DELETE SET NULL,
  service_name text NOT NULL,
  staff_id     text REFERENCES staff (id) ON DELETE SET NULL,
  staff_name   text NOT NULL,
  duration_min integer NOT NULL,
  price        numeric(10, 2) NOT NULL,
  status       text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'done', 'missed')),
  started_at   timestamptz,
  ended_at     timestamptz,
  UNIQUE (token_id, position)
);
CREATE INDEX token_items_staff_idx ON token_items (staff_id);
CREATE INDEX token_items_token_idx ON token_items (token_id);

CREATE TABLE offers (
  id          text PRIMARY KEY,
  salon_id    text NOT NULL REFERENCES salons (id) ON DELETE CASCADE,
  title       text NOT NULL,
  badge       text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  promo_code  text NOT NULL DEFAULT '',
  valid_until date,
  theme       smallint NOT NULL DEFAULT 0 CHECK (theme BETWEEN 0 AND 5),
  image_url   text NOT NULL DEFAULT '',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_salon_idx ON offers (salon_id);

CREATE TABLE testimonials (
  id          text PRIMARY KEY,
  salon_id    text NOT NULL REFERENCES salons (id) ON DELETE CASCADE,
  client_name text NOT NULL,
  label       text NOT NULL DEFAULT '',
  quote       text NOT NULL,
  rating      smallint NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  photo_url   text NOT NULL DEFAULT '',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX testimonials_salon_idx ON testimonials (salon_id);
