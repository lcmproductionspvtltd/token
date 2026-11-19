-- Business categories (Clinic, Salon & spa, ...). The super admin assigns one to each business
-- and to each default service; owners see the default services for their category plus the
-- ones marked for all businesses (no category).
CREATE TABLE IF NOT EXISTS business_categories (
  id         text PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  icon       text NOT NULL DEFAULT 'store',
  color      text NOT NULL DEFAULT '#7b2c9e',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE default_services ADD COLUMN IF NOT EXISTS category_id text REFERENCES business_categories (id) ON DELETE SET NULL;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS category_id text REFERENCES business_categories (id) ON DELETE SET NULL;

INSERT INTO business_categories (id, name, icon, color) VALUES
  ('cat-salon', 'Salon & spa', 'sparkle', '#b0357a'),
  ('cat-clinic', 'Clinic & healthcare', 'user', '#0f8a7e'),
  ('cat-service', 'Service centre', 'gear', '#c2410c'),
  ('cat-office', 'Office & bank', 'store', '#2563eb')
ON CONFLICT (id) DO NOTHING;

-- Starter defaults per category (the general ones from 008 stay for all businesses).
INSERT INTO default_services (id, name, category, description, duration_min, price, category_id) VALUES
  ('csv-s1', 'Haircut', 'Hair', 'Wash, cut and style', 30, 300, 'cat-salon'),
  ('csv-s2', 'Beard trim', 'Grooming', 'Shape and line-up', 15, 150, 'cat-salon'),
  ('csv-s3', 'Hair colour', 'Hair', 'Full head, single colour', 60, 1200, 'cat-salon'),
  ('csv-s4', 'Facial', 'Beauty', 'Cleanse, scrub and mask', 45, 900, 'cat-salon'),
  ('csv-s5', 'Manicure', 'Beauty', 'Nail shaping, cuticle care and polish', 30, 500, 'cat-salon'),
  ('csv-c1', 'Doctor consultation', 'Consultation', 'General physician visit', 15, 400, 'cat-clinic'),
  ('csv-c2', 'Specialist consultation', 'Consultation', 'Visit with a specialist', 20, 800, 'cat-clinic'),
  ('csv-c3', 'Blood test', 'Lab', 'Sample collection', 10, 300, 'cat-clinic'),
  ('csv-c4', 'Vaccination', 'Care', 'Injection with a short check', 10, 200, 'cat-clinic'),
  ('csv-v1', 'General servicing', 'Service', 'Full check and routine service', 60, 999, 'cat-service'),
  ('csv-v2', 'Repair estimate', 'Service', 'Inspect and quote for repairs', 15, 0, 'cat-service'),
  ('csv-v3', 'Vehicle / device pickup', 'Desk', 'Collect after service', 5, 0, 'cat-service'),
  ('csv-o1', 'Account opening', 'Accounts', 'Open a new account', 20, 0, 'cat-office'),
  ('csv-o2', 'Cash deposit / withdrawal', 'Cash', 'Counter transaction', 5, 0, 'cat-office'),
  ('csv-o3', 'Loan enquiry', 'Loans', 'Talk to a loan officer', 15, 0, 'cat-office')
ON CONFLICT (id) DO NOTHING;

-- The demo salon, if present, belongs to "Salon & spa".
UPDATE salons SET category_id = 'cat-salon' WHERE slug = 'lotus-salon' AND category_id IS NULL;
