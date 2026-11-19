-- Staff switch themselves online/offline during the day (separate from "working" = is_active).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT true;
