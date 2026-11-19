-- Uploaded images kept in the database (UPLOADS_STORAGE=database).
-- Used on hosts whose disk is wiped on restart, such as free cloud plans.
CREATE TABLE images (
  name        text PRIMARY KEY,
  mime_type   text NOT NULL,
  data_base64 text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
