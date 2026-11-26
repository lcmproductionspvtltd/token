-- Platform-wide service templates kept by the super admin. Salon owners copy them into
-- their own salon; the copies are independent (editing or deleting them never touches these).
CREATE TABLE IF NOT EXISTS default_services (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  category     text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  duration_min integer NOT NULL CHECK (duration_min BETWEEN 1 AND 600),
  price        numeric(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  image_url    text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- A starter list the super admin can edit or delete.
INSERT INTO default_services (id, name, category, description, duration_min, price) VALUES
  ('dsv01', 'Haircut', 'Hair', 'Wash, cut and style', 30, 300),
  ('dsv02', 'Kids haircut', 'Hair', 'For children under 12', 20, 200),
  ('dsv03', 'Beard trim', 'Grooming', 'Shape and line-up', 15, 150),
  ('dsv04', 'Shave', 'Grooming', 'Classic hot-towel shave', 20, 150),
  ('dsv05', 'Hair colour', 'Hair', 'Full head, single colour', 60, 1200),
  ('dsv06', 'Hair spa', 'Hair', 'Deep conditioning treatment', 45, 800),
  ('dsv07', 'Head massage', 'Spa', 'Oil head massage', 20, 250),
  ('dsv08', 'Facial', 'Beauty', 'Cleanse, scrub and mask', 45, 900),
  ('dsv09', 'Eyebrow threading', 'Beauty', 'Shape and clean-up', 10, 60),
  ('dsv10', 'Manicure', 'Beauty', 'Nail shaping, cuticle care and polish', 30, 500),
  ('dsv11', 'Pedicure', 'Beauty', 'Soak, scrub, nail care and polish', 40, 600)
ON CONFLICT (id) DO NOTHING;
