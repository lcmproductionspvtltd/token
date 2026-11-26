-- Appointment tokens and unused-token expiry by hours.
--
-- appointment_at: optional – the date and time the customer chose (UTC). Until 15 minutes before it the
--   token waits under "Upcoming appointments"; then it joins the live queue, in line by that time.
-- expires_at: when a token nobody has started becomes Expired (status 'missed'): the booking time – or
--   the appointment time – plus the business's token_expiry_hours. Tokens stay in the queue across the
--   day change until then. A token being served then is closed at its planned end.
-- salons.token_expiry_hours: set by the owner (Business profile); 24 unless changed.

ALTER TABLE tokens ADD COLUMN IF NOT EXISTS appointment_at timestamptz;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS token_expiry_hours integer NOT NULL DEFAULT 24;
ALTER TABLE salons DROP CONSTRAINT IF EXISTS salons_token_expiry_hours_check;
ALTER TABLE salons ADD CONSTRAINT salons_token_expiry_hours_check CHECK (token_expiry_hours BETWEEN 1 AND 720);

-- Open tokens booked before this change: 24 hours from booking, as the new default.
UPDATE tokens SET expires_at = created_at + interval '24 hours'
 WHERE expires_at IS NULL AND status IN ('waiting', 'serving');

-- The live queue and the expiry check read open tokens by branch, whatever their day.
CREATE INDEX IF NOT EXISTS tokens_open_branch_idx ON tokens (branch_id, created_at) WHERE status IN ('waiting', 'serving');
CREATE INDEX IF NOT EXISTS tokens_open_expiry_idx ON tokens (expires_at) WHERE status IN ('waiting', 'serving');
CREATE INDEX IF NOT EXISTS tokens_appointment_idx ON tokens (branch_id, appointment_at) WHERE appointment_at IS NOT NULL;
