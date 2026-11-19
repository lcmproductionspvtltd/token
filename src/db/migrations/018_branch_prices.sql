-- A different price for a service in one branch. No row = the service's normal (default) price.
CREATE TABLE IF NOT EXISTS service_branch_prices (
  service_id text NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  branch_id  text NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
  price      numeric(10, 2) NOT NULL CHECK (price >= 0),
  PRIMARY KEY (service_id, branch_id)
);
