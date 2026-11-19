-- Rate limits shared by every server (audit F-03): one row per bucket + key (e.g. "login|1.2.3.4").
-- Counts for the current and the previous time window give a sliding-window estimate.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          text PRIMARY KEY CHECK (length(key) <= 300),
  window_start bigint NOT NULL,             -- start of the current window, ms since 1970
  hits         integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  prev_hits    integer NOT NULL DEFAULT 0 CHECK (prev_hits >= 0),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expires_idx ON rate_limits (expires_at);
