-- How the customer booking form works for a business:
--   service_mode 'single'   = the business offers one service, so customers don't pick a service
--   staff_mode   'single'   = one staff member serves everyone, so customers don't pick a staff member
ALTER TABLE salons ADD COLUMN IF NOT EXISTS service_mode text NOT NULL DEFAULT 'multiple';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS staff_mode text NOT NULL DEFAULT 'multiple';
