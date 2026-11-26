'use strict';

/** Reading and writing cookies (no package). */

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (!(name in out)) out[name] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Builds one Set-Cookie value. */
function cookie(name, value, { maxAge, httpOnly = true, secure = false, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Adds Set-Cookie headers to a response that hasn't been sent yet. */
function addCookies(res, list) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev ? [].concat(prev) : []), ...list]);
}

module.exports = { parseCookies, cookie, addCookies };
