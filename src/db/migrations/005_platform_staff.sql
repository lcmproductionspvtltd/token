-- Platform staff: people the super admin adds to help run BQuee (create salons etc.).
-- They are a separate account type from salon staff, with permissions the super admin picks.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c' LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin', 'platform_staff', 'owner', 'staff')),
  ADD CONSTRAINT users_salon_check CHECK (role IN ('superadmin', 'platform_staff') OR salon_id IS NOT NULL),
  ADD CONSTRAINT users_staff_check CHECK (role <> 'staff' OR staff_id IS NOT NULL),
  ADD CONSTRAINT users_platform_check CHECK (role <> 'platform_staff' OR (salon_id IS NULL AND staff_id IS NULL));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active   boolean NOT NULL DEFAULT true;
