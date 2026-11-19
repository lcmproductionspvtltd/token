'use strict';

const { tooManyRequests } = require('./errors');

/**
 * Security headers sent with every response.
 *   https: true when the visitor reaches the site over HTTPS (own certificate, or production behind
 *   a proxy such as Render) – then browsers are told to always use HTTPS (HSTS).
 */
function securityHeaders({ https }) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY', // never shown inside another page (clickjacking)
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Browsers report anything this policy blocks (e.g. an injected script) – see /api/csp-report.
      'report-uri /api/csp-report',
    ].join('; '),
  };
  if (https) headers['Strict-Transport-Security'] = 'max-age=31536000';
  return headers;
}

const keyOf = (bucket, key) => (bucket + '|' + String(key || '-')).slice(0, 300);
/** This window's hits plus the part of the previous window that still overlaps the last windowMs. */
const slide = (hits, prev, now, start, windowMs) => hits + prev * (1 - (now - start) / windowMs);

class RateLimiter {
  constructor(db, log = console) {
    this.db = db;
    this.log = log;
  }

  async check(bucket, key, max, windowMs) {
    const now = Date.now();
    const used = await this.add(bucket, key, windowMs, now);
    if (used > max) throw this.limitError(now, windowMs);
  }

  /**
   * Counts only failures: refuses once `max` failed tries happened in the window, otherwise runs
   * `work()`; a 401 from it (wrong password) counts as one failure. Used per account, so people who
   * sign in successfully many times are never blocked.
   */
  async attempt(bucket, key, max, windowMs, work) {
    const now = Date.now();
    if ((await this.used(bucket, key, windowMs, now)) >= max) throw this.limitError(now, windowMs);
    try {
      return await work();
    } catch (err) {
      if (err.status === 401) await this.add(bucket, key, windowMs, now);
      throw err;
    }
  }

  limitError(now, windowMs) {
    const start = Math.floor(now / windowMs) * windowMs;
    const err = tooManyRequests();
    err.retryAfter = Math.max(1, Math.ceil((start + windowMs - now) / 1000));
    return err;
  }

  /** Adds one hit and returns the sliding-window count. */
  async add(bucket, key, windowMs, now) {
    const id = keyOf(bucket, key);
    const start = Math.floor(now / windowMs) * windowMs;
    try {
      const {
        rows: [row],
      } = await this.db.query(
        `INSERT INTO rate_limits (key, window_start, hits, prev_hits, expires_at)
         VALUES ($1, $2, 1, 0, to_timestamp($3 / 1000.0))
         ON CONFLICT (key) DO UPDATE SET
           prev_hits = CASE WHEN rate_limits.window_start = $2 THEN rate_limits.prev_hits
                            WHEN rate_limits.window_start = $2 - $4 THEN rate_limits.hits ELSE 0 END,
           hits = CASE WHEN rate_limits.window_start = $2 THEN rate_limits.hits + 1 ELSE 1 END,
           window_start = $2,
           expires_at = to_timestamp($3 / 1000.0)
         RETURNING hits, prev_hits`,
        [id, start, start + 2 * windowMs, windowMs],
      );
      return slide(row.hits, row.prev_hits, now, start, windowMs);
    } catch (err) {
      this.log.error('Rate limit check failed:', err.message);
      return 0;
    }
  }

  /** The sliding-window count without adding a hit. */
  async used(bucket, key, windowMs, now) {
    const start = Math.floor(now / windowMs) * windowMs;
    try {
      const {
        rows: [row],
      } = await this.db.query('SELECT window_start, hits, prev_hits FROM rate_limits WHERE key = $1', [
        keyOf(bucket, key),
      ]);
      if (!row) return 0;
      const ws = Number(row.window_start);
      if (ws === start) return slide(row.hits, row.prev_hits, now, start, windowMs);
      if (ws === start - windowMs) return slide(0, row.hits, now, start, windowMs);
      return 0;
    } catch (err) {
      this.log.error('Rate limit check failed:', err.message);
      return 0;
    }
  }

  /** Forgets one key early (e.g. after a successful sign-in). */
  async reset(bucket, key) {
    await this.db.query('DELETE FROM rate_limits WHERE key = $1', [keyOf(bucket, key)]).catch(() => {});
  }

  /** Removes expired counts (run by the scheduled clean-up). */
  purge() {
    return this.db.query('DELETE FROM rate_limits WHERE expires_at < now()');
  }
}

/**
 * First line of defence against floods from one address, kept in this server's memory because it
 * runs on every request (a database write each time would itself be a load problem). The shared
 * limits above protect sign-in, sign-up, booking and the other sensitive actions; a CDN/WAF in
 * front of the site handles large attacks (see docs/OPERATIONS.md).
 */
class FloodGuard {
  constructor({ perMinute = 600, maxInFlight = 200 } = {}) {
    this.perMinute = perMinute;
    this.maxInFlight = maxInFlight;
    this.inFlight = 0;
    this.hits = new Map();
    setInterval(() => this.hits.clear(), 60_000).unref();
  }

  /** null when the request may go ahead, otherwise the status to answer with (429 or 503). */
  admit(ip) {
    const n = (this.hits.get(ip) || 0) + 1;
    this.hits.set(ip, n);
    if (n > this.perMinute) return 429;
    if (this.inFlight >= this.maxInFlight) return 503;
    this.inFlight++;
    return null;
  }

  done() {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }
}

/**
 * Plain-HTTP visits are sent to HTTPS on the site's own address. The visitor's Host header is not trusted
 * (audit F-10): an unknown name goes to the first configured address, never to the name that was sent.
 */
function httpsRedirect(config) {
  const known = config.publicHosts.map((h) => h.replace(/:\d+$/, ''));
  const port = config.port === 443 ? '' : `:${config.port}`;
  return (req, res) => {
    const asked = String(req.headers.host || '')
      .toLowerCase()
      .replace(/:\d+$/, '');
    const host = known.includes(asked) ? asked : known[0] || 'localhost';
    const url = String(req.url || '/');
    const path = url.startsWith('/') && !url.startsWith('//') ? url : '/';
    res.writeHead(301, { Location: `https://${host}${port}${path}` });
    res.end();
  };
}

module.exports = { securityHeaders, RateLimiter, FloodGuard, httpsRedirect };
