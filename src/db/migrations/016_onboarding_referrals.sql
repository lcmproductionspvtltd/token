-- Who brought each business onto BQuee, and personal referral links for the super admin and team.
--   onboard_source  'admin'    created in the dashboard by the super admin or a team member
--                   'signup'   signed up by itself on the home page / app
--                   'referral' signed up through someone's referral link or code
--   onboard_channel 'web' or 'app'
ALTER TABLE salons ADD COLUMN IF NOT EXISTS onboarded_by text REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS onboarded_by_name text NOT NULL DEFAULT '';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS onboard_source text NOT NULL DEFAULT '';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS onboard_channel text NOT NULL DEFAULT 'web';
UPDATE salons SET onboard_source = CASE WHEN self_signup THEN 'signup' ELSE 'admin' END WHERE onboard_source = '';

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users (referral_code) WHERE referral_code IS NOT NULL;
