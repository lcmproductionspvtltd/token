'use strict';

/**
 * Security audit items 6–10, against a running server with EMAIL_CHECK=required (tests/run.js). The
 * emails go to MAIL_LOG_FILE, where this test reads the codes.
 *   6  sign-up proves the email with a code; changing the email un-confirms it; "confirm my email"
 *   7  forgot password by email code – same answer for unknown emails, sessions ended, code used once
 *   8  fake bookings: open tokens per mobile number, owner cancels all tokens of a number
 *   9  new owners get no authenticator app to set up; every owner sign-in (website, newer apps) needs
 *      a code emailed to them; older apps sign in as before; owners may still switch the app on
 *   10 too many wrong passwords: the right password + an emailed code still gets the owner in, and the
 *      answer is the same for a wrong password
 *   customers: sign-up code, sign-in code (newer apps), forgot password
 */

const fs = require('fs');
const { finishMfa } = require('./helpers/session');

const BASE = process.env.BASE;
const MAIL = process.env.MAIL_LOG_FILE;
const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name + (detail ? ` – ${detail}` : ''));
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}
async function call(method, url, body, { token, headers = {} } = {}) {
  const r = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const mails = () =>
  fs.existsSync(MAIL)
    ? fs
        .readFileSync(MAIL, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
/** The newest code emailed to this address (waits a moment for background sends). */
async function codeFor(to, after = 0) {
  for (let i = 0; i < 40; i++) {
    const m = mails()
      .slice(after)
      .filter((x) => x.to === to.toLowerCase())
      .pop();
    if (m) return (m.text.match(/\b(\d{6})\b/) || [])[1];
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
const sentTo = (to, after) => mails().slice(after).filter((x) => x.to === to.toLowerCase()).length;
const FEATURES = { 'X-BQuee-Features': 'email-code' };

(async () => {
  const site = await (await fetch(BASE + '/api/public/site')).json();
  const types = site.categories || [];
  // Earlier audits may have switched pricing on: then a package must be chosen.
  const pkg = site.sections && site.sections.plans && site.plans && site.plans.length ? site.plans[0].name : '';
  const email = `own${RUN}@shop.test`;
  const base = {
    businessName: 'Mail Shop ' + RUN,
    ownerName: 'Mira',
    mobile: '9876512' + String(Date.now()).slice(-3),
    email,
    username: 'mail' + RUN,
    password: 'MailShop-2026-ok',
    categoryId: types.length ? types[0].id : '',
    package: pkg,
  };

  /* ---------- 6: email code at sign-up ---------- */
  const noCode = await call('POST', '/api/public/signup', base);
  check('EMAIL_CHECK=required: a sign-up without the email code is refused', noCode.status === 400, noCode.data.error);
  const asked = await call('POST', '/api/email-code', { email });
  const code = await codeFor(email);
  check('a 6-digit code is emailed', asked.status === 200 && asked.data.ticket && /^\d{6}$/.test(code || ''));
  const wrong = await call('POST', '/api/public/signup', { ...base, emailTicket: asked.data.ticket, emailCode: '000000' });
  check('a wrong code is refused', wrong.status === 400 && /Wrong code/.test(wrong.data.error), wrong.data.error);
  const other = await call('POST', '/api/public/signup', {
    ...base,
    email: 'other' + email,
    emailTicket: asked.data.ticket,
    emailCode: code,
  });
  check('a code works only for the email it was sent to', other.status === 400);
  const su = await call('POST', '/api/public/signup', { ...base, emailTicket: asked.data.ticket, emailCode: code });
  check('the right code signs the business up', su.status === 200, su.data.error);
  /* 9: no authenticator app at sign-up */
  check('…and the new owner is signed straight in (no authenticator app to set up)', !su.data.mfa && !!su.data.token);
  const owner = su.data;
  check('the owner’s email is confirmed', owner.user && owner.user.emailVerified === true);
  const reuse = await call('POST', '/api/public/signup', {
    ...base,
    username: 'again' + RUN,
    email: 'x' + email,
    emailTicket: asked.data.ticket,
    emailCode: code,
  });
  check('a code works only once', reuse.status === 400);
  const taken = await call('POST', '/api/email-code', { email });
  check('no sign-up code for an email that already has an account', taken.status === 400);

  // Changing the email un-confirms it; confirming again with a code.
  const changed = await call('PUT', '/api/me/profile', { email: 'new' + email }, { token: owner.token });
  check('a changed email is no longer confirmed', changed.status === 200 && changed.data.emailVerified === false);
  const n0 = mails().length;
  const send = await call('POST', '/api/me/email/send', {}, { token: owner.token });
  const vcode = await codeFor('new' + email, n0);
  const badV = await call('POST', '/api/me/email/verify', { ticket: send.data.ticket, code: '111111' }, { token: owner.token });
  check('confirm email: a wrong code is refused', badV.status === 400);
  const goodV = await call('POST', '/api/me/email/verify', { ticket: send.data.ticket, code: vcode }, { token: owner.token });
  const me = await call('GET', '/api/me', undefined, { token: owner.token });
  check('confirm email: the right code confirms it', goodV.status === 200 && me.data.emailVerified === true);
  await call('PUT', '/api/me/profile', { email }, { token: owner.token }); // back to the first one (unconfirmed)

  // Wrong codes: at most 5 tries per code.
  const many = await call('POST', '/api/email-code', { email: `try${RUN}@shop.test` });
  let last;
  for (let i = 0; i < 5; i++)
    last = await call('POST', '/api/public/signup', {
      ...base,
      username: 'try' + RUN,
      email: `try${RUN}@shop.test`,
      emailTicket: many.data.ticket,
      emailCode: String(100000 + i),
    });
  check('after 5 wrong codes the code stops working', last.status === 400 && /Too many/.test(last.data.error));

  /* ---------- 7: forgot password ---------- */
  const unknown = await call('POST', '/api/password/forgot', { email: `nobody${RUN}@shop.test` });
  const n1 = mails().length;
  const known = await call('POST', '/api/password/forgot', { email });
  check(
    'forgot password answers the same for unknown and known emails',
    unknown.status === 200 &&
      known.status === 200 &&
      Object.keys(unknown.data).join() === Object.keys(known.data).join() &&
      unknown.data.ticket.length === known.data.ticket.length,
  );
  const rcode = await codeFor(email, n1);
  check('…and emails a code only to a real account', !!rcode && sentTo(`nobody${RUN}@shop.test`, 0) === 0);
  const weak = await call('POST', '/api/password/reset', { ticket: known.data.ticket, code: rcode, password: 'short' });
  check('a too-easy new password is refused without using up the code', weak.status === 400);
  const badR = await call('POST', '/api/password/reset', {
    ticket: known.data.ticket,
    code: '999999',
    password: 'Brand-New-Pass-77',
  });
  check('a wrong reset code is refused', badR.status === 400);
  const reset = await call('POST', '/api/password/reset', {
    ticket: known.data.ticket,
    code: rcode,
    password: 'Brand-New-Pass-77',
  });
  check('the right code sets the new password', reset.status === 200, reset.data.error);
  check(
    '…and signs the account out everywhere',
    (await call('GET', '/api/me', undefined, { token: owner.token })).status === 401,
  );
  const oldPw = await call('POST', '/api/login', { login: base.username, password: base.password });
  check('the old password no longer works', oldPw.status === 401);
  const newPw = await call('POST', '/api/login', { login: base.username, password: 'Brand-New-Pass-77' });
  check('the new one does (an older app: no email step)', newPw.status === 200 && !!newPw.data.token && !newPw.data.mfa);
  const again = await call('POST', '/api/password/reset', {
    ticket: known.data.ticket,
    code: rcode,
    password: 'Another-Pass-88x',
  });
  check('a reset code works only once', again.status === 400);
  const signed = newPw.data;

  /* ---------- 9: every owner sign-in needs a code by email (website and newer apps) ---------- */
  check('the authenticator app is optional for the owner (off unless they switch it on)', signed.user.mfa.optional === true && signed.user.mfa.enabled === false);
  const n4 = mails().length;
  const wrongNow = await call('POST', '/api/login', { login: base.username, password: 'Wrong-now' }, { headers: FEATURES });
  check('a wrong password is refused as always (no email)', wrongNow.status === 401 && sentTo(email, n4) === 0);
  const step = await call('POST', '/api/login', { login: base.username, password: 'Brand-New-Pass-77' }, { headers: FEATURES });
  const scode = await codeFor(email, n4);
  check(
    'the right password asks for the code emailed to the owner (no session yet)',
    step.status === 200 && step.data.emailCode && !step.data.token && /^\d{6}$/.test(scode || ''),
    JSON.stringify(step.data).slice(0, 120),
  );
  check('…the message names the mailbox only partly', /•••@shop\.test/.test(step.data.emailCode.message));
  const badS = await call('POST', '/api/login/email-code', { ticket: step.data.emailCode.ticket, code: '000000' });
  check('a wrong sign-in code is refused', badS.status === 400);
  const goodS = await call('POST', '/api/login/email-code', { ticket: step.data.emailCode.ticket, code: scode });
  check('the right code signs the owner in', goodS.status === 200 && !!goodS.data.token, JSON.stringify(goodS.data).slice(0, 120));
  const twice = await call('POST', '/api/login/email-code', { ticket: step.data.emailCode.ticket, code: scode });
  check('a sign-in code works only once', twice.status === 400);
  const staffLike = await call('POST', '/api/login', { login: 'admin', password: 'Admin@12345-bq' }, { headers: FEATURES });
  check('the super admin gets no email code (authenticator app as before)', staffLike.status === 200 && !staffLike.data.emailCode && !!staffLike.data.mfa);

  /* ---------- 10: too many wrong passwords ---------- */
  for (let i = 0; i < 10; i++) await call('POST', '/api/login', { login: base.username, password: 'Wrong-' + i });
  const oldApp = await call('POST', '/api/login', { login: base.username, password: 'Brand-New-Pass-77' });
  check('older apps (no email-code step) still get "too many tries"', oldApp.status === 429);
  const n2 = mails().length;
  const wrongPw = await call('POST', '/api/login', { login: base.username, password: 'Wrong-x' }, { headers: FEATURES });
  await new Promise((r) => setTimeout(r, 300));
  check('a wrong password sends no email', sentTo(email, n2) === 0);
  const rightPw = await call(
    'POST',
    '/api/login',
    { login: base.username, password: 'Brand-New-Pass-77' },
    { headers: FEATURES },
  );
  const lcode = await codeFor(email, n2);
  check(
    'wrong and right passwords get the same answer (nothing to learn for a guesser)',
    wrongPw.status === 200 &&
      rightPw.status === 200 &&
      wrongPw.data.emailCode &&
      rightPw.data.emailCode &&
      wrongPw.data.emailCode.message === rightPw.data.emailCode.message &&
      !wrongPw.data.token &&
      !rightPw.data.token,
  );
  check('the right password emails a sign-in code', /^\d{6}$/.test(lcode || ''));
  const fake = await call('POST', '/api/login/email-code', { ticket: wrongPw.data.emailCode.ticket, code: lcode });
  check('the wrong-password answer’s ticket can’t be used', fake.status === 400);
  const viaCode = await call('POST', '/api/login/email-code', { ticket: rightPw.data.emailCode.ticket, code: lcode });
  check(
    'the code lets the real owner in',
    viaCode.status === 200 && !!viaCode.data.token,
    JSON.stringify(viaCode.data).slice(0, 120),
  );
  const inAgain = await finishMfa(BASE, base.username, viaCode.data);
  check('…and they are signed in', !!inAgain.token);
  const normal = await call('POST', '/api/login', { login: base.username, password: 'Brand-New-Pass-77' });
  check('afterwards the account is no longer blocked', normal.status === 200 && !!normal.data.token);

  /* ---------- customers: sign-up code and forgot password ---------- */
  const cmail = `cust${RUN}@mail.test`;
  const cMobile = '98765' + String(Date.now()).slice(-5);
  const cNo = await call('POST', '/api/customer/signup', { name: 'Cia', mobile: cMobile, password: 'Cust-Pass-2026' });
  check('customer sign-up without email is refused (EMAIL_CHECK=required)', cNo.status === 400);
  const cAsk = await call('POST', '/api/email-code', { email: cmail, purpose: 'customer-signup' });
  const ccode = await codeFor(cmail);
  const cSu = await call('POST', '/api/customer/signup', {
    name: 'Cia',
    mobile: cMobile,
    email: cmail,
    password: 'Cust-Pass-2026',
    emailTicket: cAsk.data.ticket,
    emailCode: ccode,
  });
  check('customer signs up with the code; email confirmed', cSu.status === 200 && cSu.data.customer.emailVerified === true);
  const n3 = mails().length;
  const cf = await call('POST', '/api/password/forgot', { email: cmail, account: 'customer' });
  const cr = await codeFor(cmail, n3);
  const cReset = await call('POST', '/api/password/reset', {
    account: 'customer',
    ticket: cf.data.ticket,
    code: cr,
    password: 'Cust-New-Pass-99',
  });
  check('customer resets the password with the code', cReset.status === 200, cReset.data.error);
  check(
    '…the old customer session ends',
    (await call('GET', '/api/customer/me', undefined, { token: cSu.data.token })).status === 401,
  );
  const cIn = await call('POST', '/api/customer/login', { login: cmail, password: 'Cust-New-Pass-99' });
  check('…and the new password signs in (older app: no email step)', cIn.status === 200 && cIn.data.token);
  const n5 = mails().length;
  const cStep = await call('POST', '/api/customer/login', { login: cmail, password: 'Cust-New-Pass-99' }, { headers: FEATURES });
  const cscode = await codeFor(cmail, n5);
  check(
    'newer app: the customer’s right password asks for an emailed code first',
    cStep.status === 200 && cStep.data.emailCode && !cStep.data.token && /^\d{6}$/.test(cscode || ''),
    JSON.stringify(cStep.data).slice(0, 120),
  );
  const cBad = await call('POST', '/api/customer/login/email-code', { ticket: cStep.data.emailCode.ticket, code: '000000' });
  check('a wrong customer sign-in code is refused', cBad.status === 400);
  const cGood = await call('POST', '/api/customer/login/email-code', { ticket: cStep.data.emailCode.ticket, code: cscode });
  check('the right code signs the customer in', cGood.status === 200 && !!cGood.data.token && cGood.data.customer.email === cmail);
  const cWrongPw = await call('POST', '/api/customer/login', { login: cmail, password: 'nope-nope-1' }, { headers: FEATURES });
  check('a wrong customer password sends no code', cWrongPw.status === 401);

  /* ---------- 8: fake bookings ---------- */
  const data = (await call('GET', '/api/owner/data', undefined, { token: inAgain.token })).data;
  const branchId = data.branches[0].id;
  const svc = await call('POST', '/api/owner/services', { name: 'Cut', duration: 20, price: 10 }, { token: inAgain.token });
  await call(
    'POST',
    '/api/owner/staff',
    { name: 'Ana', branchId, serviceIds: [svc.data.id], username: 'ana' + RUN, password: 'Staff@1234-bq' },
    { token: inAgain.token },
  );
  const book = (mobile) =>
    call('POST', '/api/public/book', { branchId, name: 'Fake', mobile, items: [{ serviceId: svc.data.id }] });
  const spam = '+91 99999 0' + RUN.replace(/\D/g, '1').slice(0, 4).padEnd(4, '1');
  const r1 = await book(spam);
  const r2 = await book(spam.replace(/\s/g, ''));
  const r3 = await book(spam);
  const r4 = await book(spam);
  check(
    'one mobile number can hold at most 3 open tokens at a branch (spaces don’t help)',
    r1.status === 200 && r2.status === 200 && r3.status === 200 && r4.status === 429,
    `${r1.status} ${r2.status} ${r3.status} ${r4.status} ${r4.data.error || ''}`,
  );
  const other2 = await book('98111' + String(Date.now()).slice(-5));
  check('other numbers can still book (no per-branch block)', other2.status === 200);
  const cancel = await call(
    'POST',
    '/api/owner/tokens/cancel-number',
    { mobile: spam },
    { token: inAgain.token },
  );
  check('the owner cancels all waiting tokens of that number', cancel.status === 200 && cancel.data.cancelled === 3, JSON.stringify(cancel.data));
  check('…after which that number can book again', (await book(spam)).status === 200);
  const staffTry = await call('POST', '/api/owner/tokens/cancel-number', { mobile: spam });
  check('cancelling by number needs the owner', staffTry.status === 401);

  console.log(`Email codes, password reset, bookings and sign-in limits: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log('  ✗ ' + f);
    process.exit(1);
  }
})().catch((err) => {
  console.error('Email audit crashed:', err);
  process.exit(1);
});
