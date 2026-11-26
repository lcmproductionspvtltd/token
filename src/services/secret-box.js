'use strict';

/**
 * Encrypts small secrets kept in the database (authenticator secrets) with AES-256-GCM, so a copy
 * of the database alone doesn't reveal them. The key comes from APP_SECRET.
 *
 *   Production (NODE_ENV=production): APP_SECRET is required – at least 32 characters of random text
 *   (see .env.example). The server refuses to start without it, and nothing is ever stored
 *   unencrypted (audit 2.2).
 *   Development: without APP_SECRET values are stored readable, marked "p:"; they are encrypted at
 *   the next start with a key (upgradeSecrets in services/auth.js).
 *
 * Changing the key: set the new APP_SECRET and put the old one in APP_SECRET_PREVIOUS for one deploy.
 * At start-up every secret is re-encrypted with the new key; then APP_SECRET_PREVIOUS can be removed.
 */

const crypto = require('crypto');

const MIN_LENGTH = 32;
const PLACEHOLDERS = /^(change[-_ ]?me|changeme|secret|password|app[-_]?secret|x+|0+|1234.*)$/i;

const deriveKey = (secret) =>
  secret
    ? crypto
        .createHash('sha256')
        .update('bquee-secret-box:' + secret)
        .digest()
    : null;

const production = () => process.env.NODE_ENV === 'production';
const key = deriveKey(process.env.APP_SECRET || '');
const previousKey = deriveKey(process.env.APP_SECRET_PREVIOUS || '');

const hasKey = () => !!key;

/** Why the configured APP_SECRET can't be used, or '' when it's fine. */
function secretProblem(value = process.env.APP_SECRET || '') {
  if (!value) return 'APP_SECRET is not set.';
  if (value.length < MIN_LENGTH)
    return `APP_SECRET is too short (${value.length} characters; use at least ${MIN_LENGTH}).`;
  if (PLACEHOLDERS.test(value) || new Set(value).size < 10)
    return 'APP_SECRET looks like a placeholder – use long random text from a password manager.';
  return '';
}

function sealWith(k, plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return 'e:' + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

function seal(plain) {
  if (key) return sealWith(key, plain);
  if (production()) throw new Error('APP_SECRET is required to store two-step sign-in secrets');
  return 'p:' + plain; // development only
}

function openWith(k, value) {
  const raw = Buffer.from(value.slice(2), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

function open(stored) {
  const value = String(stored || '');
  if (value.startsWith('p:')) return value.slice(2);
  if (!value.startsWith('e:')) return '';
  if (!key) throw new Error('APP_SECRET is needed to read two-step sign-in secrets');
  try {
    return openWith(key, value);
  } catch (err) {
    if (previousKey) return openWith(previousKey, value);
    throw err;
  }
}

/** True when a stored value should be re-saved: unencrypted, or encrypted with the previous key. */
function needsUpgrade(stored) {
  const value = String(stored || '');
  if (!key) return false;
  if (value.startsWith('p:')) return true;
  if (!value.startsWith('e:')) return false;
  try {
    openWith(key, value);
    return false;
  } catch (err) {
    return !!previousKey;
  }
}

module.exports = { seal, open, hasKey, secretProblem, needsUpgrade, MIN_LENGTH };
