-- Social media, website and map links that salon owners manage in their dashboard.
ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS facebook  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS youtube   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS x_handle  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS map_url   text NOT NULL DEFAULT '';
