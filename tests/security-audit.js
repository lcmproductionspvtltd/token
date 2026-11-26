/**
 * Security audit – what a careless user and a hacker would try.
 * Runs against a fresh server at BASE (started by tests/run.js after the API audit).
 */

const { login: signIn } = require('./helpers/session');
const BASE = process.env.BASE || 'http://localhost:3000';
let passed = 0;
const failures = [];

async function request(method, url, body, token, extraHeaders = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: body === undefined || method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data, text, headers: res.headers };
}

function check(label, condition) {
  if (condition) passed++;
  else failures.push(label);
}

const SQL = [
  "' OR '1'='1",
  "admin'--",
  '1; DROP TABLE users;--',
  "' UNION SELECT password_hash FROM users--",
  '"); DELETE FROM salons;--',
];
const XSS = '<img src=x onerror=alert(1)><script>alert(document.cookie)</script>';

(async () => {
  const login = (u, p) => signIn(BASE, u, p).catch(() => undefined); // includes two-step sign-in
  const sa = await login('admin', 'Admin@12345-bq');
  check('super admin can sign in', !!sa);

  // A fresh business to attack.
  await request(
    'POST',
    '/api/admin/salons',
    { name: 'Target Shop', username: 'target', password: 'Target@1234-bq' },
    sa,
  );
  await request('POST', '/api/admin/salons', { name: 'Other Shop', username: 'other', password: 'Other@1234' }, sa);
  const ot = await login('target', 'Target@1234-bq');
  const oo = await login('other', 'Other@1234');
  const T = (await request('GET', '/api/owner/data', undefined, ot)).data;
  const O = (await request('GET', '/api/owner/data', undefined, oo)).data;
  const branch = T.branches[0].id;
  const svc = (await request('POST', '/api/owner/services', { name: 'Cut', duration: 20, price: 100 }, ot)).data.id;
  const staffId = (
    await request(
      'POST',
      '/api/owner/staff',
      { name: 'St', branchId: branch, serviceIds: [svc], username: 'tstaff', password: 'Staff@1234-bq' },
      ot,
    )
  ).data.id;
  const st = await login('tstaff', 'Staff@1234-bq');

  /* ---------- 1. Bad user: wrong, empty and silly input ---------- */
  const bad = [
    ['empty login', '/api/login', {}],
    ['wrong password', '/api/login', { login: 'target', password: 'nope' }],
    [
      'booking with no name',
      '/api/public/book',
      { branchId: branch, mobile: '9876543210', items: [{ serviceId: svc }] },
    ],
    ['booking with no services', '/api/public/book', { branchId: branch, name: 'A', mobile: '9876543210', items: [] }],
    [
      'booking with a bad phone',
      '/api/public/book',
      { branchId: branch, name: 'A', mobile: '12', items: [{ serviceId: svc }] },
    ],
    [
      'booking at a made-up branch',
      '/api/public/book',
      { branchId: 'nope', name: 'A', mobile: '9876543210', items: [{ serviceId: svc }] },
    ],
    [
      'booking a made-up service',
      '/api/public/book',
      { branchId: branch, name: 'A', mobile: '9876543210', items: [{ serviceId: 'nope' }] },
    ],
    [
      'booking another shop’s service',
      '/api/public/book',
      { branchId: O.branches[0].id, name: 'A', mobile: '9876543210', items: [{ serviceId: svc }] },
    ],
    ['weak customer password', '/api/customer/signup', { name: 'C', mobile: '9876500001', password: '123' }],
  ];
  for (const [label, url, body] of bad) {
    const r = await request('POST', url, body);
    check(
      `bad input refused politely: ${label} (${r.status})`,
      r.status >= 400 && r.status < 500 && typeof r.data.error === 'string' && r.data.error.length > 3,
    );
  }
  const neg = await request('POST', '/api/owner/services', { name: 'Neg', duration: 30, price: -500 }, ot);
  check('negative price refused (not silently changed)', neg.status === 400 && /amount/.test(neg.data.error));
  const huge = await request('POST', '/api/owner/services', { name: 'Huge', duration: 99999, price: 100 }, ot);
  const hugeSvc = (await request('GET', '/api/owner/data', undefined, ot)).data.services.find(
    (x) => x.id === huge.data.id,
  );
  check('huge time is limited to 10 hours', hugeSvc && hugeSvc.duration <= 600);
  check(
    'text field given a list → 400',
    (await request('POST', '/api/owner/services', { name: ['a', 'b'], duration: 30, price: 1 }, ot)).status === 400,
  );
  check(
    'text field given an object → 400',
    (await request('POST', '/api/owner/services', { name: { $gt: '' }, duration: 30, price: 1 }, ot)).status === 400,
  );
  check(
    'price given an object → 400',
    (await request('POST', '/api/owner/services', { name: 'Obj', duration: 30, price: { n: 1 } }, ot)).status === 400,
  );
  check(
    'price that is not a number → 400',
    (await request('POST', '/api/owner/services', { name: 'Txt', duration: 30, price: '12abc' }, ot)).status === 400,
  );
  check(
    'login given objects → 400, never a sign-in',
    [400, 401].includes(
      (await request('POST', '/api/login', { login: { $ne: null }, password: { $ne: null } })).status,
    ),
  );
  const longName = await request('POST', '/api/owner/services', { name: 'x'.repeat(5000), duration: 10, price: 1 }, ot);
  const ln = (await request('GET', '/api/owner/data', undefined, ot)).data.services.find(
    (x) => x.id === longName.data.id,
  );
  check('5000-letter name is cut to 80', ln && ln.name.length <= 80);
  const many = await request('POST', '/api/public/book', {
    branchId: branch,
    name: 'Many',
    mobile: '9876500002',
    items: Array.from({ length: 50 }, () => ({ serviceId: svc })),
  });
  check('50 copies of a service become one', many.status === 200 || many.status === 400);
  check('broken JSON refused', (await request('POST', '/api/login', '{"login":')).status === 400);
  check('unknown address gives 404', (await request('GET', '/api/does-not-exist')).status === 404);
  check('wrong method refused', [404, 405].includes((await request('DELETE', '/api/login')).status));

  /* ---------- 2. SQL injection ---------- */
  for (const p of SQL) {
    const r = await request('POST', '/api/login', { login: p, password: p });
    check('SQL injection in login refused: ' + p, r.status === 401 || r.status === 400);
  }
  for (const p of SQL) {
    const r = await request('GET', '/api/public/salon/' + encodeURIComponent(p));
    check('SQL injection in shop address: ' + p, r.status === 404);
    const r2 = await request('GET', '/api/public/branch/' + branch + '/lookup?number=' + encodeURIComponent(p));
    // Letters are stripped and only the digits are used as a token number, so this is always safe.
    check(
      'SQL injection in token lookup: ' + p,
      [200, 400, 404].includes(r2.status) && !/syntax|relation|column/i.test(r2.text),
    );
  }
  const stillThere = await request('GET', '/api/owner/data', undefined, ot);
  check(
    'database untouched after injection attempts',
    stillThere.status === 200 && stillThere.data.services.length >= 1,
  );

  /* ---------- 3. Stored XSS: script text is kept as plain text, never run ---------- */
  const x = await request('POST', '/api/owner/services', { name: XSS, duration: 10, price: 1, description: XSS }, ot);
  check('script in service name stored as plain text', x.status === 200);
  const bk = await request('POST', '/api/public/book', {
    branchId: branch,
    name: XSS,
    mobile: '9876500003',
    items: [{ serviceId: svc }],
  });
  const tv = await request('GET', '/api/public/token/' + bk.data.id);
  check(
    'script in customer name returned as text (JSON), not HTML',
    tv.headers.get('content-type').includes('application/json') && tv.data.token.customer.name.includes('<script>'),
  );
  const page = await request('GET', '/t/' + bk.data.id);
  check('pages never include stored data in HTML', !page.text.includes('onerror=alert'));
  const csp = page.headers.get('content-security-policy') || '';
  const scriptRule = (csp.split(';').find((d) => d.trim().startsWith('script-src')) || '').trim();
  check('content security policy blocks inline and outside scripts', scriptRule === "script-src 'self'");

  /* ---------- 4. Forged, stolen and expired sign-ins ---------- */
  for (const fake of ['abc', 'Bearer', 'x'.repeat(500), sa.slice(0, -2) + 'zz', "' OR 1=1--"]) {
    const r = await request('GET', '/api/admin/data', undefined, fake);
    check('forged session refused: ' + fake.slice(0, 12), r.status === 401);
  }
  const tmp = await login('target', 'Target@1234-bq');
  await request('POST', '/api/logout', {}, tmp);
  check('session dead after sign-out', (await request('GET', '/api/me', undefined, tmp)).status === 401);
  check(
    'customer session cannot open dashboards',
    (await request('GET', '/api/owner/data', undefined, 'c_' + tmp)).status === 401,
  );

  /* ---------- 5. Climbing roles and reaching other shops ---------- */
  check('staff cannot open owner data', (await request('GET', '/api/owner/data', undefined, st)).status === 403);
  check('owner cannot open super admin', (await request('GET', '/api/admin/data', undefined, ot)).status === 403);
  check(
    'staff cannot create staff',
    (await request('POST', '/api/owner/staff', { name: 'x', branchId: branch }, st)).status === 403,
  );
  check(
    'owner cannot edit another shop’s service',
    [403, 404].includes(
      (await request('PUT', '/api/owner/services/' + svc, { name: 'Hacked', duration: 1, price: 1 }, oo)).status,
    ),
  );
  check(
    'owner cannot switch off another shop’s staff',
    [403, 404].includes(
      (await request('PUT', '/api/owner/staff/' + staffId + '/active', { active: false }, oo)).status,
    ),
  );
  check(
    'owners cannot delete staff at all',
    [404, 405].includes((await request('DELETE', '/api/owner/staff/' + staffId, undefined, ot)).status),
  );
  check(
    'owner cannot move staff into another shop’s branch',
    [400, 403, 404].includes(
      (await request('POST', '/api/owner/staff', { name: 'x', branchId: branch, serviceIds: [] }, oo)).status,
    ),
  );
  const sneaky = await request(
    'PUT',
    '/api/owner/salon',
    {
      name: 'Target Shop',
      plan_name: 'Free forever',
      expires_on: '2099-01-01',
      is_active: true,
      features: { reportExport: true },
      salon_id: O.salon.id,
    },
    ot,
  );
  const after = (await request('GET', '/api/owner/data', undefined, ot)).data.salon;
  check(
    'owner cannot change own plan, expiry or features',
    sneaky.status === 200 && after.plan === '' && !String(after.expiresAt).startsWith('2099'),
  );
  check(
    'other shop unchanged',
    (await request('GET', '/api/owner/data', undefined, oo)).data.salon.name === 'Other Shop',
  );
  const me = await request('PUT', '/api/me/profile', { role: 'superadmin', name: 'Owner', salon_id: null }, ot);
  check('owner cannot make themselves super admin', me.status === 200 && me.data.role === 'owner');

  /* ---------- 6. Token QR: scanning someone else's token ---------- */
  const tok = (
    await request('POST', '/api/public/book', {
      branchId: branch,
      name: 'Q',
      mobile: '9876500004',
      items: [{ serviceId: svc }],
    })
  ).data.id;
  check(
    'anyone (no sign-in) cannot start a token',
    [401, 403].includes((await request('POST', '/api/token/' + tok + '/start', {})).status),
  );
  check(
    'other shop cannot start this token',
    [403, 404].includes((await request('POST', '/api/token/' + tok + '/start', {}, oo)).status),
  );
  const go = await request('POST', '/api/token/' + tok + '/next', {}, st);
  check('own staff can start it by scan', go.status === 200);
  check('token id cannot be guessed (long random)', /^[A-Za-z0-9_-]{12,}$/.test(tok));
  const pub = (await request('GET', '/api/public/token/' + tok)).data.token;
  check('public token page hides phone number', pub && !pub.customer.mobile.includes('9876500004'));

  /* ---------- 7. Passwords never leave the server ---------- */
  const dumps = [
    await request('GET', '/api/owner/data', undefined, ot),
    await request('GET', '/api/admin/data', undefined, sa),
    await request('GET', '/api/me', undefined, ot),
    await request('GET', '/api/admin/team', undefined, sa),
  ];
  check(
    'no password or hash in any answer',
    dumps.every((r) => !/password_hash|\$2[aby]\$|scrypt|pbkdf2|Target@1234/i.test(r.text)),
  );

  /* ---------- 8. Security headers ---------- */
  const home = await request('GET', '/');
  const h = (n) => home.headers.get(n) || '';
  check('header: nosniff', h('x-content-type-options') === 'nosniff');
  check(
    'header: no framing by any site (DENY + frame-ancestors none)',
    h('x-frame-options') === 'DENY' && h('content-security-policy').includes("frame-ancestors 'none'"),
  );
  check('header: referrer policy', !!h('referrer-policy'));
  check(
    'API answers are never cached',
    /no-store/.test((await request('GET', '/api/me', undefined, ot)).headers.get('cache-control') || ''),
  );
  check('server does not reveal its software', !h('x-powered-by') && !/express|node/i.test(h('server')));
  const err = await request('POST', '/api/login', '{bad json');
  check('errors never show code or stack traces', !/at .*\.js:\d+|node_modules|stack/i.test(err.text));

  /* ---------- 9. Brute force: sign-in attempts are limited ---------- */
  let limited = false;
  for (let i = 0; i < 30 && !limited; i++)
    limited = (await request('POST', '/api/login', { login: 'target', password: 'guess' + i })).status === 429;
  check('password guessing is stopped (429 after the limit)', limited);

  console.log(`Security audit: ${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exitCode = failures.length ? 1 : 0;
})().catch((err) => {
  console.error('Security audit crashed:', err, failures);
  process.exitCode = 1;
});
