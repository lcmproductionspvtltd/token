-- Database tidy-up: indexes for every foreign key that lacked one (fast lookups and deletes),
-- and fixed lists of allowed values for "choice" columns, so bad values can never be stored.

-- 1. Indexes on foreign keys
CREATE INDEX IF NOT EXISTS default_services_category_idx ON default_services (category_id);
CREATE INDEX IF NOT EXISTS salons_category_idx           ON salons (category_id);
CREATE INDEX IF NOT EXISTS salons_onboarded_by_idx       ON salons (onboarded_by);
CREATE INDEX IF NOT EXISTS salons_referral_link_idx      ON salons (referral_link_id);
CREATE INDEX IF NOT EXISTS service_branch_prices_branch_idx ON service_branch_prices (branch_id);
CREATE INDEX IF NOT EXISTS service_branches_branch_idx   ON service_branches (branch_id);
CREATE INDEX IF NOT EXISTS service_groups_category_idx   ON service_groups (category_id);
CREATE INDEX IF NOT EXISTS staff_branch_idx              ON staff (branch_id);
CREATE INDEX IF NOT EXISTS staff_services_service_idx    ON staff_services (service_id);
CREATE INDEX IF NOT EXISTS support_messages_author_idx   ON support_messages (author_id);
CREATE INDEX IF NOT EXISTS support_tickets_created_by_idx ON support_tickets (created_by);
CREATE INDEX IF NOT EXISTS token_items_service_idx       ON token_items (service_id);
CREATE INDEX IF NOT EXISTS tokens_offer_idx              ON tokens (offer_id);
CREATE INDEX IF NOT EXISTS users_salon_idx               ON users (salon_id);

-- 2. Allowed values (any odd old value is first set to the default)
UPDATE salons SET onboard_source = 'admin' WHERE onboard_source NOT IN ('admin', 'referral', 'signup');
UPDATE salons SET onboard_channel = 'web' WHERE onboard_channel NOT IN ('web', 'app');
UPDATE salons SET service_mode = 'multiple' WHERE service_mode NOT IN ('single', 'multiple');
UPDATE salons SET staff_mode = 'multiple' WHERE staff_mode NOT IN ('single', 'multiple');
UPDATE support_tickets SET category = 'other' WHERE category NOT IN ('bug', 'issue', 'question', 'billing', 'feature', 'other');
UPDATE support_messages SET status = '' WHERE status NOT IN ('', 'open', 'in_progress', 'resolved', 'closed');
UPDATE tokens SET discount_type = 'none' WHERE discount_type NOT IN ('none', 'percent', 'flat');

ALTER TABLE salons ALTER COLUMN onboard_source SET DEFAULT 'admin';
ALTER TABLE salons
  ADD CONSTRAINT salons_onboard_source_check  CHECK (onboard_source IN ('admin', 'referral', 'signup')),
  ADD CONSTRAINT salons_onboard_channel_check CHECK (onboard_channel IN ('web', 'app')),
  ADD CONSTRAINT salons_service_mode_check    CHECK (service_mode IN ('single', 'multiple')),
  ADD CONSTRAINT salons_staff_mode_check      CHECK (staff_mode IN ('single', 'multiple'));
ALTER TABLE support_tickets  ADD CONSTRAINT support_tickets_category_check CHECK (category IN ('bug', 'issue', 'question', 'billing', 'feature', 'other'));
ALTER TABLE support_messages ADD CONSTRAINT support_messages_status_check  CHECK (status IN ('', 'open', 'in_progress', 'resolved', 'closed'));
ALTER TABLE tokens ADD CONSTRAINT tokens_discount_type_check CHECK (discount_type IN ('none', 'percent', 'flat'));
