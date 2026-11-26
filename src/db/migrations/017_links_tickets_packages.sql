-- 1. Several labelled referral links per super admin / team member (e.g. "Facebook ads").
CREATE TABLE IF NOT EXISTS referral_links (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE,
  label      text NOT NULL DEFAULT '',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_links_user_idx ON referral_links (user_id);
-- Existing personal codes become each person's first link.
INSERT INTO referral_links (id, user_id, code, label)
  SELECT substr(md5(random()::text || u.id), 1, 10), u.id, u.referral_code, 'My link'
    FROM users u WHERE u.referral_code IS NOT NULL
  ON CONFLICT (code) DO NOTHING;

ALTER TABLE salons ADD COLUMN IF NOT EXISTS referral_link_id text REFERENCES referral_links (id) ON DELETE SET NULL;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS referral_label text NOT NULL DEFAULT '';
UPDATE salons s SET referral_label = 'My link'
  WHERE s.onboard_source = 'referral' AND s.referral_label = '';

-- 2. Support tickets from business owners to the BQuee team.
CREATE SEQUENCE IF NOT EXISTS support_ticket_numbers START 1001;
CREATE TABLE IF NOT EXISTS support_tickets (
  id          text PRIMARY KEY,
  number      integer NOT NULL,
  salon_id    text NOT NULL REFERENCES salons (id) ON DELETE CASCADE,
  created_by  text REFERENCES users (id) ON DELETE SET NULL,
  category    text NOT NULL DEFAULT 'issue',
  subject     text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  owner_seen_at timestamptz NOT NULL DEFAULT now(),
  team_seen_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_salon_idx ON support_tickets (salon_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id          bigserial PRIMARY KEY,
  ticket_id   text NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
  author_id   text REFERENCES users (id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  from_team   boolean NOT NULL DEFAULT false,
  body        text NOT NULL DEFAULT '',
  image_url   text NOT NULL DEFAULT '',
  -- a status change shown in the conversation ("Marked as resolved")
  status      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages (ticket_id, id);

-- 3. The package a business picked when it signed up (from the home page pricing).
ALTER TABLE salons ADD COLUMN IF NOT EXISTS signup_package text NOT NULL DEFAULT '';
