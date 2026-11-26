'use strict';

/**
 * Checks that uploaded bytes are a real, well-formed PNG, JPEG or WEBP image – not a script,
 * web page, SVG or a "polyglot" (an image with another file hidden inside or after it).
 *
 *   inspectImage(bytes) → { ext, mime, width, height }   or throws Error(reason)
 *
 * Every check reads the file's own structure; nothing trusts the file name or the declared type.
 */

const MAX_SIDE = 8000; // pixels; stops "decompression bomb" images
const MAX_PIXELS = 40_000_000;

// Text that has no business in a picture's text parts (comments, EXIF, XMP, PNG text chunks).
// Only those parts are searched: the compressed picture data itself is random-looking bytes, where short
// sequences such as "<%" turn up by chance in ordinary photos, and it is never run (uploads are served as
// images with nosniff and a sandbox, and data after the picture's end is refused anyway).
const FORBIDDEN = [
  '<script',
  '<?php',
  '<html',
  '<body',
  '<iframe',
  '<svg',
  '<object',
  '<embed',
  'javascript:',
  'onerror=',
  'onload=',
];

const BROKEN = (kind) =>
  `This ${kind} file is damaged or incomplete and can’t be read. Open it, save it again (or take a screenshot of it) and try again.`;

function fail(reason) {
  throw new Error(reason);
}

function checkSize(width, height) {
  if (!width || !height)
    fail('This picture has no width or height, so it can’t be shown. Save it again as JPG or PNG and try again.');
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS)
    fail(
      `This picture is too large in pixels (the limit is ${MAX_SIDE} × ${MAX_SIDE}). Make it smaller or crop it, then try again.`,
    );
  return { width, height };
}

// Chunks holding compressed pixels (or compressed colour profiles): random-looking bytes, not searched.
const PNG_PIXELS = new Set(['IDAT', 'fdAT', 'iCCP']);

/** PNG: 8-byte signature, IHDR first, every chunk inside the file, IEND last with nothing after it. */
function inspectPng(b) {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 45 || !SIG.every((x, i) => b[i] === x)) return null;
  if (b.toString('latin1', 12, 16) !== 'IHDR') fail(BROKEN('PNG'));
  const size = checkSize(b.readUInt32BE(16), b.readUInt32BE(20));
  const meta = [];
  let at = 8;
  for (;;) {
    if (at + 12 > b.length) fail(BROKEN('PNG'));
    const len = b.readUInt32BE(at);
    const type = b.toString('latin1', at + 4, at + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) fail(BROKEN('PNG'));
    if (at + 12 + len > b.length) fail(BROKEN('PNG'));
    if (!PNG_PIXELS.has(type)) meta.push(b.subarray(at + 8, at + 8 + len));
    at += 12 + len;
    if (type === 'IEND') break;
  }
  if (at !== b.length)
    fail(
      'This PNG has extra hidden data after the picture and was refused for safety. Save it again as a new PNG or JPG and try again.',
    );
  return { ext: '.png', mime: 'image/png', ...size, meta };
}

/** JPEG: starts FFD8, valid marker segments up to the image data, ends FFD9 with nothing after it. */
function inspectJpeg(b) {
  if (b.length < 125 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let at = 2;
  let size = null;
  const meta = [];
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) fail(BROKEN('JPG'));
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1; // padding
      continue;
    }
    if (marker === 0xd9) fail(BROKEN('JPG'));
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    const len = b.readUInt16BE(at + 2);
    if (len < 2 || at + 2 + len > b.length) fail(BROKEN('JPG'));
    // SOF0–SOF15 (not DHT C4, JPG C8, DAC CC) carry the picture size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      size = checkSize(b.readUInt16BE(at + 7), b.readUInt16BE(at + 5));
    if (marker === 0xda) break; // start of the picture data
    // Comments (FE) and APPn text (EXIF, XMP). ICC colour profiles (APP2) are binary and skipped.
    const body = b.subarray(at + 4, at + 2 + len);
    if (marker === 0xfe || (marker >= 0xe0 && marker <= 0xef && !body.toString('latin1', 0, 11).startsWith('ICC_PROFILE')))
      meta.push(body);
    at += 2 + len;
  }
  if (!size) fail(BROKEN('JPG'));
  // The picture data must end with FFD9 at the very end (a few trailing zero bytes are tolerated).
  let end = b.length;
  while (end > 2 && b[end - 1] === 0x00 && b.length - end < 16) end -= 1;
  if (b[end - 2] !== 0xff || b[end - 1] !== 0xd9)
    fail(
      'This JPG has extra hidden data after the picture and was refused for safety. Save it again as a new JPG or PNG and try again.',
    );
  return { ext: '.jpg', mime: 'image/jpeg', ...size, meta };
}

/** WEBP: RIFF size matches the file, and the first chunk is VP8, VP8L or VP8X. */
function inspectWebp(b) {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  if (b.readUInt32LE(4) + 8 !== b.length)
    fail(
      'This WEBP has extra hidden data after the picture and was refused for safety. Save it again as a JPG or PNG and try again.',
    );
  const chunk = b.toString('latin1', 12, 16);
  let size;
  if (chunk === 'VP8X') size = checkSize(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
  else if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    size = checkSize((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  } else if (chunk === 'VP8 ') size = checkSize(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
  else fail(BROKEN('WEBP'));
  // Text chunks (EXIF, XMP) are searched; picture chunks are not.
  const meta = [];
  for (let at = 12; at + 8 <= b.length; ) {
    const type = b.toString('latin1', at, at + 4);
    const len = b.readUInt32LE(at + 4);
    if (at + 8 + len > b.length) fail(BROKEN('WEBP'));
    if (type === 'EXIF' || type === 'XMP ') meta.push(b.subarray(at + 8, at + 8 + len));
    at += 8 + len + (len % 2);
  }
  return { ext: '.webp', mime: 'image/webp', ...size, meta };
}

function inspectImage(bytes) {
  const info = inspectPng(bytes) || inspectJpeg(bytes) || inspectWebp(bytes);
  if (!info)
    fail(
      'This file isn’t a real PNG, JPG or WEBP picture (it may be renamed or a different file type). Choose a photo or picture file and try again.',
    );
  const { meta, ...picture } = info;
  const text = Buffer.concat(meta).toString('latin1').toLowerCase();
  if (FORBIDDEN.some((s) => text.includes(s)))
    fail('This picture contains hidden code and was refused for safety. Use a different picture.');
  return picture;
}

module.exports = { inspectImage };
