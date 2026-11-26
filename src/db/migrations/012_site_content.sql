-- Landing page content managed by the super admin, and businesses that signed up by themselves.
CREATE TABLE IF NOT EXISTS site_content (
  key        text PRIMARY KEY,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE salons ADD COLUMN IF NOT EXISTS self_signup boolean NOT NULL DEFAULT false;
