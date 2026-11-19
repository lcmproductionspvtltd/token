/**
 * Account deletion / deactivation requests for every role (raise, cancel, approve, reject, switch back on).
 * Runs on its own freshly started server (tests/run.js) so the sign-in rate limit starts from zero.
 */

const BASE = process.env.BASE || 'http://localhost:3000';
const { login: signIn } = require('./helpers/session');
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

/** Expects HTTP 200 and returns the JSON body. */
async function ok(label, method, url, body, token) {
  const { status, data } = await request(method, url, body, token);
  if (status === 200) passed++;
  else failures.push(`${label} → expected 200, got ${status} ${data.error || ''}`);
  return data;
}

/** Expects one of the given error statuses. */
async function deny(label, statuses, method, url, body, token) {
  const { status } = await request(method, url, body, token);
  if (statuses.includes(status)) passed++;
  else failures.push(`${label} → expected ${statuses.join('/')}, got ${status}`);
}

function check(label, condition) {
  if (condition) passed++;
  else failures.push(label);
}

// Signs in (including two-step sign-in for admin, team and owners) and counts it as a passed check.
const login = async (username, password) => {
  try {
    const token = await signIn(BASE, username, password);
    passed++;
    return token;
  } catch (err) {
    failures.push(err.message);
    return undefined;
  }
};

(async () => {
  const sa = await login('admin', 'Admin@12345-bq');
  await ok(
    'admin adds a team member',
    'POST',
    '/api/admin/team',
    { name: 'Team Two', username: 'team2', password: 'Team@12345-bq', permissions: [] },
    sa,
  );
  const arT2 = await login('team2', 'Team@12345-bq');
  await ok(
    'shop for account requests',
    'POST',
    '/api/admin/salons',
    { name: 'Leaving Shop', username: 'leaver', password: 'Leave@1234-bq' },
    sa,
  );
  const arLo = await login('leaver', 'Leave@1234-bq');
  const arLD = await ok('leaving shop data', 'GET', '/api/owner/data', null, arLo);
  await ok(
    'leaving shop staff 1',
    'POST',
    '/api/owner/staff',
    { name: 'Ravi', branchId: arLD.branches[0].id, username: 'ravi1', password: 'Staff@1234-bq' },
    arLo,
  );
  await ok(
    'leaving shop staff 2',
    'POST',
    '/api/owner/staff',
    { name: 'Mina', branchId: arLD.branches[0].id, username: 'mina1', password: 'Staff@1234-bq' },
    arLo,
  );
  const arR1 = await login('ravi1', 'Staff@1234-bq'),
    arM1 = await login('mina1', 'Staff@1234-bq');
  const arReasons = await ok('staff opens the form', 'GET', '/api/account-request', null, arR1);
  check('no request yet, reasons listed', arReasons.request === null && !!arReasons.reasons.privacy);
  await deny(
    'wrong password refused',
    [400],
    'POST',
    '/api/account-request',
    { kind: 'deactivate', reason: 'left_job', password: 'nope' },
    arR1,
  );
  await deny(
    'reason needed',
    [400],
    'POST',
    '/api/account-request',
    { kind: 'deactivate', password: 'Staff@1234-bq' },
    arR1,
  );
  await deny(
    '"other" needs details',
    [400],
    'POST',
    '/api/account-request',
    { kind: 'delete', reason: 'other', password: 'Staff@1234-bq' },
    arR1,
  );
  await deny(
    'bad kind refused',
    [400],
    'POST',
    '/api/account-request',
    { kind: 'destroy', reason: 'privacy', password: 'Staff@1234-bq' },
    arR1,
  );
  const arQ1 = (
    await ok(
      'staff asks to deactivate',
      'POST',
      '/api/account-request',
      { kind: 'deactivate', reason: 'left_job', details: 'Moving city', password: 'Staff@1234-bq' },
      arR1,
    )
  ).request;
  check(
    'request stored with who asked',
    arQ1.status === 'pending' &&
      arQ1.role === 'staff' &&
      arQ1.business === 'Leaving Shop' &&
      arQ1.details === 'Moving city',
  );
  await deny(
    'only one waiting request',
    [409],
    'POST',
    '/api/account-request',
    { kind: 'delete', reason: 'privacy', password: 'Staff@1234-bq' },
    arR1,
  );
  await deny('someone else cannot cancel it', [404], 'POST', '/api/account-request/' + arQ1.id + '/cancel', {}, arM1);
  await deny('owner cannot see admin list', [403], 'GET', '/api/admin/account-requests', null, arLo);
  await deny(
    'team member cannot decide',
    [401, 403],
    'POST',
    '/api/admin/account-requests/' + arQ1.id + '/decide',
    { action: 'approve' },
    arT2,
  );
  await deny(
    'super admin cannot raise one',
    [403],
    'POST',
    '/api/account-request',
    { kind: 'delete', reason: 'privacy', password: 'Admin@12345-bq' },
    sa,
  );
  const arData = await ok('admin badge count', 'GET', '/api/admin/data', null, sa);
  check('pending count in admin data', arData.accountRequestsPending >= 1);
  const arAll = await ok('admin lists requests', 'GET', '/api/admin/account-requests?status=pending', null, sa);
  check(
    'admin sees the request first',
    arAll.requests[0].id === arQ1.id && arAll.counts.pending >= 1 && arAll.requests[0].accountActive === true,
  );
  await deny(
    'reject needs a note',
    [400],
    'POST',
    '/api/admin/account-requests/' + arQ1.id + '/decide',
    { action: 'reject' },
    sa,
  );
  await ok(
    'admin approves deactivation',
    'POST',
    '/api/admin/account-requests/' + arQ1.id + '/decide',
    { action: 'approve', note: 'Done, all the best' },
    sa,
  );
  await deny('deactivated staff signed out', [401, 403], 'GET', '/api/me', null, arR1);
  await deny('deactivated staff cannot sign in', [403], 'POST', '/api/login', {
    login: 'ravi1',
    password: 'Staff@1234-bq',
  });
  await deny(
    'handled request cannot be decided again',
    [400],
    'POST',
    '/api/admin/account-requests/' + arQ1.id + '/decide',
    { action: 'reject', note: 'x' },
    sa,
  );
  await ok(
    'admin switches the account back on',
    'POST',
    '/api/admin/account-requests/' + arQ1.id + '/reactivate',
    {},
    sa,
  );
  const arR1b = await login('ravi1', 'Staff@1234-bq');
  const arMine = await ok('staff sees the outcome', 'GET', '/api/account-request', null, arR1b);
  check(
    'outcome and note shown to the user',
    arR1b && arMine.request.status === 'done' && arMine.request.adminNote === 'Done, all the best',
  );

  const arQ2 = (
    await ok(
      'staff 2 asks to delete',
      'POST',
      '/api/account-request',
      { kind: 'delete', reason: 'privacy', password: 'Staff@1234-bq' },
      arM1,
    )
  ).request;
  const arCancelled = await ok('staff 2 cancels', 'POST', '/api/account-request/' + arQ2.id + '/cancel', {}, arM1);
  check('cancelled', arCancelled.request.status === 'cancelled');
  const arQ3 = (
    await ok(
      'staff 2 asks again',
      'POST',
      '/api/account-request',
      { kind: 'delete', reason: 'other', details: 'Not needed', password: 'Staff@1234-bq' },
      arM1,
    )
  ).request;
  await ok(
    'admin rejects with a note',
    'POST',
    '/api/admin/account-requests/' + arQ3.id + '/decide',
    { action: 'reject', note: 'Please ask your owner' },
    sa,
  );
  check('rejected request leaves the account alone', (await request('GET', '/api/me', null, arM1)).status === 200);
  const arQ4 = (
    await ok(
      'staff 2 asks to delete again',
      'POST',
      '/api/account-request',
      { kind: 'delete', reason: 'left_job', password: 'Staff@1234-bq' },
      arM1,
    )
  ).request;
  await ok(
    'admin approves staff deletion',
    'POST',
    '/api/admin/account-requests/' + arQ4.id + '/decide',
    { action: 'approve' },
    sa,
  );
  const arLD2 = await ok('shop after staff deletion', 'GET', '/api/owner/data', null, arLo);
  check(
    'staff member and login removed',
    !arLD2.staff.some((x) => x.name === 'Mina') &&
      (await request('POST', '/api/login', { login: 'mina1', password: 'Staff@1234-bq' })).status === 401,
  );
  const arKept = await ok('record arKept after deletion', 'GET', '/api/admin/account-requests', null, sa);
  check(
    'request record still says who asked',
    arKept.requests.some((x) => x.id === arQ4.id && x.name === 'Mina' && x.accountExists === false),
  );

  const arQT = (
    await ok(
      'team member asks to deactivate',
      'POST',
      '/api/account-request',
      { kind: 'deactivate', reason: 'not_using', password: 'Team@12345-bq' },
      arT2,
    )
  ).request;
  check('team member request', arQT.role === 'platform_staff');
  await ok(
    'admin rejects team request',
    'POST',
    '/api/admin/account-requests/' + arQT.id + '/decide',
    { action: 'reject', note: 'Talk to me first' },
    sa,
  );

  const arQO = (
    await ok(
      'owner asks to deactivate',
      'POST',
      '/api/account-request',
      { kind: 'deactivate', reason: 'business_closed', password: 'Leave@1234-bq' },
      arLo,
    )
  ).request;
  await ok(
    'admin approves owner deactivation',
    'POST',
    '/api/admin/account-requests/' + arQO.id + '/decide',
    { action: 'approve' },
    sa,
  );
  await deny('switched-off business cannot sign in', [403], 'POST', '/api/login', {
    login: 'leaver',
    password: 'Leave@1234-bq',
  });
  await ok(
    'admin switches the business back on',
    'POST',
    '/api/admin/account-requests/' + arQO.id + '/reactivate',
    {},
    sa,
  );
  const arLo2 = await login('leaver', 'Leave@1234-bq');
  const arQD = (
    await ok(
      'owner asks to delete',
      'POST',
      '/api/account-request',
      { kind: 'delete', reason: 'business_closed', password: 'Leave@1234-bq' },
      arLo2,
    )
  ).request;
  await ok(
    'admin approves business deletion',
    'POST',
    '/api/admin/account-requests/' + arQD.id + '/decide',
    { action: 'approve' },
    sa,
  );
  const arAfter = await ok('admin data after business deletion', 'GET', '/api/admin/data', null, sa);
  check(
    'business and its logins removed',
    !arAfter.salons.some((x) => x.name === 'Leaving Shop') &&
      (await request('POST', '/api/login', { login: 'leaver', password: 'Leave@1234-bq' })).status === 401,
  );

  // Staff with customers still waiting today can't be deleted (nobody else could serve them).
  await ok(
    'busy shop',
    'POST',
    '/api/admin/salons',
    { name: 'Busy Shop', username: 'busyown', password: 'Busy@12345' },
    sa,
  );
  const bo = await login('busyown', 'Busy@12345');
  const BD = await ok('busy shop data', 'GET', '/api/owner/data', null, bo);
  const bSvc = (await ok('busy service', 'POST', '/api/owner/services', { name: 'Cut', duration: 20, price: 100 }, bo))
    .id;
  const bStaff = (
    await ok(
      'busy staff',
      'POST',
      '/api/owner/staff',
      { name: 'Kiran', branchId: BD.branches[0].id, serviceIds: [bSvc], username: 'kiran1', password: 'Staff@1234-bq' },
      bo,
    )
  ).id;
  const bTok = (
    await ok('customer waits for Kiran', 'POST', '/api/public/book', {
      branchId: BD.branches[0].id,
      name: 'Q',
      mobile: '9876500777',
      items: [{ serviceId: bSvc, staffId: bStaff }],
    })
  ).id;
  const blocked = await request('PUT', '/api/owner/staff/' + bStaff + '/active', { active: false }, bo);
  check(
    'owner cannot switch off staff with a customer waiting',
    blocked.status === 400 && /1 customer waiting today/.test(blocked.data.error),
  );
  const viaForm = await request(
    'PUT',
    '/api/owner/staff/' + bStaff,
    { name: 'Kiran', branchId: BD.branches[0].id, serviceIds: [bSvc], active: false },
    bo,
  );
  check('…nor through the edit form', viaForm.status === 400);
  check(
    'owners cannot delete staff',
    [404, 405].includes((await request('DELETE', '/api/owner/staff/' + bStaff, null, bo)).status),
  );
  const kt = await login('kiran1', 'Staff@1234-bq');
  const kReq = (
    await ok(
      'Kiran asks to be deleted',
      'POST',
      '/api/account-request',
      { kind: 'delete', reason: 'left_job', password: 'Staff@1234-bq' },
      kt,
    )
  ).request;
  await deny(
    'admin cannot approve while a customer waits',
    [400],
    'POST',
    '/api/admin/account-requests/' + kReq.id + '/decide',
    { action: 'approve' },
    sa,
  );
  const stillWaiting = await ok('request still waiting', 'GET', '/api/account-request', null, kt);
  check('request untouched after the refusal', stillWaiting.request.status === 'pending');
  await ok('owner cancels the token', 'POST', '/api/token/' + bTok + '/cancel', {}, bo);
  await ok(
    'admin approves now',
    'POST',
    '/api/admin/account-requests/' + kReq.id + '/decide',
    { action: 'approve' },
    sa,
  );
  const BD2 = await ok('busy shop after', 'GET', '/api/owner/data', null, bo);
  check('Kiran removed once nobody was waiting', !BD2.staff.some((x) => x.id === bStaff));
  const bStaff2 = (
    await ok(
      'second staff',
      'POST',
      '/api/owner/staff',
      { name: 'Lata', branchId: BD.branches[0].id, serviceIds: [bSvc], username: 'lata1', password: 'Staff@1234-bq' },
      bo,
    )
  ).id;
  await ok(
    'owner switches off a free staff member',
    'PUT',
    '/api/owner/staff/' + bStaff2 + '/active',
    { active: false },
    bo,
  );
  await deny('switched-off staff cannot sign in', [403], 'POST', '/api/login', {
    login: 'lata1',
    password: 'Staff@1234-bq',
  });
  const BD3 = await ok('shop after switching off', 'GET', '/api/owner/data', null, bo);
  check(
    'switched-off staff kept, shown as inactive',
    BD3.staff.some((x) => x.id === bStaff2 && x.active === false),
  );
  await ok('owner switches them back on', 'PUT', '/api/owner/staff/' + bStaff2 + '/active', { active: true }, bo);
  check('switched-on staff can sign in again', !!(await login('lata1', 'Staff@1234-bq')));

  console.log(`Account requests: ${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exitCode = failures.length ? 1 : 0;
})().catch((err) => {
  console.error('Account requests audit crashed:', err, failures);
  process.exitCode = 1;
});
