'use strict';

/**
 * Builds the request handler: API routes under /api, everything else is the web app.
 */

const { Router } = require('./http/router');
const { HttpError } = require('./http/errors');
const crypto = require('crypto');
const { securityHeaders, RateLimiter, FloodGuard, clientIpOf } = require('./http/security');
const { createStaticHandler, UPLOAD_NAME, UPLOAD_HEADERS } = require('./http/static-files');
const { MIN_BYTES, pickEncoding, compressQuick } = require('./http/compress');
const { createSeo } = require('./http/seo');
const { createAuthService } = require('./services/auth');
const { createTokenService } = require('./services/tokens');
const { createCatalogService } = require('./services/catalog');
const { createUploadService } = require('./services/uploads');
const { createAccountRequestService } = require('./services/account-requests');

const MAX_BODY_BYTES = 4 * 1024 * 1024; // images arrive as base64 inside JSON; the largest (cover) is 2.5 MB

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        // Every API takes a JSON object; anything else (a list, a bare string…) is refused.
        if (!body || typeof body !== 'object' || Array.isArray(body)) return reject(new HttpError(400, 'Invalid JSON'));
        resolve(body);
      } catch (err) {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Answers that carry a sign-in token or two-step secrets are never compressed: compression next to
 * secrets can leak them to a patient attacker (the "BREACH" attack).
 */
const NEVER_COMPRESS = new Set([
  '/api/login',
  '/api/login/mfa',
  '/api/session/rotate',
  '/api/me/mfa',
  '/api/me/mfa/backup-codes',
  '/api/customer/login',
  '/api/customer/signup',
  '/api/customer/session/rotate',
  '/api/public/signup',
]);

const { createFx } = require('./services/fx');

function createApp({ db, config, log = console }) {
  const headers = securityHeaders({ https: !!config.https.certFile || config.production });
  const services = {
    db,
    auth: createAuthService(db, config),
    tokens: createTokenService(db),
    catalog: createCatalogService(db),
    uploads: createUploadService({ storage: config.uploadsStorage, uploadsDir: config.uploadsDir, db }),
    limiter: new RateLimiter(db, log),
    rates: createFx(db, { url: config.fxUrl, log }),
  };
  services.accountRequests = createAccountRequestService(services);

  const router = new Router();
  for (const register of [
    require('./routes/auth'),
    require('./routes/public'),
    require('./routes/staff'),
    require('./routes/owner'),
    require('./routes/admin'),
    require('./routes/admin-team'),
    require('./routes/admin-referrals'),
    require('./routes/admin-catalog'),
    require('./routes/reports'),
    require('./routes/site'),
    require('./routes/customer'),
    require('./routes/support'),
    require('./routes/account-requests'),
  ])
    register(router, services);

  const seo = createSeo({ db, config, headers, log });
  const serveStatic = createStaticHandler({
    publicDir: config.publicDir,
    uploadsDir: config.uploadsDir,
    headers,
    onMissing: (req, res) => seo.notFound(req, res),
  });

  // Per visitor address: at most API_REQUESTS_PER_MINUTE (default 600 = 10 a second) API requests.
  const flood = new FloodGuard({ perMinute: Number(process.env.API_REQUESTS_PER_MINUTE) || 600 });

  /**
   * Sends JSON. With `acceptEncoding`, answers of 1 KB or more are compressed (lists and reports
   * shrink 5–10 times on a phone's network).
   */
  function sendJson(res, status, data, extra = {}, acceptEncoding = null) {
    const out = {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    };
    let body = JSON.stringify(data);
    const enc = acceptEncoding && Buffer.byteLength(body) >= MIN_BYTES ? pickEncoding(acceptEncoding) : null;
    if (enc) {
      body = compressQuick(body, enc);
      out['Content-Encoding'] = enc;
      out.Vary = 'Accept-Encoding';
    }
    res.writeHead(status, out);
    res.end(body);
  }

  const clientIp = (req) => clientIpOf(req, config);

  /*
   * CSRF (audit section 4): a change made with the website's session cookie must come from this
   * site – the browser's Origin (or Referer) must be our own address, and the request must carry
   * the CSRF value from the readable cookie in the X-CSRF-Token header, which other sites can't read.
   * Apps send a Bearer token instead of cookies, so this doesn't apply to them.
   */
  function assertSameSite(req) {
    if (services.auth.credentialsOf(req).via !== 'cookie') return;
    const from = String(req.headers.origin || req.headers.referer || '');
    let host = '';
    try {
      host = new URL(from).host.toLowerCase();
    } catch (err) {
      // no or unreadable Origin/Referer
    }
    const ours = [String(req.headers.host || '').toLowerCase(), ...config.publicHosts];
    if (!host || !ours.includes(host) || !services.auth.csrfOk(req))
      throw new HttpError(403, 'This request did not come from the BQuee page. Please reload the page and try again.');
  }

  async function serveStoredImage(req, res, pathname) {
    try {
      const image = UPLOAD_NAME.test(pathname) ? await services.uploads.load(pathname) : null;
      if (!image) {
        res.writeHead(404, headers);
        return res.end('Not found');
      }
      res.writeHead(200, {
        ...headers,
        'Content-Type': image.type,
        'Content-Length': image.bytes.length,
        ...UPLOAD_HEADERS,
        'Cache-Control': 'public, max-age=31536000, immutable', // image names are unique
      });
      res.end(req.method === 'HEAD' ? undefined : image.bytes);
    } catch (err) {
      log.error('Image request failed:', err);
      res.writeHead(500, headers);
      res.end();
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
      if (pathname.startsWith('/uploads/') && services.uploads.servesFromDatabase)
        return serveStoredImage(req, res, pathname);
      if (await seo.handle(req, res, pathname)) return;
      return serveStatic(req, res, pathname);
    }

    // A request ID ties a reply to its log line (sent back as X-Request-Id).
    const asked = String(req.headers['x-request-id'] || '');
    const requestId = /^[\w-]{8,64}$/.test(asked) ? asked : crypto.randomBytes(8).toString('hex');
    res.setHeader('X-Request-Id', requestId);

    // No other website may call this API from a browser (no CORS headers are ever sent).
    if (req.method === 'OPTIONS') return sendJson(res, 403, { error: 'Cross-site requests are not allowed' });

    const ip = clientIp(req);
    const refused = flood.admit(ip);
    if (refused === 429)
      return sendJson(res, 429, { error: 'Too many requests. Please slow down.' }, { 'Retry-After': '60' });
    if (refused === 503)
      return sendJson(
        res,
        503,
        { error: 'The server is busy – please try again in a moment.' },
        { 'Retry-After': '5' },
      );
    res.once('close', () => flood.done());

    // One structured log line per API request (audit 4.6): the route pattern (never ids or tokens from the
    // address), status, time and who – never bodies, headers, cookies, passwords or codes.
    if (config.logRequests) {
      const started = process.hrtime.bigint();
      res.once('finish', () => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        let m = null;
        try {
          m = router.match(req.method, pathname);
        } catch (err) {
          // a broken address (already answered 400)
        }
        const line = {
          t: new Date().toISOString(),
          id: requestId,
          method: req.method,
          route: m ? m.pattern : 'unknown',
          status: res.statusCode,
          ms: Math.round(ms),
          ...(req.actor ? { actor: req.actor } : {}),
        };
        // Worth an alert: server errors and refused sign-ins in bulk show up by these fields.
        if (res.statusCode >= 500) line.alert = 'server_error';
        else if (res.statusCode === 429) line.alert = 'rate_limited';
        log.log(JSON.stringify(line));
      });
    }

    try {
      if (req.method !== 'GET' && req.method !== 'HEAD' && pathname !== '/api/csp-report') assertSameSite(req);
      const match = router.match(req.method, pathname);
      if (!match) throw new HttpError(404, 'Not found');
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJsonBody(req);
      const result = await match.handler({
        req,
        params: match.params,
        query: Object.fromEntries(url.searchParams),
        body,
        ip,
        res,
      });
      const accept = NEVER_COMPRESS.has(pathname) ? null : req.headers['accept-encoding'];
      sendJson(res, 200, result === undefined ? { ok: true } : result, {}, accept);
    } catch (err) {
      if (err instanceof HttpError)
        return sendJson(
          res,
          err.status,
          { error: err.message },
          err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {},
        );
      if (err.status === 503) return sendJson(res, 503, { error: err.message }, { 'Retry-After': '5' });
      if (err.code === '23505') return sendJson(res, 400, { error: 'That value is already in use' });
      if (err.code === '22P02' || err.code === '22007' || err.code === '22008')
        return sendJson(res, 400, { error: 'Invalid value' });
      // Logged with the request ID; never the body (it can hold passwords) or the session token.
      log.error(`[${requestId}] ${req.method} ${pathname} failed:`, err);
      sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  }

  return { handle, services };
}

module.exports = { createApp };
