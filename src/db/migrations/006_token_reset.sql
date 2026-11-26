-- Owners can restart token numbers (A-001 again) during the day. Each restart starts a new
-- "cycle", so the same number can be used again on the same day without clashing.
ALTER TABLE token_counters
  ADD COLUMN IF NOT EXISTS cycle integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reset_at timestamptz;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS cycle integer NOT NULL DEFAULT 0;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'tokens'::regclass AND contype = 'u'
             AND pg_get_constraintdef(oid) LIKE '%(branch_id, token_date, number)%' LOOP
    EXECUTE format('ALTER TABLE tokens DROP CONSTRAINT %I', c.conname);
  END LOOP; END $$;
ALTER TABLE tokens ADD CONSTRAINT tokens_branch_date_cycle_number_key UNIQUE (branch_id, token_date, cycle, number);
