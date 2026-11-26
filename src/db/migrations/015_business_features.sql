-- Menus and features the super admin switches on/off for each business (see services/features.js).
ALTER TABLE salons ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;
