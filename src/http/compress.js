'use strict';

/**
 * Smaller answers for phones on slow networks. The browser or app says what it can unpack
 * (Accept-Encoding); we send brotli ("br", about 16% smaller than gzip) or gzip, or nothing.
 * Dart's HttpClient (the apps) takes gzip; browsers take both.
 */

const zlib = require('zlib');

/** Smaller than this, compressing costs more than it saves. */
const MIN_BYTES = 1024;

/** 'br', 'gzip' or null, from an Accept-Encoding header. */
function pickEncoding(acceptEncoding) {
  const accept = String(acceptEncoding || '');
  if (/\bbr\b/.test(accept)) return 'br';
  if (/\bgzip\b/.test(accept)) return 'gzip';
  return null;
}

/** Fast settings for answers made on every request (API JSON). */
function compressQuick(data, encoding) {
  if (encoding === 'br') return zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });
  return zlib.gzipSync(data, { level: 6 });
}

/** Strongest brotli, done in the background (for website files that are compressed once and kept). */
function brotliBest(data) {
  return new Promise((resolve, reject) =>
    zlib.brotliCompress(
      data,
      {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length,
        },
      },
      (err, out) => (err ? reject(err) : resolve(out)),
    ),
  );
}

module.exports = { MIN_BYTES, pickEncoding, compressQuick, brotliBest };
