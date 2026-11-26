'use strict';

/**
 * Email codes switched off (EMAIL_CODES=off, e.g. while the mailbox can't send – tests/run.js also sets
 * EMAIL_CHECK=required here): the website is told, nothing asks for a code, sign-ups still work, and
 * too many wrong passwords simply wait as before.
 */

const BASE = process.env.BASE;
const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name + (detail ? ` – ${detail}` : ''));
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}
async function call(method, url, body, headers = {}) {
  const r = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

(async () => {
  const site = (await call('GET', '/api/public/site')).data;
  check('the website is told email codes are off (it hides “Forgot password” and the code)', site.emailCodes === false);
  const ask = await call('POST', '/api/email-code', { email: `x${RUN}@shop.test` });
  check('no codes are sent', ask.status === 400);
  const forgot = await call('POST', '/api/password/forgot', { email: `x${RUN}@shop.test` });
  check('“Forgot password” says it isn’t available', forgot.status === 400 && /available/.test(forgot.data.error));

  const pkg = site.sections && site.sections.plans && site.plans && site.plans.length ? site.plans[0].name : '';
  const su = await call('POST', '/api/public/signup', {
    businessName: 'Off Shop ' + RUN,
    ownerName: 'Omar',
    mobile: '9876500' + String(Date.now()).slice(-3),
    email: `off${RUN}@shop.test`,
    username: 'off' + RUN,
    password: 'OffShop-2026-ok',
    categoryId: (site.categories || [])[0] ? site.categories[0].id : '',
    package: pkg,
  });
  check(
    'sign-up works without a code even with EMAIL_CHECK=required (codes can’t be sent)',
    su.status === 200 && !!su.data.token,
    su.data.error,
  );

  for (let i = 0; i < 10; i++) await call('POST', '/api/login', { login: 'off' + RUN, password: 'Wrong-' + i });
  const locked = await call(
    'POST',
    '/api/login',
    { login: 'off' + RUN, password: 'OffShop-2026-ok' },
    { 'X-BQuee-Features': 'email-code' },
  );
  check('too many wrong passwords: wait, as before (no email step without email)', locked.status === 429);

  console.log(`Email codes switched off: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('Email-off audit crashed:', err);
  process.exit(1);
});
