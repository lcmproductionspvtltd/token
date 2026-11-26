'use strict';

/**
 * Authenticator-app codes (TOTP, RFC 6238: HMAC-SHA1, 30-second steps, 6 digits) – the standard
 * used by Google Authenticator, Microsoft Authenticator, 1Password and others. No packages.
 */

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  const clean = String(text)
    .toUpperCase()
    .replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits), in base32 as authenticator apps expect. */
const newSecret = () => base32Encode(crypto.randomBytes(20));

const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);

/** The 6-digit code for one time step. */
function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

/**
 * Checks a code, allowing one step of clock difference either way. Returns the matching step
 * (store it, so the same code can't be used twice) or 0 when wrong. `lastStep` = last one used.
 */
function verify(secret, code, lastStep = 0, now = Date.now()) {
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return 0;
  const current = stepAt(now);
  for (const step of [current - 1, current, current + 1]) {
    if (step <= lastStep) continue;
    const expected = codeAt(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return step;
  }
  return 0;
}

/** The otpauth:// link an authenticator app reads from the QR code. */
function setupUri(secret, account, issuer = 'BQuee') {
  const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(account);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

module.exports = { newSecret, codeAt, stepAt, verify, setupUri };
