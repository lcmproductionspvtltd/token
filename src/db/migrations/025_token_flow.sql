-- How staff start and finish a token, chosen by the business owner in Settings:
--   'per_service' = every service on a token is started and finished on its own (the default)
--   'whole'       = one Start starts all of a token's waiting services, one Finish ends them;
--                   each staff member starts and finishes only their own services on the token.
ALTER TABLE salons ADD COLUMN IF NOT EXISTS token_flow text NOT NULL DEFAULT 'per_service';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salons_token_flow_check') THEN
    ALTER TABLE salons ADD CONSTRAINT salons_token_flow_check CHECK (token_flow IN ('per_service', 'whole'));
  END IF;
END $$;
