-- Service groups (Hair, Facial, Lab, ...) belong to a business category; groups with no
-- category are for all businesses. Default services pick their group from these lists.
CREATE TABLE IF NOT EXISTS service_groups (
  id          text PRIMARY KEY,
  category_id text REFERENCES business_categories (id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_groups_unique ON service_groups (COALESCE(category_id, ''), lower(name));

-- Start from the groups the default services already use.
INSERT INTO service_groups (id, category_id, name)
SELECT 'grp-' || substr(md5(COALESCE(d.category_id, '') || '|' || lower(d.category)), 1, 10), d.category_id, min(d.category)
  FROM default_services d
 WHERE d.category <> ''
 GROUP BY d.category_id, lower(d.category)
ON CONFLICT DO NOTHING;

-- A few useful extras for the starter categories.
INSERT INTO service_groups (id, category_id, name) VALUES
  ('grp-s-facial', 'cat-salon', 'Facial'),
  ('grp-s-nails', 'cat-salon', 'Nails'),
  ('grp-s-spa', 'cat-salon', 'Spa'),
  ('grp-c-dental', 'cat-clinic', 'Dental'),
  ('grp-v-repair', 'cat-service', 'Repair'),
  ('grp-o-enq', 'cat-office', 'Enquiry')
ON CONFLICT DO NOTHING;
