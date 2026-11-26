-- Offers can carry a booking discount, and a token remembers the offer the customer booked with.
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value numeric(10, 2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE offers ADD CONSTRAINT offers_discount_check CHECK (discount_type IN ('none', 'percent', 'flat') AND discount_value >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A copy of the offer at booking time, so later edits to the offer don't change past tokens.
ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS offer_id text REFERENCES offers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS offer_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value numeric(10, 2) NOT NULL DEFAULT 0;
