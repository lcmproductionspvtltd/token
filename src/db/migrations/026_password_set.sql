-- Owners who signed up with Google or Apple never chose a password (a random one was stored).
-- has_password = false lets them set one without being asked for a "current password".
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_password boolean NOT NULL DEFAULT true;
-- Existing Google/Apple sign-ups: linked when the account was made, and the password never changed.
UPDATE users u SET has_password = false
 WHERE u.password_changed_at IS NULL
   AND EXISTS (SELECT 1 FROM user_identities i
                WHERE i.user_id = u.id AND i.created_at BETWEEN u.created_at AND u.created_at + interval '5 minutes');
