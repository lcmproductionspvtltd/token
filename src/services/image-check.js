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

// Text that has no business inside a photo. Found anywhere → refused.
const FORBIDDEN = [
  '<script',
  '<?php',
  '<%',
  '<html',
  '<body',
  '<iframe',
  '<svg',
  '<object',
  '<embed',
  'javascript:',
  'onerror=',
  'onload=',
  '#!/',
];

function fail(reason) {
  throw new Error(reason);
}

function checkSize(width, height) {
  if (!width || !height) fail('The image has no size');
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) fail('The image is too big in pixels');
  return { width, height };
}

/** PNG: 8-byte signature, IHDR first, every chunk inside the file, IEND last with nothing after it. */
function inspectPng(b) {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 45 || !SIG.every((x, i) => b[i] === x)) return null;
  if (b.toString('latin1', 12, 16) !== 'IHDR') fail('Broken PNG file');
  const size = checkSize(b.readUInt32BE(16), b.readUInt32BE(20));
  let at = 8;
  for (;;) {
    if (at + 12 > b.length) fail('Broken PNG file');
    const len = b.readUInt32BE(at);
    const type = b.toString('latin1', at + 4, at + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) fail('Broken PNG file');
    at += 12 + len;
    if (at > b.length) fail('Broken PNG file');
    if (type === 'IEND') break;
  }
  if (at !== b.length) fail('The PNG has extra data hidden after the image');
  return { ext: '.png', mime: 'image/png', ...size };
}

/** JPEG: starts FFD8, valid marker segments up to the image data, ends FFD9 with nothing after it. */
function inspectJpeg(b) {
  if (b.length < 125 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let at = 2;
  let size = null;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) fail('Broken JPG file');
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1; // padding
      continue;
    }
    if (marker === 0xd9) fail('Broken JPG file');
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    const len = b.readUInt16BE(at + 2);
    if (len < 2 || at + 2 + len > b.length) fail('Broken JPG file');
    // SOF0–SOF15 (not DHT C4, JPG C8, DAC CC) carry the picture size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      size = checkSize(b.readUInt16BE(at + 7), b.readUInt16BE(at + 5));
    if (marker === 0xda) break; // start of the picture data
    at += 2 + len;
  }
  if (!size) fail('Broken JPG file');
  // The picture data must end with FFD9 at the very end (a few trailing zero bytes are tolerated).
  let end = b.length;
  while (end > 2 && b[end - 1] === 0x00 && b.length - end < 16) end -= 1;
  if (b[end - 2] !== 0xff || b[end - 1] !== 0xd9) fail('The JPG has extra data hidden after the image');
  return { ext: '.jpg', mime: 'image/jpeg', ...size };
}

/** WEBP: RIFF size matches the file, and the first chunk is VP8, VP8L or VP8X. */
function inspectWebp(b) {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  if (b.readUInt32LE(4) + 8 !== b.length) fail('The WEBP has extra data hidden after the image');
  const chunk = b.toString('latin1', 12, 16);
  let size;
  if (chunk === 'VP8X') size = checkSize(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
  else if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    size = checkSize((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  } else if (chunk === 'VP8 ') size = checkSize(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
  else fail('Broken WEBP file');
  return { ext: '.webp', mime: 'image/webp', ...size };
}

function inspectImage(bytes) {
  const info = inspectPng(bytes) || inspectJpeg(bytes) || inspectWebp(bytes);
  if (!info) fail('Only real PNG, JPG or WEBP images are allowed');
  const text = bytes.toString('latin1').toLowerCase();
  if (FORBIDDEN.some((s) => text.includes(s))) fail('The image contains code and was refused');
  return info;
}

module.exports = { inspectImage };
