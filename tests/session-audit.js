/**
 * Sign-in security: two-step sign-in (authenticator codes, backup codes, resets), the website's
 * cookie sessions with CSRF protection, password rules, session lengths and a few request rules.
 * Started by tests/run.js (server with APP_SECRET set, so authenticator secrets are encrypted).
 */

const { createPool } = require('../src/db/postgres');
const totp = require('../src/services/totp');
const { login: signIn, post, accounts } = require('./helpers/session');

const BASE = process.env.BASE;
const DB = process.env.TEST_DATABASE_URL;
let passed = 0;
const failures = [];
const check = (label, cond, extra = '') => (cond ? passed++ : failures.push(label + (extra ? ' – ' + extra : '')));

async function req(method, url, { body, token, headers = {} } = {}) {
  const r = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: r.status, headers: r.headers, data: await r.json().catch(() => ({})) };
}
const codeFor = (secret, offset = 0) => totp.codeAt(secret, totp.stepAt() + offset);
const cookiesOf = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []);

(async () => {
  const db = createPool({ connectionString: DB, max: 2 });
  const sa = await signIn(BASE, 'admin', 'Admin@12345-bq');
  await req('POST', '/api/admin/salons', {
    token: sa,
    body: { name: 'Sess Shop', username: 'sessown', password: 'Sess-Owner-2026', ownerEmail: 'sess@shop.test' },
  });
  const ownToken0 = await signIn(BASE, 'sessown', 'Sess-Owner-2026'); // sets up two-step sign-in
  const own0 = await req('GET', '/api/owner/data', { token: ownToken0 });
  const branchId = own0.data.branches[0].id;
  await req('POST', '/api/owner/staff', {
    token: ownToken0,
    body: { name: 'Sess Staff', branchId, serviceIds: [], username: 'sessstaff', password: 'Sess-Staff-2026' },
  });

  /* ---------- two-step sign-in ---------- */
  const first = await post(BASE, '/api/login', { login: 'sessown', password: 'Sess-Owner-2026' });
  check(
    'owner with two-step set up must enter a code',
    first.data.mfa && first.data.mfa.step === 'verify' && !first.data.token && !first.data.mfa.secret,
  );
  let wrong = null;
  for (let i = 0; i < 5; i++)
    wrong = await post(BASE, '/api/login/mfa', { challenge: first.data.mfa.challenge, code: '000000' });
  check('wrong codes refused (401)', wrong.status === 401);
  const afterMax = await post(BASE, '/api/login/mfa', {
    challenge: first.data.mfa.challenge,
    code: codeFor(accounts.get('sessown').secret, 1),
  });
  check('after 5 wrong codes the step is cancelled – even the right code needs a new sign-in', afterMax.status === 401);
  check(
    'unknown sign-in step refused',
    (await post(BASE, '/api/login/mfa', { challenge: 'x'.repeat(48), code: '123456' })).status === 401,
  );

  const second = await post(BASE, '/api/login', { login: 'sessown', password: 'Sess-Owner-2026' });
  const secret = accounts.get('sessown').secret;
  const step = Math.max(totp.stepAt(), accounts.get('sessown').lastStep + 1);
  const goodCode = totp.codeAt(secret, step);
  const ok1 = await post(BASE, '/api/login/mfa', { challenge: second.data.mfa.challenge, code: goodCode });
  check('right code signs in', ok1.status === 200 && ok1.data.token);
  accounts.get('sessown').lastStep = step;
  const third = await post(BASE, '/api/login', { login: 'sessown', password: 'Sess-Owner-2026' });
  const replay = await post(BASE, '/api/login/mfa', { challenge: third.data.mfa.challenge, code: goodCode });
  check('the same code can’t be used twice (replay)', replay.status === 401);

  const backup = accounts.get('sessown').backupCodes;
  check('10 backup codes were given at setup', backup && backup.length === 10);
  const viaBackup = await post(BASE, '/api/login/mfa', {
    challenge: third.data.mfa.challenge,
    code: backup[0].toUpperCase(),
  });
  check('a backup code signs in (any letter case)', viaBackup.status === 200 && viaBackup.data.token);
  const fourth = await post(BASE, '/api/login', { login: 'sessown', password: 'Sess-Owner-2026' });
  check(
    'a backup code works only once',
    (await post(BASE, '/api/login/mfa', { challenge: fourth.data.mfa.challenge, code: backup[0] })).status === 401,
  );
  const status = await req('GET', '/api/me/mfa', { token: viaBackup.data.token });
  check(
    'profile shows 9 backup codes left',
    status.data.enabled === true && status.data.backupCodesLeft === 9,
    JSON.stringify(status.data),
  );

  const renewBad = await req('POST', '/api/me/mfa/backup-codes', {
    token: viaBackup.data.token,
    body: { code: '123456' },
  });
  check('new backup codes need a current code', renewBad.status === 400);
  const renewStep = Math.max(totp.stepAt(), accounts.get('sessown').lastStep + 1);
  const renew = await req('POST', '/api/me/mfa/backup-codes', {
    token: viaBackup.data.token,
    body: { code: totp.codeAt(secret, renewStep) },
  });
  accounts.get('sessown').lastStep = renewStep;
  check('new backup codes replace the old ones', renew.status === 200 && renew.data.backupCodes.length === 10);
  const fifth = await post(BASE, '/api/login', { login: 'sessown', password: 'Sess-Owner-2026' });
  check(
    'old backup codes stop working',
    (await post(BASE, '/api/login/mfa', { challenge: fifth.data.mfa.challenge, code: backup[1] })).status === 401,
  );

  const staff = await post(BASE, '/api/login', { login: 'sessstaff', password: 'Sess-Staff-2026' });
  check('staff sign in with the password only', staff.status === 200 && staff.data.token && !staff.data.mfa);

  const stored = (await db.query("SELECT mfa_secret FROM users WHERE username = 'sessown'")).rows[0].mfa_secret;
  check('authenticator secret is stored encrypted', stored.startsWith('e:') && !stored.includes(secret));
  const backupStored = (await db.query("SELECT mfa_backup_codes FROM users WHERE username = 'sessown'")).rows[0]
    .mfa_backup_codes;
  check('backup codes are stored only as hashes', !String(backupStored).includes(renew.data.backupCodes[0]));

  // lost phone: reset
  const ownerId = (await db.query("SELECT id FROM users WHERE username = 'sessown'")).rows[0].id;
  check(
    'owner can’t reset two-step sign-in',
    (await req('POST', '/api/admin/users/' + ownerId + '/mfa-reset', { token: viaBackup.data.token })).status === 403,
  );
  await req('POST', '/api/admin/team', {
    token: sa,
    body: { name: 'No Edit', username: 'noedit', password: 'NoEdit-Team-2026', permissions: [] },
  });
  const noEdit = await signIn(BASE, 'noedit', 'NoEdit-Team-2026');
  check(
    'team member without "edit businesses" can’t reset an owner',
    (await req('POST', '/api/admin/users/' + ownerId + '/mfa-reset', { token: noEdit })).status === 403,
  );
  const adminId = (await db.query("SELECT id FROM users WHERE username = 'admin'")).rows[0].id;
  check(
    'nobody resets the super admin through the API',
    (await req('POST', '/api/admin/users/' + adminId + '/mfa-reset', { token: sa })).status === 404,
  );
  const resetOk = await req('POST', '/api/admin/users/' + ownerId + '/mfa-reset', { token: sa });
  check('super admin resets an owner’s two-step sign-in', resetOk.status === 200);
  check(
    'the owner is signed out everywhere',
    (await req('GET', '/api/owner/data', { token: viaBackup.data.token })).status === 401,
  );
  const again = await post(BASE, '/api/login', { login: 'sessown', password: 'Sess-Owner-2026' });
  check(
    'next sign-in sets two-step sign-in up again',
    again.data.mfa && again.data.mfa.step === 'setup' && again.data.mfa.uri.startsWith('otpauth://totp/BQuee:'),
  );
  const setupWrong = await post(BASE, '/api/login/mfa', { challenge: again.data.mfa.challenge, code: '111111' });
  check('setup needs a right code from the new secret', setupWrong.status === 401);
  const setupOk = await post(BASE, '/api/login/mfa', {
    challenge: again.data.mfa.challenge,
    code: codeFor(again.data.mfa.secret),
  });
  check(
    'setup with the right code signs in',
    setupOk.status === 200 && setupOk.data.token && setupOk.data.backupCodes.length === 10,
  );
  accounts.set('sessown', {
    secret: again.data.mfa.secret,
    lastStep: totp.stepAt(),
    backupCodes: setupOk.data.backupCodes,
  });
  const ownToken = setupOk.data.token;

  /* ---------- passwords and sessions ---------- */
  const shortTeam = await req('POST', '/api/admin/team', {
    token: sa,
    body: { name: 'Short', username: 'shortpw', password: 'Short-Pw-1' },
  });
  check('team passwords need 12+ characters', shortTeam.status === 400 && /12/.test(shortTeam.data.error));
  const common = await req('POST', '/api/owner/staff', {
    token: ownToken,
    body: { name: 'Weak', branchId, serviceIds: [], username: 'weakpw1', password: 'Password123!' },
  });
  check('very common passwords are refused', common.status === 400 && /guess/.test(common.data.error));
  const expiry = (
    await db.query(
      "SELECT max(s.expires_at - s.created_at) AS d FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username = 'admin'",
    )
  ).rows[0].d;
  check(
    'super admin sessions last 12 hours',
    /12:00:00/.test(String(expiry)) || (expiry && expiry.hours === 12),
    JSON.stringify(expiry),
  );
  const staffExpiry = (
    await db.query(
      "SELECT max(s.expires_at - s.created_at) AS d FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username = 'sessstaff'",
    )
  ).rows[0].d;
  check(
    'staff sessions last 30 days',
    /30 days/.test(String(staffExpiry)) || (staffExpiry && staffExpiry.days === 30),
    JSON.stringify(staffExpiry),
  );

  const other = await signIn(BASE, 'sessstaff', 'Sess-Staff-2026');
  const mine = staff.data.token;
  const pw = await req('PUT', '/api/me/password', {
    token: mine,
    body: { oldPassword: 'Sess-Staff-2026', newPassword: 'Sess-Staff-2027' },
  });
  check('password changed', pw.status === 200);
  check(
    'changing the password signs out the other devices',
    (await req('GET', '/api/me', { token: other })).status === 401,
  );
  check('…but keeps this device signed in', (await req('GET', '/api/me', { token: mine })).status === 200);
  const devices = await req('GET', '/api/me/sessions', { token: mine });
  check(
    'signed-in devices list marks this one',
    devices.status === 200 && devices.data.sessions.some((x) => x.current),
  );

  /* ---------- website: cookie session + CSRF ---------- */
  const web = { 'X-BQuee-Client': 'web' };
  const wl = await post(BASE, '/api/login', { login: 'sessstaff', password: 'Sess-Staff-2027' }, web);
  const set = cookiesOf(wl);
  const sessionCookie = set.find((c) => /^(__Host-)?bq_session=/.test(c)) || '';
  const csrfCookie = set.find((c) => /^(__Host-)?bq_csrf=/.test(c)) || '';
  check('website sign-in returns no token to page scripts', wl.status === 200 && !wl.data.token && wl.data.user);
  check(
    'session cookie is HttpOnly + SameSite=Lax',
    /HttpOnly/.test(sessionCookie) && /SameSite=Lax/.test(sessionCookie),
  );
  check('CSRF cookie is readable by the page (not HttpOnly)', csrfCookie && !/HttpOnly/.test(csrfCookie));
  const jar = [sessionCookie, csrfCookie].map((c) => c.split(';')[0]).join('; ');
  const csrf = decodeURIComponent(csrfCookie.split(';')[0].split('=')[1] || '');
  const origin = BASE;
  check('cookie session reads data', (await req('GET', '/api/me', { headers: { Cookie: jar } })).status === 200);
  const noCsrf = await req('PUT', '/api/me/profile', { headers: { Cookie: jar, Origin: origin }, body: { name: 'X' } });
  check('a change without the CSRF header is refused (403)', noCsrf.status === 403);
  const otherSite = await req('PUT', '/api/me/profile', {
    headers: { Cookie: jar, Origin: 'https://evil.example', 'X-CSRF-Token': csrf },
    body: { name: 'X' },
  });
  check('a change from another website is refused (403)', otherSite.status === 403);
  const noOrigin = await req('PUT', '/api/me/profile', {
    headers: { Cookie: jar, 'X-CSRF-Token': csrf },
    body: { name: 'X' },
  });
  check('a change with no Origin/Referer is refused', noOrigin.status === 403);
  const good = await req('PUT', '/api/me/profile', {
    headers: { Cookie: jar, Origin: origin, 'X-CSRF-Token': csrf },
    body: { name: 'Sess Staff' },
  });
  check('same site + CSRF header → allowed', good.status === 200);
  const out = await req('POST', '/api/logout', { headers: { Cookie: jar, Origin: origin, 'X-CSRF-Token': csrf } });
  check(
    'logout clears both cookies',
    out.status === 200 && cookiesOf(out).filter((c) => /Max-Age=0/.test(c)).length === 2,
  );
  check('the old cookie no longer works', (await req('GET', '/api/me', { headers: { Cookie: jar } })).status === 401);
  const https = await post(
    BASE,
    '/api/login',
    { login: 'sessstaff', password: 'Sess-Staff-2027' },
    { ...web, 'X-Forwarded-Proto': 'https' },
  );
  const hc = cookiesOf(https);
  check(
    'on HTTPS the cookies are Secure with the __Host- prefix',
    hc.length === 2 && hc.every((c) => c.startsWith('__Host-') && /Secure/.test(c)),
    hc.join(' | '),
  );
  check(
    'apps (Bearer token) need no CSRF header',
    (await req('PUT', '/api/me/profile', { token: mine, body: { name: 'Sess Staff' } })).status === 200,
  );

  /* ---------- apps: swapping a token after moving it into secure storage (F-01) ---------- */
  const appTok = await signIn(BASE, 'sessstaff', 'Sess-Staff-2027');
  const rot = await req('POST', '/api/session/rotate', { token: appTok });
  check('app session swapped for a new token', rot.status === 200 && rot.data.token && rot.data.token !== appTok);
  check('the old token stops working', (await req('GET', '/api/me', { token: appTok })).status === 401);
  check('the new token works', (await req('GET', '/api/me', { token: rot.data.token })).status === 200);
  const cust = await req('POST', '/api/customer/signup', {
    body: { name: 'Rota Cust', mobile: '9876512345', email: '', password: 'Rota-Cust-2026' },
  });
  const crot = await req('POST', '/api/customer/session/rotate', { token: cust.data.token });
  check(
    'customer app session swapped too',
    crot.status === 200 &&
      (await req('GET', '/api/customer/me', { token: cust.data.token })).status === 401 &&
      (await req('GET', '/api/customer/me', { token: crot.data.token })).status === 200,
  );

  /* ---------- request rules ---------- */
  const bad = await req('GET', '/api/public/token/%E0%A4%A');
  check('broken %-encoding in an address → 400, not 500 (F-09)', bad.status === 400);
  const pre = await fetch(BASE + '/api/me', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'PUT' },
  });
  check(
    'cross-site API calls refused, no CORS allow header',
    pre.status === 403 && !pre.headers.get('access-control-allow-origin'),
  );
  check(
    'every API answer has a request ID',
    /^[0-9a-f]{16}$/.test((await req('GET', '/api/public/site')).headers.get('x-request-id') || ''),
  );
  check(
    'a JSON list instead of an object is refused',
    (await req('POST', '/api/login', { body: '[1,2]' })).status === 400,
  );

  const page = await fetch(BASE + '/');
  const csp = page.headers.get('content-security-policy') || '';
  check(
    'no embedding in other pages (X-Frame-Options DENY + frame-ancestors none)',
    page.headers.get('x-frame-options') === 'DENY' && csp.includes("frame-ancestors 'none'"),
  );
  check(
    'CSP blocks plugins and reports violations',
    csp.includes("object-src 'none'") && csp.includes('report-uri /api/csp-report'),
  );
  check(
    'CSP report endpoint accepts reports',
    (
      await req('POST', '/api/csp-report', {
        body: { 'csp-report': { 'document-uri': BASE, 'blocked-uri': 'inline' } },
      })
    ).status === 200,
  );
  const evil = await req('PUT', '/api/owner/salon', { token: ownToken, body: { website: 'javascript:alert(1)' } });
  check('a business link with javascript: is refused', evil.status === 400);
  const fine = await req('PUT', '/api/owner/salon', {
    token: ownToken,
    body: { website: 'https://shop.example', instagram: '@sess.shop' },
  });
  check('normal business links are fine', fine.status === 200);

  await db.end();
  /* ---------- audit 4.1 / 4.4: CSRF on every kind of change, CORS, cookie scope, safe errors ---------- */
  const w2 = await post(BASE, '/api/login', { login: 'sessstaff', password: 'Sess-Staff-2027' }, web);
  const set2 = cookiesOf(w2);
  const sess2 = set2.find((c) => /^(__Host-)?bq_session=/.test(c)) || '';
  const jar2 = set2.map((c) => c.split(';')[0]).join('; ');
  check(
    'session cookie is scoped to the whole site (Path=/) with a limited lifetime',
    /Path=\//.test(sess2) && Number((sess2.match(/Max-Age=(\d+)/) || [])[1]) <= 30 * 24 * 3600,
    sess2,
  );
  const csrfMsg = /did not come from the BQuee page/;
  for (const [method, url] of [
    ['POST', '/api/owner/services'],
    ['PUT', '/api/admin/site'],
    ['DELETE', '/api/owner/offers/x1'],
    ['POST', '/api/token/x1/next'],
    ['PUT', '/api/staff/status'],
    ['POST', '/api/admin/salons/bulk'],
    ['POST', '/api/me/sessions/revoke-others'],
  ]) {
    const r = await req(method, url, { headers: { Cookie: jar2, Origin: BASE }, body: {} });
    check(
      `cookie request without CSRF token is refused before anything else: ${method} ${url}`,
      r.status === 403 && csrfMsg.test(r.data.error || ''),
      `${r.status} ${r.data.error}`,
    );
  }
  const cors = await fetch(BASE + '/api/public/site', { headers: { Origin: 'https://evil.example' } });
  const preflight = await fetch(BASE + '/api/me/profile', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'PUT' },
  });
  check(
    'no other website may call the API with the visitor’s cookies (no CORS headers, preflight refused)',
    !cors.headers.get('access-control-allow-origin') &&
      !cors.headers.get('access-control-allow-credentials') &&
      preflight.status === 403 &&
      !preflight.headers.get('access-control-allow-origin'),
  );
  const leaks = /\bat \S+:\d+|node_modules|\/home\/|\/opt\/|SELECT |INSERT |postgres(ql)?:\/\/|stack|DATABASE_URL/i;
  const errorCases = [
    await req('POST', '/api/login', { body: '{"login": broken json' }),
    await req('POST', '/api/login', { body: '[1,2,3]' }),
    await req('GET', '/api/does-not-exist'),
    await req('GET', '/api/public/token/' + 'x'.repeat(500)),
    await req('GET', '/api/public/branch/%E0%A4%A'),
    await req('POST', '/api/public/book', { body: { branchId: { $ne: 1 }, items: 'nope' } }),
  ];
  check(
    'error answers never show code, SQL, file paths or settings',
    errorCases.every((r) => r.status >= 400 && r.status < 500 && !leaks.test(JSON.stringify(r.data))),
    errorCases.map((r) => r.status + ' ' + JSON.stringify(r.data)).join(' | '),
  );

  console.log(`Sign-in security audit: ${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('Sign-in security audit crashed:', err);
  process.exit(1);
});
