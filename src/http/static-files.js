'use strict';

/**
 * Serves the web app (public/) and uploaded images (storage/uploads).
 * Files are cached in memory with gzip + ETag. Unknown paths return index.html
 * so the single-page app can handle its own routes (/login, /owner, /b/:id …).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MIN_BYTES, pickEncoding, brotliBest } = require('./compress');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);

/** Upload file names are always <random id>.png|jpg|webp. */
const UPLOAD_NAME = /^\/uploads\/[A-Za-z0-9_-]{6,40}\.(png|jpg|webp)$/;

/** An uploaded file can never run as a page or script, even if it were opened directly. */
const UPLOAD_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox",
  'Content-Disposition': 'inline',
  'X-Content-Type-Options': 'nosniff',
};

// Memory kept for files: one entry per file (an updated file replaces its old entry) and at most
// this many bytes in total – the oldest entries go first (audit F-08).
const CACHE_LIMIT_BYTES = 48 * 1024 * 1024;

function createStaticHandler({ publicDir, uploadsDir, headers, onMissing = null }) {
  const cache = new Map(); // file → entry, oldest first
  let cachedBytes = 0;
  const realRoots = new Map();
  const realRoot = (root) => {
    if (!realRoots.has(root)) {
      try {
        realRoots.set(root, fs.realpathSync(root));
      } catch (e) {
        realRoots.set(root, root);
      }
    }
    return realRoots.get(root);
  };

  function resolveFile(root, urlPath) {
    let file;
    try {
      file = path.normalize(path.join(root, decodeURIComponent(urlPath)));
    } catch (e) {
      return null; // broken %-encoding
    }
    if (!file.startsWith(root + path.sep)) return null; // path traversal ("../")
    try {
      // Follow links to their real place: a link inside the folder must not lead outside it.
      const real = fs.realpathSync(file);
      if (!real.startsWith(realRoot(root) + path.sep)) return null;
      return fs.statSync(real).isFile() ? real : null;
    } catch (e) {
      return null;
    }
  }

  function remember(file, entry) {
    const old = cache.get(file);
    if (old) {
      cache.delete(file);
      cachedBytes -= old.size;
    }
    cache.set(file, entry);
    cachedBytes += entry.size;
    for (const [key, e] of cache) {
      if (cachedBytes <= CACHE_LIMIT_BYTES) break;
      cache.delete(key);
      cachedBytes -= e.size;
    }
  }

  function load(file) {
    const stat = fs.statSync(file);
    let entry = cache.get(file);
    if (!entry || entry.mtimeMs !== stat.mtimeMs) {
      const ext = path.extname(file).toLowerCase();
      const raw = fs.readFileSync(file);
      const compressible = COMPRESSIBLE.has(ext) && raw.length >= MIN_BYTES;
      const gzip = compressible ? zlib.gzipSync(raw) : null;
      entry = {
        raw,
        gzip,
        br: null, // filled in the background; gzip is sent until it is ready
        mtimeMs: stat.mtimeMs,
        size: raw.length + (gzip ? gzip.length : 0),
        type: MIME_TYPES[ext] || 'application/octet-stream',
        etag: '"' + stat.size.toString(36) + '-' + Math.floor(stat.mtimeMs).toString(36) + '"',
      };
      if (raw.length < 2_000_000) remember(file, entry);
      if (compressible) {
        const ready = entry;
        brotliBest(raw)
          .then((br) => {
            ready.br = br;
            if (cache.get(file) === ready) {
              ready.size += br.length;
              cachedBytes += br.length;
            }
          })
          .catch(() => {}); // gzip keeps working
      }
    }
    return entry;
  }

  /** For monitoring and tests: how many files and bytes are held in memory. */
  serve.cacheStats = () => ({ files: cache.size, bytes: cachedBytes, limit: CACHE_LIMIT_BYTES });

  return serve;

  function serve(req, res, pathname) {
    let file;
    let cacheControl = 'no-cache';
    if (pathname.startsWith('/uploads/')) {
      // Only pictures are ever served from uploads.
      file = UPLOAD_NAME.test(pathname) ? resolveFile(uploadsDir, pathname.slice('/uploads'.length)) : null;
      cacheControl = 'public, max-age=31536000, immutable'; // upload names are unique
      if (!file) {
        res.writeHead(404, headers);
        return res.end('Not found');
      }
    } else {
      file = resolveFile(publicDir, pathname);
      // Not a file: the app's own "not found" page (with a real 404 for search engines), if given.
      if (!file && onMissing) return onMissing(req, res, pathname);
      if (!file) file = path.join(publicDir, 'index.html');
    }

    const entry = load(file);
    const out = { ...headers, 'Content-Type': entry.type, 'Cache-Control': cacheControl, ETag: entry.etag };
    if (pathname.startsWith('/uploads/')) Object.assign(out, UPLOAD_HEADERS);
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, out);
      return res.end();
    }

    let body = entry.raw;
    if (entry.gzip) {
      out.Vary = 'Accept-Encoding';
      const accept = req.headers['accept-encoding'];
      const enc = pickEncoding(accept);
      if (enc === 'br' && entry.br) [body, out['Content-Encoding']] = [entry.br, 'br'];
      else if (enc && /\bgzip\b/.test(String(accept))) [body, out['Content-Encoding']] = [entry.gzip, 'gzip'];
    }
    res.writeHead(200, out);
    res.end(req.method === 'HEAD' ? undefined : body);
  }
}

module.exports = { createStaticHandler, UPLOAD_NAME, UPLOAD_HEADERS };
