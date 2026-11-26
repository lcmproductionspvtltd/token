/**
 * Appointment tokens, unused-token expiry and the UTC business day.
 *   - a token can be booked for a later date and time (optional – "now" still works as before)
 *   - an appointment waits apart (upcoming) and joins the live queue 15 minutes before its time
 *   - too soon, in the past or more than 90 days ahead is refused; offline staff can be booked
 *   - unused tokens expire after the owner's hours (default 24), counted from the appointment time
 *   - expired tokens show only to the owner (status "missed"), never in a staff queue
 *   - the owner's expiry setting accepts 1–720 hours only
 *   - the business day and token date are the UTC day
 * Runs against a server at BASE (started by tests/run.js).
 */

const { createPool } = require('../src/db/postgres');
const { login: signIn, finishMfa } = require('./helpers/session');

const BASE = process.env.BASE || 'http://localhost:3000';
const db = createPool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
const failures = [];

async function request(method, url, body, token) {
  const response = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
async function ok(label, method, url, body, token) {
  const { status, data } = await request(method, url, body, token);
  if (status === 200) passed++;
  else failures.push(`${label} → expected 200, got ${status} ${data.error || ''}`);
  return data;
}
async function deny(label, statuses, method, url, body, token) {
  const { status, data } = await request(method, url, body, token);
  if (statuses.includes(status)) passed++;
  else failures.push(`${label} → expected ${statuses.join('/')}, got ${status} ${data.error || ''}`);
  return data;
}
function check(label, condition, detail) {
  if (condition) passed++;
  else failures.push(label + (detail ? ' – ' + detail : ''));
}
// Appointments are kept to the whole minute.
const inMinutes = (m) => new Date(Math.floor(Date.now() / 60_000) * 60_000 + m * 60_000).toISOString();
const utcDay = (iso) => iso.slice(0, 10);
let mobileNo = 0;
const mobile = () => '0507' + String(Date.now() + ++mobileNo).slice(-6);

(async () => {
  // ---- a business with one online and one offline staff member ----
  const types = (await (await fetch(BASE + '/api/public/site')).json()).categories || [];
  const user = `ap${RUN}`;
  const signed = await ok('sign-up', 'POST', '/api/public/signup', {
    businessName: 'Appt ' + RUN,
    ownerName: 'Owner',
    mobile: '0501234567',
    email: `${user}@example.com`,
    username: user,
    password: 'Owner@1234-bq-long',
    package: 'Business',
    categoryId: types.length ? types[0].id : '',
  });
  const owner = (await finishMfa(BASE, user, signed)).token;
  const data = await ok('owner data', 'GET', '/api/owner/data', null, owner);
  check('unused tokens expire after 24 hours by default', data.salon.tokenExpiryHours === 24, data.salon.tokenExpiryHours);
  const branch = data.branches[0].id;
  const cut = (await ok('service', 'POST', '/api/owner/services', { name: 'Cut', duration: 30, price: 50 }, owner)).id;
  const anu = (
    await ok(
      'staff Anu',
      'POST',
      '/api/owner/staff',
      { name: 'Anu', branchId: branch, serviceIds: [cut], username: 'apa' + RUN, password: 'Staff@1234-bq' },
      owner,
    )
  ).id;
  const anuT = await signIn(BASE, 'apa' + RUN, 'Staff@1234-bq');
  const book = (body, label = 'book') =>
    ok(label, 'POST', '/api/public/book', { branchId: branch, name: 'Cust', mobile: mobile(), ...body });

  // ---- the UTC day ----
  const now = await book({ items: [{ serviceId: cut }] }, 'book for now');
  const nowView = await ok('view now token', 'GET', '/api/public/token/' + now.id);
  check('a token for now is dated by the UTC day', nowView.token.date === utcDay(new Date().toISOString()), nowView.token.date);
  check('a token for now has no appointment and is not upcoming', !nowView.token.appointmentAt && !nowView.token.upcoming);
  check(
    'it expires 24 hours after booking',
    Math.abs(nowView.token.expiresAt - nowView.token.createdAt - 24 * 3600_000) < 5_000,
    `${nowView.token.expiresAt - nowView.token.createdAt}`,
  );

  // ---- validation ----
  const bad = (label, at) =>
    deny(label, [400], 'POST', '/api/public/book', {
      branchId: branch,
      name: 'Cust',
      mobile: mobile(),
      items: [{ serviceId: cut }],
      appointmentAt: at,
    });
  await bad('an appointment in the past is refused', inMinutes(-60));
  await bad('an appointment 2 minutes away is refused', inMinutes(2));
  await bad('more than 90 days ahead is refused', inMinutes(91 * 24 * 60));
  await bad('a time that isn’t a time is refused', 'tomorrow evening');

  // ---- an appointment in 3 hours, then one in 3 days with the offline staff member ----
  await ok('Anu goes offline', 'PUT', '/api/staff/status', { online: false }, anuT);
  await deny('offline staff can’t be booked for now', [400, 409], 'POST', '/api/public/book', {
    branchId: branch,
    name: 'Cust',
    mobile: mobile(),
    items: [{ serviceId: cut, staffId: anu }],
  });
  const at = inMinutes(180);
  const later = await book({ items: [{ serviceId: cut, staffId: anu }], appointmentAt: at }, 'appointment in 3 hours');
  check('an appointment can be with staff who are offline now', !!later.id);
  const lv = await ok('view appointment', 'GET', '/api/public/token/' + later.id);
  check('the appointment time is kept', lv.token.appointmentAt === Date.parse(at), `${lv.token.appointmentAt}`);
  check('it is upcoming (more than 15 minutes away)', lv.token.upcoming === true);
  check('its wait is the time until the appointment', lv.wait >= 175 && lv.wait <= 181, `${lv.wait}`);
  check(
    'it expires 24 hours after the appointment time',
    lv.token.expiresAt === Date.parse(at) + 24 * 3600_000,
    `${lv.token.expiresAt}`,
  );
  check('it is dated by its UTC day', lv.token.date === utcDay(at), lv.token.date);
  await ok('Anu comes back online', 'PUT', '/api/staff/status', { online: true }, anuT);

  const far = inMinutes(3 * 24 * 60);
  const future = await book({ items: [{ serviceId: cut }], appointmentAt: far }, 'appointment in 3 days');
  const fv = await ok('view future appointment', 'GET', '/api/public/token/' + future.id);
  check('a future appointment is dated on its own day', fv.token.date === utcDay(far), fv.token.date);
  const ownerFuture = await ok('owner tokens that day', 'GET', '/api/owner/tokens?date=' + utcDay(far), null, owner);
  check('the owner sees it on that day', ownerFuture.some((t) => t.id === future.id));

  // ---- the live queue: the upcoming appointment is not in it ----
  const q = await ok('staff queue', 'GET', '/api/staff/queue', null, anuT);
  const lt = q.tokens.find((t) => t.id === later.id);
  check('staff see the appointment (if it is today’s)', utcDay(at) !== utcDay(new Date().toISOString()) || !!lt);
  if (lt) check('…marked upcoming with its time', lt.upcoming === true && lt.appointmentAt === Date.parse(at));
  const nowInQueue = (await ok('view now token again', 'GET', '/api/public/token/' + now.id)).ahead;
  check('a token booked now is not behind a later appointment', nowInQueue === 0, `${nowInQueue}`);

  // ---- 15 minutes before: it joins the queue ----
  await db.query("UPDATE tokens SET appointment_at = now() + interval '10 minutes' WHERE id = $1", [later.id]);
  const joined = await ok('view appointment near its time', 'GET', '/api/public/token/' + later.id);
  check('10 minutes before its time it is in the live queue', joined.token.upcoming === false);

  // ---- expiry ----
  await db.query("UPDATE tokens SET expires_at = now() - interval '1 minute' WHERE id = $1", [now.id]);
  const expired = await ok('view expired token', 'GET', '/api/public/token/' + now.id);
  check('an unused token past its time expires (missed)', expired.token.status === 'missed', expired.token.status);
  const ownerList = await ok('owner tokens', 'GET', '/api/owner/tokens?date=' + nowView.token.date, null, owner);
  check('the owner sees the expired token', ownerList.some((t) => t.id === now.id && t.status === 'missed'));
  const sq = await ok('staff queue after expiry', 'GET', '/api/staff/queue', null, anuT);
  check('staff never see expired tokens', !sq.tokens.some((t) => t.id === now.id));
  await deny('an expired token can’t be started', [400, 409], 'POST', '/api/token/' + now.id + '/next', {}, anuT);

  // An open token from an earlier day stays in the queue until it expires.
  const old = await book({ items: [{ serviceId: cut }] }, 'token for yesterday');
  await db.query(
    "UPDATE tokens SET token_date = (now() AT TIME ZONE 'UTC')::date - 1, expires_at = now() + interval '2 hours' WHERE id = $1",
    [old.id],
  );
  const sq2 = await ok('staff queue with yesterday’s token', 'GET', '/api/staff/queue', null, anuT);
  check('yesterday’s unexpired token is still in the staff queue', sq2.tokens.some((t) => t.id === old.id));

  // ---- the owner's expiry setting ----
  for (const badHours of [0, 721, 'abc', 2.5])
    await deny(`expiry ${badHours} is refused`, [400], 'PUT', '/api/owner/salon', { tokenExpiryHours: badHours }, owner);
  await ok('expiry 48 hours', 'PUT', '/api/owner/salon', { tokenExpiryHours: 48 }, owner);
  const after = await ok('owner data again', 'GET', '/api/owner/data', null, owner);
  check('the new expiry is saved', after.salon.tokenExpiryHours === 48, after.salon.tokenExpiryHours);
  const t48 = await book({ items: [{ serviceId: cut }] }, 'book with 48 hours');
  const v48 = await ok('view 48-hour token', 'GET', '/api/public/token/' + t48.id);
  check(
    'new tokens use the new expiry',
    Math.abs(v48.token.expiresAt - v48.token.createdAt - 48 * 3600_000) < 5_000,
    `${v48.token.expiresAt - v48.token.createdAt}`,
  );
  const pub = await ok('public branch', 'GET', '/api/public/branch/' + branch);
  check('the booking page knows the expiry hours', pub.salon.tokenExpiryHours === 48);

  await db.end();
  console.log(`Appointments audit: ${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(failures.length ? 1 : 0);
})().catch(async (err) => {
  console.error('Appointments audit crashed:', err);
  await db.end().catch(() => {});
  process.exit(1);
});
