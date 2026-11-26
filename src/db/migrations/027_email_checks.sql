-- Email codes: proving an email belongs to the person (sign-up, "confirm my email"), "forgot password",
-- and signing in when an account has had too many wrong passwords. Only a hash of each 6-digit code
-- is stored; a code works once, for 15 minutes, with at most 5 tries.
CREATE TABLE IF NOT EXISTS email_codes (
  id          text PRIMARY KEY,                -- random; the app/website holds it while the person types the code
  purpose     text NOT NULL,                   -- signup, customer-signup, verify, customer-verify, reset, customer-reset, login
  email       text NOT NULL,
  code_hash   text NOT NULL,
  subject_id  text,                            -- the user or customer it is for (none for sign-up)
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_codes_lookup_idx ON email_codes (purpose, email);
CREATE INDEX IF NOT EXISTS email_codes_expires_idx ON email_codes (expires_at);

-- When the email was proven to belong to the person. Google/Apple sign-in only joins an existing
-- account whose email is proven, so nobody can sign up with someone else's email and wait for them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
-- Accounts already joined to Google/Apple: that provider proved the email.
UPDATE users u SET email_verified_at = now()
 WHERE u.email IS NOT NULL AND u.email_verified_at IS NULL
   AND EXISTS (SELECT 1 FROM user_identities i WHERE i.user_id = u.id AND lower(i.email) = lower(u.email));

-- New business owners set up two-step sign-in right after sign-up (and at the next sign-in if they
-- skipped it). They can still switch it off later in Sign-in security.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_setup_due boolean NOT NULL DEFAULT false;
