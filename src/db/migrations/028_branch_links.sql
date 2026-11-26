-- Branch links by business name: bquee.com/b/lotussalon instead of bquee.com/b/358f30d501.
-- A business with one branch gets its name (letters and digits, lower case); each further branch gets
-- name-branch (lotussalon-mgroad). A taken link gets -2, -3 …. Links never change once given, so printed
-- QR posters keep working; the old number links (/b/<id>) keep working too.
-- Names with no latin letters or digits (for example Arabic only) keep the number link.

ALTER TABLE branches ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS branches_slug_idx ON branches (slug) WHERE slug IS NOT NULL;

CREATE OR REPLACE FUNCTION bquee_link_part(t text) RETURNS text AS $$
  SELECT left(lower(regexp_replace(coalesce(t, ''), '[^a-zA-Z0-9]+', '', 'g')), 30)
$$ LANGUAGE sql IMMUTABLE;

-- The link for a new branch (or NULL when the name gives none).
-- p_first: is this the business's first branch (NULL = work it out: no other branch yet).
CREATE OR REPLACE FUNCTION bquee_branch_slug(p_salon text, p_branch text, p_name text, p_first boolean DEFAULT NULL)
RETURNS text AS $$
DECLARE
  base text;
  first boolean;
  candidate text;
  n integer := 1;
BEGIN
  SELECT bquee_link_part(name) INTO base FROM salons WHERE id = p_salon;
  IF base IS NULL OR length(base) < 2 THEN
    RETURN NULL;
  END IF;
  first := p_first;
  IF first IS NULL THEN
    SELECT NOT EXISTS (SELECT 1 FROM branches WHERE salon_id = p_salon AND id <> p_branch) INTO first;
  END IF;
  IF first THEN
    candidate := base;
  ELSIF length(bquee_link_part(p_name)) > 0 THEN
    candidate := base || '-' || bquee_link_part(p_name);
  ELSE
    candidate := base || '-2';
  END IF;
  -- at least 4 characters, so it is never mistaken for something else
  IF length(candidate) < 4 THEN
    candidate := candidate || '-' || left(p_branch, 4);
  END IF;
  WHILE EXISTS (SELECT 1 FROM branches WHERE slug = candidate AND id <> p_branch)
     OR EXISTS (SELECT 1 FROM branches WHERE id = candidate) LOOP
    n := n + 1;
    candidate := regexp_replace(candidate, '-[0-9]+$', '') || '-' || n;
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bquee_branch_slug_trigger() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := bquee_branch_slug(NEW.salon_id, NEW.id, NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS branches_slug ON branches;
CREATE TRIGGER branches_slug BEFORE INSERT ON branches FOR EACH ROW EXECUTE FUNCTION bquee_branch_slug_trigger();

-- Existing branches, oldest first: a business's first branch gets its name, the others name-branch.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT b.id, b.salon_id, b.name,
           row_number() OVER (PARTITION BY b.salon_id ORDER BY b.created_at, b.id) AS pos
      FROM branches b
     WHERE b.slug IS NULL
     ORDER BY b.created_at, b.id
  LOOP
    UPDATE branches SET slug = bquee_branch_slug(r.salon_id, r.id, r.name, r.pos = 1) WHERE id = r.id;
  END LOOP;
END;
$$;
