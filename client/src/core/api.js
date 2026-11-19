/*
 * Signed-in session and the JSON API client.
 *
 * The session itself is an HttpOnly cookie set by the server – page scripts can't read it, so an
 * injected script couldn't steal it (audit F-04). Only the signed-in person's public details
 * (name, role…) are kept here, to draw the pages. Every change sends the CSRF value from the
 * readable bq_csrf cookie in a header, which proves the request comes from this site.
 */

const STORAGE_KEY = 'sq_user';
const OLD_KEY = 'sq_session'; // before cookie sessions: held the token – removed on first load

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // private mode – the value only lasts until reload
  }
}

try {
  localStorage.removeItem(OLD_KEY);
} catch (err) {
  // no storage
}
let session = readStored(STORAGE_KEY, null); // { user }

export const getSession = () => session;
export const currentUser = () => (session && session.user) || null;

/** Keeps the signed-in person's public details ({ user }); null when signed out. Never a token. */
export function setSession(value) {
  session = value && value.user ? { user: value.user } : null;
  writeStored(STORAGE_KEY, session);
  if (!session) clearSavedPages();
}

/** Signed out: forget pages and images the browser saved for offline use (audit F-11). */
function clearSavedPages() {
  try {
    if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  } catch (err) {
    // not available
  }
}

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)(?:__Host-)?bq_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/** Calls the JSON API. Throws an Error with `.status` for non-2xx responses. */
export async function api(method, url, body) {
  const headers = { 'Content-Type': 'application/json', 'X-BQuee-Client': 'web' };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken();

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error('No connection. Check your internet and try again.');
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && session && !url.startsWith('/api/login')) setSession(null);
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const homeFor = (user) =>
  !user
    ? '/login'
    : user.role === 'superadmin' || user.role === 'platform_staff'
      ? '/admin'
      : user.role === 'owner'
        ? '/owner'
        : '/staff';

/** Platform permission check (the super admin can do everything). */
export const can = (user, permission) =>
  !!user &&
  (user.role === 'superadmin' ||
    (user.permissions || []).includes('*') ||
    (user.permissions || []).includes(permission));

/* Tokens booked on this device (shown as "Your tokens today"). */

export const myTokens = () => readStored('sq_my', []);

export function rememberToken(entry) {
  const list = myTokens().filter((t) => t.id !== entry.id);
  list.unshift(entry);
  writeStored('sq_my', list.slice(0, 10));
}

export const savedCustomer = () => readStored('sq_cust', {});
export const saveCustomer = (value) => writeStored('sq_cust', value);
export { readStored };
