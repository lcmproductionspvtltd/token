'use strict';

/**
 * Encrypts small secrets kept in the database (authenticator secrets) with AES-256-GCM, so a copy
 * of the database alone doesn't reveal them. The key comes from APP_SECRET (any long random text;
 * render.yaml generates one). Without APP_SECRET the values are stored readable, marked "p:", and
 * the server warns at start-up; they are encrypted the next time they are saved with a key set.
 */

const crypto = require('crypto');

const secret = process.env.APP_SECRET || '';
const key = secret
  ? crypto
      .createHash('sha256')
      .update('bquee-secret-box:' + secret)
      .digest()
  : null;

const hasKey = () => !!key;

function seal(plain) {
  if (!key) return 'p:' + plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return 'e:' + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

function open(stored) {
  const value = String(stored || '');
  if (value.startsWith('p:')) return value.slice(2);
  if (!value.startsWith('e:')) return '';
  if (!key) throw new Error('APP_SECRET is needed to read two-step sign-in secrets');
  const raw = Buffer.from(value.slice(2), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

module.exports = { seal, open, hasKey };
