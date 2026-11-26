/**
 * API flow and permission audit: customer booking without login, role separation,
 * salon isolation, QR start/finish, disabled salons and cascading deletes.
 * Runs against a server at BASE (started by tests/run.js with an empty database).
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3000';
const { login: signIn, finishMfa } = require('./helpers/session');
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));
const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
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
  // two salons
  await ok(
    'create salon A',
    'POST',
    '/api/admin/salons',
    { name: 'Salon A', username: 'owna', password: 'Owner@1234-bq', ownerEmail: 'a@a.com' },
    sa,
  );
  await ok(
    'create salon B',
    'POST',
    '/api/admin/salons',
    { name: 'Salon B', username: 'ownb', password: 'Owner@1234-bq' },
    sa,
  );
  const oa = await login('owna', 'Owner@1234-bq'),
    ob = await login('ownb', 'Owner@1234-bq');
  const A = await ok('owner A data', 'GET', '/api/owner/data', null, oa),
    Bd = await ok('owner B data', 'GET', '/api/owner/data', null, ob);
  const a1 = A.branches[0].id,
    b1 = Bd.branches[0].id;
  const a2 = (await ok('A add branch', 'POST', '/api/owner/branches', { name: 'A2', prefix: 'Z' }, oa)).id;
  const svA = (await ok('A service', 'POST', '/api/owner/services', { name: 'Cut', duration: 30, price: 100 }, oa)).id;
  const svB = (await ok('B service', 'POST', '/api/owner/services', { name: 'Cut', duration: 30, price: 100 }, ob)).id;
  const stA1 = (
    await ok(
      'A staff1',
      'POST',
      '/api/owner/staff',
      { name: 'S1', branchId: a1, serviceIds: [svA], username: 's1', password: 'Staff@1234-bq' },
      oa,
    )
  ).id;
  const stA2 = (
    await ok(
      'A staff2',
      'POST',
      '/api/owner/staff',
      { name: 'S2', branchId: a1, serviceIds: [svA], username: 's2', password: 'Staff@1234-bq' },
      oa,
    )
  ).id;
  await ok(
    'B staff',
    'POST',
    '/api/owner/staff',
    { name: 'SB', branchId: b1, serviceIds: [svB], username: 'sb', password: 'Staff@1234-bq' },
    ob,
  );
  const offA = (await ok('A offer', 'POST', '/api/owner/offers', { title: 'Off' }, oa)).id;
  const revA = (await ok('A review', 'POST', '/api/owner/testimonials', { name: 'X', text: 'Nice' }, oa)).id;
  const s1 = await login('s1', 'Staff@1234-bq'),
    s2 = await login('s2', 'Staff@1234-bq'),
    sbt = await login('sb', 'Staff@1234-bq');

  // ---- 1. CUSTOMER: everything works with NO login ----
  await ok('customer landing (no login)', 'GET', '/api/public/landing/' + a1);
  await ok('customer branch services (no login)', 'GET', '/api/public/branch/' + a1);
  const tk1 = (
    await ok('customer books (no login)', 'POST', '/api/public/book', {
      branchId: a1,
      name: 'Cust',
      mobile: '9876543210',
      email: 'cust@x.com',
      items: [{ serviceId: svA, staffId: stA1 }],
    })
  ).id;
  const tk2 = (
    await ok('customer books 2', 'POST', '/api/public/book', {
      branchId: a1,
      name: 'Cust2',
      mobile: '9876500000',
      items: [{ serviceId: svA, staffId: stA2 }],
    })
  ).id;
  const tkB = (
    await ok('customer books at B', 'POST', '/api/public/book', {
      branchId: b1,
      name: 'CB',
      mobile: '9876511111',
      items: [{ serviceId: svB }],
    })
  ).id;
  const pubTok = await ok('customer views token (no login)', 'GET', '/api/public/token/' + tk1);
  check(
    'public token hides full mobile from anonymous viewers',
    pubTok.token && pubTok.token.customer.mobile !== '9876543210',
  );
  const staffTok = await ok('staff views token', 'GET', '/api/public/token/' + tk1, null, s1);
  check('salon staff see full customer mobile', staffTok.token && staffTok.token.customer.mobile === '9876543210');
  const otherTok = await ok('other-salon staff views token', 'GET', '/api/public/token/' + tk1, null, sbt);
  check('other salon staff do NOT see full mobile', otherTok.token && otherTok.token.customer.mobile !== '9876543210');
  await deny('book with service from another salon', [400], 'POST', '/api/public/book', {
    branchId: a1,
    name: 'X',
    mobile: '9876543210',
    items: [{ serviceId: svB }],
  });
  await deny('book staff from another branch', [400], 'POST', '/api/public/book', {
    branchId: a2,
    name: 'X',
    mobile: '9876543210',
    items: [{ serviceId: svA, staffId: stA1 }],
  });
  await deny('book bad mobile', [400], 'POST', '/api/public/book', {
    branchId: a1,
    name: 'X',
    mobile: '12',
    items: [{ serviceId: svA }],
  });

  // ---- 2. ANONYMOUS cannot reach any dashboard/API that needs login ----
  for (const [m, u] of [
    ['GET', '/api/me'],
    ['GET', '/api/owner/data'],
    ['GET', '/api/owner/tokens'],
    ['GET', '/api/admin/data'],
    ['GET', '/api/staff/queue'],
    ['POST', '/api/token/' + tk1 + '/start'],
    ['POST', '/api/owner/services'],
    ['PUT', '/api/owner/salon'],
    ['POST', '/api/admin/salons'],
    ['DELETE', '/api/owner/offers/' + offA],
    ['PUT', '/api/me/password'],
  ])
    await deny('anonymous ' + m + ' ' + u, [401], m, u, {});

  // ---- 3. ROLE separation ----
  await deny('staff → owner data', [403], 'GET', '/api/owner/data', null, s1);
  await deny('staff → admin data', [403], 'GET', '/api/admin/data', null, s1);
  await deny('staff → create service', [403], 'POST', '/api/owner/services', { name: 'x' }, s1);
  await deny('owner → admin data', [403], 'GET', '/api/admin/data', null, oa);
  await deny('owner → create salon', [403], 'POST', '/api/admin/salons', { name: 'x' }, oa);
  await deny('owner → staff queue', [403], 'GET', '/api/staff/queue', null, oa);
  await deny('admin → owner data', [403], 'GET', '/api/owner/data', null, sa);
  await deny('admin → token action', [403], 'POST', '/api/token/' + tk1 + '/start', {}, sa);

  // ---- 4. SALON isolation ----
  await deny('owner B edits A service', [404], 'PUT', '/api/owner/services/' + svA, { name: 'hack' }, ob);
  await deny('owner B edits A staff', [404], 'PUT', '/api/owner/staff/' + stA1, { name: 'hack', branchId: b1 }, ob);
  await deny(
    'owner B switches off A staff',
    [404],
    'PUT',
    '/api/owner/staff/' + stA1 + '/active',
    { active: false },
    ob,
  );
  await deny('owner B edits A branch', [404], 'PUT', '/api/owner/branches/' + a1, { name: 'hack' }, ob);
  await deny('owner B edits A offer', [404], 'PUT', '/api/owner/offers/' + offA, { title: 'hack' }, ob);
  await deny('owner B edits A review', [404], 'PUT', '/api/owner/testimonials/' + revA, { name: 'h', text: 'h' }, ob);
  await deny('owner B deletes A offer', [404], 'DELETE', '/api/owner/offers/' + offA, null, ob);
  check(
    'A offer still exists after B tried delete',
    (await ok('A data', 'GET', '/api/owner/data', null, oa)).offers.some((o) => o.id === offA),
  );
  await deny('owner B acts on A token', [404], 'POST', '/api/token/' + tk1 + '/start', {}, ob);

  // Complete cross-business sweep (audit 4.3): owner B tries every action on each of A's records by id.
  const beforeA = await ok('A data before the sweep', 'GET', '/api/owner/data', null, oa);
  const sweep = [
    ['PUT', '/api/owner/branches/' + a1, { name: 'hack' }],
    ['DELETE', '/api/owner/branches/' + a2],
    ['POST', '/api/owner/branches/' + a1 + '/reset-numbers', {}],
    ['PUT', '/api/owner/services/' + svA, { name: 'hack', duration: 5, price: 1 }],
    ['DELETE', '/api/owner/services/' + svA],
    ['PUT', '/api/owner/staff/' + stA1, { name: 'hack' }],
    ['PUT', '/api/owner/staff/' + stA1 + '/active', { active: false }],
    ['PUT', '/api/owner/staff/' + stA1 + '/status', { online: false }],
    ['PUT', '/api/owner/offers/' + offA, { title: 'hack' }],
    ['DELETE', '/api/owner/offers/' + offA],
    ['PUT', '/api/owner/testimonials/' + revA, { name: 'h', text: 'h' }],
    ['DELETE', '/api/owner/testimonials/' + revA],
    ['POST', '/api/token/' + tk1 + '/start', {}],
    ['POST', '/api/token/' + tk1 + '/finish', {}],
    ['POST', '/api/token/' + tk1 + '/next', {}],
    ['POST', '/api/token/' + tk1 + '/cancel', {}],
    ['GET', '/api/token/' + tk1 + '/services'],
  ];
  for (const [method, url, body] of sweep)
    await deny(
      `owner B cannot ${method} another business's ${url.split('/')[3]}`,
      [403, 404],
      method,
      url,
      body || null,
      ob,
    );
  const bTokens = await ok('B token list with A’s branch id', 'GET', '/api/owner/tokens?branchId=' + a1, null, ob);
  check('B never sees A’s tokens, even when asking for A’s branch', !JSON.stringify(bTokens).includes(tk1));
  const bReport = await ok('B report with A’s branch id', 'GET', '/api/owner/reports?branchId=' + a1, null, ob);
  check('B’s report never includes A’s tokens', !JSON.stringify(bReport).includes(tk1));
  const afterA = await ok('A data after the sweep', 'GET', '/api/owner/data', null, oa);
  // Every list A's dashboard shows, by id, name and on/off (live waiting minutes change by themselves).
  const essentials = (d) =>
    JSON.stringify(
      Object.keys(d)
        .sort()
        .filter((k) => Array.isArray(d[k]))
        .map((k) => [k, d[k].map((x) => [x.id, x.name || x.title, x.active, x.status])]),
    );
  check('after the whole sweep A’s data is exactly the same', essentials(beforeA) === essentials(afterA));
  await deny('staff B acts on A token', [404], 'POST', '/api/token/' + tk1 + '/start', {}, sbt);
  await ok(
    'owner A links staff to a B service (ignored)',
    'PUT',
    '/api/owner/staff/' + stA1,
    { name: 'S1', branchId: a1, serviceIds: [svA, svB] },
    oa,
  );
  check(
    'foreign service not linked to staff',
    !(await ok('A data', 'GET', '/api/owner/data', null, oa)).staff.find((x) => x.id === stA1).serviceIds.includes(svB),
  );
  await deny(
    'owner A puts staff in B branch',
    [400],
    'PUT',
    '/api/owner/staff/' + stA1,
    { name: 'S1', branchId: b1, serviceIds: [svA] },
    oa,
  );
  const tA = await ok('owner A tokens', 'GET', '/api/owner/tokens', null, oa);
  check('owner A sees only own tokens', tA.length === 2 && !tA.some((t) => t.id === tkB));

  // ---- 5. STAFF can only act on own services ----
  await deny('staff2 starts staff1 item', [403], 'POST', '/api/token/' + tk1 + '/start', {}, s2);
  await deny('staff cancels token', [403, 400], 'POST', '/api/token/' + tk2 + '/cancel', {}, s2);
  const st = await ok('staff1 scan → start', 'POST', '/api/token/' + tk1 + '/next', {}, s1);
  check('scan 1 started service', st.token.status === 'serving');
  const fin = await ok('staff1 scan → finish', 'POST', '/api/token/' + tk1 + '/next', {}, s1);
  check('scan 2 finished token', fin.token.status === 'done');
  await deny('scan again after done', [400], 'POST', '/api/token/' + tk1 + '/next', {}, s1);
  await ok('owner cancels waiting token', 'POST', '/api/token/' + tk2 + '/cancel', {}, oa);
  await deny('cannot start cancelled', [400], 'POST', '/api/token/' + tk2 + '/start', {}, s2);

  // ---- 6. Staff moved to another branch still sees today's assigned customers ----
  const tk3 = (
    await ok('book for staff2', 'POST', '/api/public/book', {
      branchId: a1,
      name: 'C3',
      mobile: '9876522222',
      items: [{ serviceId: svA, staffId: stA2 }],
    })
  ).id;
  await ok(
    'move staff2 to branch A2',
    'PUT',
    '/api/owner/staff/' + stA2,
    { name: 'S2', branchId: a2, serviceIds: [svA] },
    oa,
  );
  const q2 = await ok('staff2 queue', 'GET', '/api/staff/queue', null, s2);
  check(
    'moved staff still sees queued customer',
    q2.tokens.some((t) => t.id === tk3),
  );

  // ---- 7. Deactivated staff / disabled salon ----
  // S2 still has a customer waiting today, so switching them off is refused until that token is cancelled.
  await deny(
    'cannot switch off staff with a customer waiting',
    [400],
    'PUT',
    '/api/owner/staff/' + stA2,
    { name: 'S2', branchId: a2, serviceIds: [svA], active: false },
    oa,
  );
  const s2Open = (await ok('owner tokens before switching off', 'GET', '/api/owner/tokens', null, oa)).filter(
    (t) =>
      ['waiting', 'serving'].includes(t.status) &&
      t.items.some((i) => i.staffId === stA2 && ['waiting', 'in_progress'].includes(i.status)),
  );
  for (const t of s2Open) await ok('owner cancels S2 token', 'POST', '/api/token/' + t.id + '/cancel', {}, oa);
  await ok(
    'deactivate staff2',
    'PUT',
    '/api/owner/staff/' + stA2,
    { name: 'S2', branchId: a2, serviceIds: [svA], active: false },
    oa,
  );
  await deny('inactive staff session blocked', [403], 'GET', '/api/staff/queue', null, s2);
  await deny('inactive staff cannot log in', [403], 'POST', '/api/login', {
    username: 's2',
    password: 'Staff@1234-bq',
  });
  const salA = (await ok('admin data', 'GET', '/api/admin/data', null, sa)).salons.find((x) => x.name === 'Salon A');
  await ok('disable salon A', 'PUT', '/api/admin/salons/' + salA.id, { active: false }, sa);
  await deny('disabled salon: owner blocked', [403], 'GET', '/api/owner/data', null, oa);
  await deny('disabled salon: staff blocked', [403], 'GET', '/api/staff/queue', null, s1);
  await deny('disabled salon: booking closed', [403], 'POST', '/api/public/book', {
    branchId: a1,
    name: 'X',
    mobile: '9876543210',
    items: [{ serviceId: svA }],
  });
  const L = await ok('disabled salon landing still loads', 'GET', '/api/public/landing/' + a1);
  check('disabled salon landing shows not taking bookings', L.branches[0].wait == null);
  await ok('customer can still view own token', 'GET', '/api/public/token/' + tk1);
  await ok('re-enable salon A', 'PUT', '/api/admin/salons/' + salA.id, { active: true }, sa);
  await ok('owner works again', 'GET', '/api/owner/data', null, oa);

  // ---- 8. Delete salon cascades ----
  const salB = (await ok('admin data', 'GET', '/api/admin/data', null, sa)).salons.find((x) => x.name === 'Salon B');
  await ok('delete salon B', 'DELETE', '/api/admin/salons/' + salB.id, null, sa);
  await deny('deleted salon owner session gone', [401], 'GET', '/api/owner/data', null, ob);
  await deny('deleted salon staff cannot log in', [401], 'POST', '/api/login', {
    username: 'sb',
    password: 'Staff@1234-bq',
  });
  await deny('deleted salon token gone', [404], 'GET', '/api/public/token/' + tkB);

  // ---- 9. Super admin team (platform staff) – separate from salon staff ----
  await ok(
    'admin adds team member',
    'POST',
    '/api/admin/team',
    {
      name: 'Team One',
      username: 'team1',
      password: 'Team@12345-bq',
      permissions: ['salons.create', 'nonsense'],
    },
    sa,
  );
  const team = await ok('admin lists team', 'GET', '/api/admin/team', null, sa);
  const t1 = team.team.find((m) => m.username === 'team1');
  check('unknown permission dropped', t1 && t1.permissions.join() === 'salons.create');
  const tt = await login('team1', 'Team@12345-bq');
  const tData = await ok('team member sees salons', 'GET', '/api/admin/data', null, tt);
  check(
    'team member without revenue.view sees no amounts',
    tData.stats.revenue == null && tData.salons.every((x) => x.amount == null),
  );
  const tSalon = await ok(
    'team member creates salon',
    'POST',
    '/api/admin/salons',
    { name: 'Team Salon', username: 'teamown', password: 'Owner@1234-bq', serviceMode: 'single', staffMode: 'bogus' },
    tt,
  );
  const tRow = (await ok('team salon listed', 'GET', '/api/admin/data', null, tt)).salons.find(
    (x) => x.id === tSalon.id,
  );
  check(
    'new business stores booking modes (bad value = many)',
    tRow.serviceMode === 'single' && tRow.staffMode === 'multiple',
  );
  await deny('team member cannot edit salon', [403], 'PUT', '/api/admin/salons/' + tSalon.id, { name: 'X' }, tt);
  await deny('team member cannot disable salon', [403], 'PUT', '/api/admin/salons/' + tSalon.id, { active: false }, tt);
  await deny('team member cannot delete salon', [403], 'DELETE', '/api/admin/salons/' + tSalon.id, null, tt);
  await deny('team member cannot see team', [403], 'GET', '/api/admin/team', null, tt);
  await deny(
    'team member cannot add team',
    [403],
    'POST',
    '/api/admin/team',
    { name: 'x', username: 'x2', password: 'Team@12345-bq' },
    tt,
  );
  await deny('team member → owner data', [403], 'GET', '/api/owner/data', null, tt);
  await deny('team member → staff queue', [403], 'GET', '/api/staff/queue', null, tt);
  await deny('owner → team list', [403], 'GET', '/api/admin/team', null, oa);
  await deny('salon staff → team list', [403], 'GET', '/api/admin/team', null, s1);
  await ok('admin grants delete', 'PUT', '/api/admin/team/' + t1.id, { permissions: ['salons.delete'] }, sa);
  await ok('team member deletes salon with permission', 'DELETE', '/api/admin/salons/' + tSalon.id, null, tt);
  await ok('admin disables team member', 'PUT', '/api/admin/team/' + t1.id, { active: false }, sa);
  await deny('disabled team member session ends', [401], 'GET', '/api/admin/data', null, tt);
  await deny('disabled team member cannot log in', [403], 'POST', '/api/login', {
    username: 'team1',
    password: 'Team@12345-bq',
  });
  await ok('admin removes team member', 'DELETE', '/api/admin/team/' + t1.id, null, sa);

  // ---- 10. Token number reset ----
  const before = await ok('owner numbers', 'GET', '/api/owner/data', null, oa);
  check('numbers shown for branch', before.numbers && before.numbers[a1] && before.numbers[a1].last > 0);
  await deny('staff cannot reset numbers', [403], 'POST', '/api/owner/branches/' + a1 + '/reset-numbers', {}, s1);
  await ok('owner resets numbers', 'POST', '/api/owner/branches/' + a1 + '/reset-numbers', {}, oa);
  const nb = await ok('branch after reset', 'GET', '/api/public/branch/' + a1);
  check('next number is 1 after reset', nb.nextNumber === 1);
  const r1 = await ok('book after reset', 'POST', '/api/public/book', {
    branchId: a1,
    name: 'Reset',
    mobile: '9876500001',
    items: [{ serviceId: svA }],
  });
  const rt = await ok('token after reset', 'GET', '/api/public/token/' + r1.id);
  check('first token after reset is 001', rt.token.number === 1);
  const lk = await ok('lookup number 1 after reset', 'GET', '/api/public/branch/' + a1 + '/lookup?number=1');
  check('lookup finds the new token', lk.status === 'waiting');

  // ---- 10b. Branch links by business name (/b/lotussalon) ----
  const byId = await ok('branch page by its id', 'GET', '/api/public/landing/' + a1);
  const link = byId.branches[0].slug;
  check('each branch has a name link (letters, digits, dashes)', /^[a-z0-9-]{4,}$/.test(link || ''), link);
  const byLink = await ok('branch page by its name link', 'GET', '/api/public/landing/' + link);
  check('the name link opens the same branch', byLink.branchId === a1 && byLink.branches[0].id === a1);
  const byUpper = await ok('name link in capitals', 'GET', '/api/public/landing/' + link.toUpperCase());
  check('the name link works in any letter case', byUpper.branchId === a1);
  const formByLink = await ok('booking form by name link', 'GET', '/api/public/branch/' + link);
  check('the booking form opens by name link', formByLink.branch.id === a1 && formByLink.branch.slug === link);
  const bookByLink = await ok('book by name link', 'POST', '/api/public/book', {
    branchId: link,
    name: 'Link',
    mobile: '9876500002',
    items: [{ serviceId: svA }],
  });
  const tokByLink = await ok('token booked by name link', 'GET', '/api/public/token/' + bookByLink.id);
  check('a booking made through the name link lands at the right branch', tokByLink.branch.id === a1 && tokByLink.branch.slug === link);
  const lkByLink = await ok('lookup by name link', 'GET', '/api/public/branch/' + link + '/lookup?number=1');
  check('“check your token” works by name link', lkByLink.status === 'waiting');
  check('an unknown link is not found', (await request('GET', '/api/public/landing/no-such-business-zz')).status === 404);

  // ---- 11. Install as app ----
  const mf = await ok('salon app manifest', 'GET', '/api/public/manifest/' + a1);
  check(
    'manifest opens the branch page (by its name link)',
    /^\/b\/[a-z0-9-]+\?source=app$/.test(mf.start_url) && mf.display === 'standalone' && mf.icons.length >= 3,
  );

  // ---- 12. Default services ----
  const defs = await ok('admin lists default services', 'GET', '/api/admin/default-services', null, sa);
  check('default services list loads', Array.isArray(defs.services));
  const newDef = await ok(
    'admin adds default service',
    'POST',
    '/api/admin/default-services',
    { name: 'Audit Default Cut', duration: 25, price: 350 },
    sa,
  );
  await deny(
    'owner cannot change defaults',
    [403],
    'POST',
    '/api/admin/default-services',
    { name: 'x', duration: 10, price: 1 },
    oa,
  );
  const ownerDefs = await ok('owner sees default services', 'GET', '/api/owner/default-services', null, oa);
  check(
    'new default is offered to owner',
    ownerDefs.services.some((x) => x.id === newDef.id && !x.added),
  );
  const loaded = await ok('owner loads defaults', 'POST', '/api/owner/default-services/load', { ids: [newDef.id] }, oa);
  check('one service added', loaded.added === 1);
  const again = await ok(
    'owner loads same default again',
    'POST',
    '/api/owner/default-services/load',
    { ids: [newDef.id] },
    oa,
  );
  check('no duplicate when loaded twice', again.added === 0 && again.skipped === 1);
  const od = await ok('owner data after load', 'GET', '/api/owner/data', null, oa);
  const copy = od.services.find((x) => x.name === 'Audit Default Cut');
  check('copied service is the owner’s own', copy && copy.price === 350 && copy.duration === 25);
  check(
    'copied service given to staff',
    od.staff.some((st) => st.serviceIds.includes(copy.id)),
  );
  await ok(
    'owner edits copied service',
    'PUT',
    '/api/owner/services/' + copy.id,
    { name: 'Audit Default Cut', price: 999, duration: 40, active: true },
    oa,
  );
  const defsAfter = await ok('defaults after owner edit', 'GET', '/api/admin/default-services', null, sa);
  check('owner edit did not change default', defsAfter.services.find((x) => x.id === newDef.id).price === 350);
  await ok('owner deletes copied service', 'DELETE', '/api/owner/services/' + copy.id, null, oa);
  check(
    'default survives owner delete',
    (await ok('defaults again', 'GET', '/api/admin/default-services', null, sa)).services.some(
      (x) => x.id === newDef.id,
    ),
  );
  await ok('owner reloads after delete', 'POST', '/api/owner/default-services/load', { ids: [newDef.id] }, oa);
  await ok(
    'admin edits default',
    'PUT',
    '/api/admin/default-services/' + newDef.id,
    { name: 'Audit Default Cut', price: 1, duration: 5 },
    sa,
  );
  check(
    'admin edit did not change salon copy',
    (await ok('owner data', 'GET', '/api/owner/data', null, oa)).services.find((x) => x.name === 'Audit Default Cut')
      .price === 350,
  );
  await ok('admin deletes default', 'DELETE', '/api/admin/default-services/' + newDef.id, null, sa);
  check(
    'salon copy survives admin delete',
    (await ok('owner data 2', 'GET', '/api/owner/data', null, oa)).services.some((x) => x.name === 'Audit Default Cut'),
  );

  // ---- 13. Business categories ----
  const cats = await ok('admin lists categories', 'GET', '/api/admin/categories', null, sa);
  check('categories list loads', Array.isArray(cats.categories));
  const catX = await ok(
    'admin adds category',
    'POST',
    '/api/admin/categories',
    { name: 'Audit Pharmacy', icon: 'heart', color: '#15803d' },
    sa,
  );
  await deny('duplicate category name', [400], 'POST', '/api/admin/categories', { name: 'audit pharmacy' }, sa);
  await deny('owner cannot add category', [403], 'POST', '/api/admin/categories', { name: 'Nope' }, oa);
  const defX = await ok(
    'default service for category',
    'POST',
    '/api/admin/default-services',
    { name: 'Audit Medicine Pickup', duration: 5, price: 0, categoryId: catX.id },
    sa,
  );
  const defAll = await ok(
    'default service for all',
    'POST',
    '/api/admin/default-services',
    { name: 'Audit Everyone Svc', duration: 5, price: 0 },
    sa,
  );
  await deny(
    'default service with unknown category',
    [400],
    'POST',
    '/api/admin/default-services',
    { name: 'x', duration: 5, price: 0, categoryId: 'nope' },
    sa,
  );
  const before2 = await ok('owner defaults (no category)', 'GET', '/api/owner/default-services', null, oa);
  check(
    'no-category business sees all-business defaults only',
    before2.services.some((x) => x.id === defAll.id) && !before2.services.some((x) => x.id === defX.id),
  );
  await deny(
    'cannot load another category’s default',
    [400],
    'POST',
    '/api/owner/default-services/load',
    { ids: [] },
    oa,
  );
  const sneak = await ok(
    'loading other category default is ignored',
    'POST',
    '/api/owner/default-services/load',
    { ids: [defX.id] },
    oa,
  );
  check('other category default not added', sneak.added === 0);
  await ok('admin sets business category', 'PUT', '/api/admin/salons/' + salA.id, { categoryId: catX.id }, sa);
  const after2 = await ok('owner defaults (with category)', 'GET', '/api/owner/default-services', null, oa);
  check(
    'category business sees its defaults',
    after2.category === 'Audit Pharmacy' && after2.services.some((x) => x.id === defX.id && !x.forAll),
  );
  const adm = await ok('admin data has categories', 'GET', '/api/admin/data', null, sa);
  check(
    'business shows its category',
    adm.salons.find((x) => x.id === salA.id).categoryId === catX.id &&
      adm.categories.some((c) => c.id === catX.id && c.businesses === 1),
  );
  await ok('admin deletes category', 'DELETE', '/api/admin/categories/' + catX.id, null, sa);
  const adm2 = await ok('admin data after category delete', 'GET', '/api/admin/data', null, sa);
  check('business kept without category', adm2.salons.find((x) => x.id === salA.id).categoryId === '');
  const defs2 = await ok('defaults after category delete', 'GET', '/api/admin/default-services', null, sa);
  check('default service kept for all businesses', defs2.services.find((x) => x.id === defX.id).categoryId === '');

  // ---- 14. Booking with an offer ----
  const offPct = await ok(
    'owner adds 25% offer',
    'POST',
    '/api/owner/offers',
    { title: 'Audit 25', code: 'aud25', discountType: 'percent', discountValue: 25, active: true },
    oa,
  );
  const offFlat = await ok(
    'owner adds flat offer',
    'POST',
    '/api/owner/offers',
    { title: 'Audit Flat', discountType: 'flat', discountValue: 99999, active: true },
    oa,
  );
  const offOld = await ok(
    'owner adds expired offer',
    'POST',
    '/api/owner/offers',
    { title: 'Audit Old', validTill: '2020-01-01', active: true },
    oa,
  );
  await deny(
    'discount needs an amount',
    [400],
    'POST',
    '/api/owner/offers',
    { title: 'X', discountType: 'percent', discountValue: 0 },
    oa,
  );
  const brOffers = await ok('branch lists live offers', 'GET', '/api/public/branch/' + a1);
  check(
    'live offers include new, not expired',
    brOffers.offers.some((o) => o.id === offPct.id) && !brOffers.offers.some((o) => o.id === offOld.id),
  );
  const bk = await ok('book with offer', 'POST', '/api/public/book', {
    branchId: a1,
    name: 'Offer',
    mobile: '9876500088',
    items: [{ serviceId: svA }],
    offerId: offPct.id,
  });
  const bt = (await ok('token with offer', 'GET', '/api/public/token/' + bk.id)).token;
  check('offer saved on token', bt.offer && bt.offer.title === 'Audit 25' && bt.offer.code === 'AUD25');
  check(
    '25% discount applied',
    bt.discount === Math.round(bt.subtotal * 25) / 100 && bt.total === bt.subtotal - bt.discount,
  );
  const bf = await ok('book with flat offer', 'POST', '/api/public/book', {
    branchId: a1,
    name: 'Flat',
    mobile: '9876500089',
    items: [{ serviceId: svA }],
    offerId: offFlat.id,
  });
  const ft = (await ok('flat token', 'GET', '/api/public/token/' + bf.id)).token;
  check('flat discount never below zero', ft.total === 0 && ft.discount === ft.subtotal);
  await deny('expired offer refused', [400], 'POST', '/api/public/book', {
    branchId: a1,
    name: 'Old',
    mobile: '9876500090',
    items: [{ serviceId: svA }],
    offerId: offOld.id,
  });
  await deny('unknown offer refused', [400], 'POST', '/api/public/book', {
    branchId: a1,
    name: 'Bad',
    mobile: '9876500091',
    items: [{ serviceId: svA }],
    offerId: 'nope',
  });
  await ok(
    'owner changes offer after booking',
    'PUT',
    '/api/owner/offers/' + offPct.id,
    { title: 'Changed', discountType: 'none', active: true },
    oa,
  );
  const bt2 = (await ok('token after offer change', 'GET', '/api/public/token/' + bk.id)).token;
  check('token keeps offer as booked', bt2.offer.title === 'Audit 25' && bt2.discount > 0);
  const ownerTok = await ok('owner tokens list', 'GET', '/api/owner/tokens', null, oa);
  check(
    'owner sees offer and totals',
    ownerTok.some((t) => t.id === bk.id && t.offer && t.total === bt.total),
  );

  // ---- 15. Service groups under business categories ----
  const gcat = await ok('category for groups', 'POST', '/api/admin/categories', { name: 'Audit Groups Cat' }, sa);
  const g1 = await ok(
    'add group',
    'POST',
    '/api/admin/service-groups',
    { name: 'Audit Hair', categoryId: gcat.id },
    sa,
  );
  await deny(
    'duplicate group in category',
    [400],
    'POST',
    '/api/admin/service-groups',
    { name: 'audit hair', categoryId: gcat.id },
    sa,
  );
  await ok(
    'same name allowed in other scope',
    'POST',
    '/api/admin/service-groups',
    { name: 'Audit Hair', categoryId: '' },
    sa,
  );
  await deny('owner cannot add group', [403], 'POST', '/api/admin/service-groups', { name: 'x' }, oa);
  const gl = await ok('categories with groups', 'GET', '/api/admin/categories', null, sa);
  check(
    'group listed under its category',
    gl.categories.find((c) => c.id === gcat.id).groups.some((g) => g.id === g1.id),
  );
  const gd = await ok(
    'default service in group',
    'POST',
    '/api/admin/default-services',
    { name: 'Audit Grouped', category: 'audit hair', categoryId: gcat.id, duration: 10, price: 1 },
    sa,
  );
  check(
    'group name normalised',
    (await ok('defaults', 'GET', '/api/admin/default-services', null, sa)).services.find((x) => x.id === gd.id)
      .category === 'Audit Hair',
  );
  const otherCat = await ok('second category', 'POST', '/api/admin/categories', { name: 'Audit Other Cat' }, sa);
  await ok(
    'group only in first category',
    'POST',
    '/api/admin/service-groups',
    { name: 'Audit Only Here', categoryId: gcat.id },
    sa,
  );
  await deny(
    'group from another category refused',
    [400],
    'POST',
    '/api/admin/default-services',
    { name: 'Bad', category: 'Audit Only Here', categoryId: otherCat.id, duration: 10, price: 1 },
    sa,
  );
  await deny(
    'unknown group refused',
    [400],
    'POST',
    '/api/admin/default-services',
    { name: 'Bad2', category: 'Nope', categoryId: gcat.id, duration: 10, price: 1 },
    sa,
  );
  await ok('rename group', 'PUT', '/api/admin/service-groups/' + g1.id, { name: 'Audit Hair & Beard' }, sa);
  check(
    'default service follows rename',
    (await ok('defaults 2', 'GET', '/api/admin/default-services', null, sa)).services.find((x) => x.id === gd.id)
      .category === 'Audit Hair & Beard',
  );
  await ok('delete group', 'DELETE', '/api/admin/service-groups/' + g1.id, null, sa);
  check(
    'default service kept without group',
    (await ok('defaults 3', 'GET', '/api/admin/default-services', null, sa)).services.find((x) => x.id === gd.id)
      .category === '',
  );
  await ok('admin sets owner A category', 'PUT', '/api/admin/salons/' + salA.id, { categoryId: gcat.id }, sa);
  await ok(
    'add group again for owner',
    'POST',
    '/api/admin/service-groups',
    { name: 'Audit Owner Group', categoryId: gcat.id },
    sa,
  );
  check(
    'owner gets group suggestions',
    (await ok('owner data groups', 'GET', '/api/owner/data', null, oa)).serviceGroups.includes('Audit Owner Group'),
  );

  // ---- 16. Reports (owner, staff, admin) with filters and CSV export ----
  const today = new Date().toISOString().slice(0, 10);
  const rep = await ok('owner report', 'GET', '/api/owner/reports', null, oa);
  check('owner report covers 30 days by default', rep.byDay.length === 30 && rep.range.to >= today.slice(0, 8));
  check(
    'owner report counts tokens and completed',
    rep.summary.tokens >= 3 && rep.summary.done >= 1 && rep.summary.cancelled >= 1,
  );
  check(
    'owner report has money and breakdowns',
    rep.summary.revenue > 0 && rep.byService.length > 0 && rep.byStaff.length > 0,
  );
  check('owner report has filter options', rep.options.branches.length >= 2 && rep.options.staff.length >= 2);
  check(
    'owner report rows hold token numbers',
    rep.rows.length === rep.summary.tokens && /^A?-?\d{3}|^#\d{3}/.test(rep.rows[0].token),
  );
  const repDone = await ok('owner report: status filter', 'GET', '/api/owner/reports?status=done', null, oa);
  check('status filter keeps only completed', repDone.rows.length && repDone.rows.every((r) => r.status === 'done'));
  const repStaff = await ok('owner report: staff filter', 'GET', '/api/owner/reports?staffId=' + stA1, null, oa);
  check(
    'staff filter keeps that staff only',
    repStaff.byStaff.every((x) => x.id === stA1 || x.services === 0),
  );
  const repBr = await ok('owner report: branch filter', 'GET', '/api/owner/reports?branchId=' + a2, null, oa);
  check(
    'branch filter excludes other branches',
    repBr.rows.every((r) => r.branch !== rep.rows.find((x) => x.id === tk1).branch),
  );
  const repCsv = await ok('owner report export', 'GET', '/api/owner/reports?export=1', null, oa);
  check(
    'owner CSV has header and every token',
    repCsv.csv.includes('Date,Time,Token,Customer') &&
      repCsv.csv.trim().split('\r\n').length === rep.summary.tokens + 1,
  );
  check('CSV file name has the dates', /^report-\d{4}-\d{2}-\d{2}-to-/.test(repCsv.fileName));
  await deny('report start after end', [400], 'GET', '/api/owner/reports?from=2026-02-01&to=2026-01-01', null, oa);
  await deny('report longer than a year', [400], 'GET', '/api/owner/reports?from=2020-01-01&to=2026-01-01', null, oa);
  await deny('bad report date', [400], 'GET', '/api/owner/reports?from=01-01-2026', null, oa);
  const myRep = await ok('staff report', 'GET', '/api/staff/reports?export=1', null, s1);
  check(
    'staff report shows own completed work',
    myRep.summary.done >= 1 && myRep.rows.every((r) => r.service) && myRep.csv.includes('Earned'),
  );
  await deny('staff cannot open owner report', [403], 'GET', '/api/owner/reports', null, s1);
  await deny('owner cannot open admin report', [403], 'GET', '/api/admin/reports', null, oa);
  await deny('anonymous cannot open reports', [401], 'GET', '/api/staff/reports');
  const adRep = await ok('admin report', 'GET', '/api/admin/reports?export=1', null, sa);
  check(
    'admin report lists businesses',
    adRep.rows.some((r) => r.name === 'Salon A') && adRep.summary.tokens >= rep.summary.tokens,
  );
  check('admin CSV has plan amounts', adRep.csv.includes('Plan amount') && adRep.summary.revenue !== null);
  const adCat = await ok('admin report: category filter', 'GET', '/api/admin/reports?categoryId=' + gcat.id, null, sa);
  check(
    'category filter keeps that category',
    adCat.rows.length >= 1 && adCat.rows.every((r) => r.category === 'Audit Groups Cat'),
  );
  await ok(
    'admin adds report team member',
    'POST',
    '/api/admin/team',
    { name: 'Team Rep', username: 'teamrep', password: 'Team@12345-bq', permissions: [] },
    sa,
  );
  const tRepTok = await login('teamrep', 'Team@12345-bq');
  const tRep = await ok('team report', 'GET', '/api/admin/reports?export=1', null, tRepTok);
  check(
    'team without revenue.view sees no money in report',
    tRep.summary.revenue === null && tRep.rows.every((r) => r.amount === null) && !tRep.csv.includes('Plan amount'),
  );

  // ---- 17. Landing page content and business sign-up ----
  const site0 = await ok('public site content', 'GET', '/api/public/site');
  check(
    'site has defaults for every section',
    site0.hero.title && site0.features.length >= 3 && site0.faqs.length >= 1 && site0.sections.plans === true,
  );
  check(
    'public site hides sign-up internals',
    site0.signup.enabled === true &&
      site0.signup.approval === false &&
      !('planName' in site0.signup) &&
      Array.isArray(site0.categories),
  );
  await deny('owner cannot edit site', [403], 'PUT', '/api/admin/site', { hero: { title: 'x' } }, oa);
  await deny('team cannot edit site', [403], 'PUT', '/api/admin/site', { hero: { title: 'x' } }, tRepTok);
  const adminSite = await ok('admin reads site', 'GET', '/api/admin/site', null, sa);
  const edited = JSON.parse(JSON.stringify(adminSite.content));
  edited.hero.title = 'Queues, sorted.';
  edited.features = [{ icon: 'nope', title: 'One feature', text: 'Only this one' }, { title: '' }];
  edited.sections.plans = false;
  edited.app.playUrl = 'https://play.google.com/store/apps/details?id=com.ibill.bquee';
  edited.signup = { enabled: true, mode: 'trial', trialDays: 30, planName: 'Trial' };
  const saved = await ok('admin saves site', 'PUT', '/api/admin/site', edited, sa);
  check(
    'site saved and cleaned',
    saved.content.hero.title === 'Queues, sorted.' &&
      saved.content.features.length === 1 &&
      saved.content.features[0].icon === 'check' &&
      saved.content.sections.plans === false,
  );
  await deny(
    'site rejects non-https store link',
    [400],
    'PUT',
    '/api/admin/site',
    { ...edited, app: { playUrl: 'javascript:alert(1)' } },
    sa,
  );
  await deny('site needs a hero title', [400], 'PUT', '/api/admin/site', { ...edited, hero: { title: '' } }, sa);
  const pub1 = await ok('public sees saved site', 'GET', '/api/public/site');
  check(
    'public site shows the edit',
    pub1.hero.title === 'Queues, sorted.' && pub1.signup.trialDays === 30 && pub1.app.playUrl.startsWith('https://'),
  );

  // ---- 17b. Search engines (SEO): the server sends finished pages, robots.txt and a sitemap ----
  const page = async (p) => {
    const r = await fetch(BASE + p);
    return { status: r.status, type: r.headers.get('content-type') || '', html: await r.text() };
  };
  const ldOf = (html) => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]) : null;
  };
  const home0 = await page('/');
  const ld0 = ldOf(home0.html);
  check(
    'home page: SEO title, description and canonical link in the HTML',
    /<title>Digital Token &amp; Queue System[^<]*\| BQuee<\/title>/.test(home0.html) &&
      /<meta name="description" content="Replace paper tokens and token machines[^"]{20,}"/.test(home0.html) &&
      /<link rel="canonical" href="http[^"]+\/" \/>/.test(home0.html),
  );
  check(
    'home page: link-preview tags (WhatsApp, LinkedIn, X)',
    /property="og:image" content="http[^"]+\/img\/og-image\.png"/.test(home0.html) &&
      /name="twitter:card" content="summary_large_image"/.test(home0.html),
  );
  check(
    'home page: the page text is in the HTML (heading shows the saved hero, every FAQ)',
    home0.html.includes('<h1>Queues, sorted.') &&
      home0.html.includes('Replace paper tokens and token machines</h2>') &&
      home0.html.includes('Queue management across the UAE, GCC, India and Europe</h2>') &&
      pub1.faqs.every((f) =>
        home0.html.includes(f.q.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')),
      ),
  );
  check(
    'home page: structured data for the organisation, website, software and FAQ',
    ld0 &&
      ['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage'].every((t) =>
        ld0['@graph'].some((g) => g['@type'] === t),
      ) &&
      ld0['@graph'].find((g) => g['@type'] === 'FAQPage').mainEntity.length === pub1.faqs.length,
  );
  const seoSaved = await ok(
    'admin saves the Google title and description',
    'PUT',
    '/api/admin/site',
    {
      ...edited,
      seo: { title: 'Token booking <for> salons', description: '' },
    },
    sa,
  );
  const home1 = await page('/');
  check(
    'saved Google title is used (and made safe); an empty description falls back to the default',
    seoSaved.content.seo.title === 'Token booking <for> salons' &&
      home1.html.includes('<title>Token booking &lt;for&gt; salons</title>') &&
      /<meta name="description" content="Replace paper tokens/.test(home1.html),
  );
  const { seo: _seo, replace: _replace, locations: _locations, ...olderEditor } = edited;
  await ok('an older editor without the new parts saves', 'PUT', '/api/admin/site', olderEditor, sa);
  const pub2 = await ok('public site after the older editor', 'GET', '/api/public/site');
  check(
    'an editor that doesn’t know the new parts never wipes them (built-in text returns)',
    pub2.replace.length >= 3 && pub2.locations.length >= 5 && pub2.seo.title.includes('BQuee'),
  );
  const robots = await page('/robots.txt');
  check(
    'robots.txt allows the site, blocks private areas and names the sitemap',
    robots.status === 200 &&
      /Allow: \//.test(robots.html) &&
      /Disallow: \/admin/.test(robots.html) &&
      /Disallow: \/t\//.test(robots.html) &&
      /Sitemap: http[^\s]+\/sitemap\.xml/.test(robots.html),
  );
  const adminData = await ok('admin data for business pages', 'GET', '/api/admin/data', null, sa);
  const liveBiz = adminData.salons.find((x) => x.active && !x.expired && x.slug);
  const sitemapXml = await page('/sitemap.xml');
  check(
    'sitemap lists the home page and live business pages',
    sitemapXml.status === 200 &&
      sitemapXml.type.includes('xml') &&
      /<loc>http[^<]+\/<\/loc>/.test(sitemapXml.html) &&
      sitemapXml.html.includes(`/s/${liveBiz.slug}</loc>`),
  );
  const bizPage = await page(`/s/${liveBiz.slug}`);
  check(
    'business page gets its own title, canonical link and business details',
    bizPage.status === 200 &&
      bizPage.html.includes(`<title>${liveBiz.name.replace(/&/g, '&amp;')}`) &&
      bizPage.html.includes(`/s/${liveBiz.slug}" />`) &&
      ldOf(bizPage.html)['@type'] === 'LocalBusiness',
  );
  for (const p of [
    '/login',
    '/signup',
    '/admin',
    '/owner',
    '/staff',
    `/s/${liveBiz.slug}/login`,
    '/t/abc123',
    '/b/abc123',
  ])
    check(`private page is hidden from Google: ${p}`, (await page(p)).html.includes('content="noindex, nofollow"'));
  const missing = await page('/no-such-page');
  const missingBiz = await page('/s/no-such-business');
  check(
    'unknown addresses and businesses answer 404 (still the app’s own page)',
    missing.status === 404 &&
      missingBiz.status === 404 &&
      missing.html.includes('id="root"') &&
      missing.html.includes('noindex'),
  );
  check('files still load normally', (await page('/manifest.webmanifest')).status === 200);
  const health = await ok('health check', 'GET', '/api/health');
  check(
    'health check shows the running code version',
    health.ok === true && typeof health.version === 'string' && health.version.length > 0,
  );
  await deny('unknown legal page', [404], 'GET', '/api/public/legal/cookies');
  for (const [p, title] of [
    ['/terms', 'Terms and Conditions'],
    ['/privacy', 'Privacy Policy'],
  ]) {
    const legalPage = await page(p);
    check(
      `${title}: indexable page with its full text and the contact details`,
      legalPage.status === 200 &&
        legalPage.html.includes(`<title>${title} | BQuee</title>`) &&
        legalPage.html.includes(`${p}" />`) &&
        !legalPage.html.includes('noindex') &&
        legalPage.html.includes('IBILL Software and Consultancy FZ-LLC') &&
        legalPage.html.includes('+971 56 570 8076') &&
        legalPage.html.includes('info@bquee.com') &&
        legalPage.html.includes('Al Hamra Industrial Zone-FZ'),
    );
    check(`${title} is in the sitemap`, sitemapXml.html.includes(`${p}</loc>`));
    const forApp = await ok(`${title} for the apps`, 'GET', `/api/public/legal${p}`);
    check(
      `${title}: the apps get the same text as the website, with the contact details`,
      forApp.title === title &&
        forApp.sections.length > 5 &&
        forApp.sections.every((x) => legalPage.html.includes(x.h.replace(/&/g, '&amp;').replace(/'/g, '&#39;'))) &&
        forApp.contact.company === 'IBILL Software and Consultancy FZ-LLC' &&
        forApp.contact.email === 'info@bquee.com',
    );
  }

  const su = {
    businessName: 'Signup Spa',
    ownerName: 'Sana Owner',
    mobile: '9876500011',
    email: 'sana@signup.test',
    username: 'sanaowner',
    password: 'Sana@12345-bq',
    categoryId: gcat.id,
    serviceMode: 'single',
    staffMode: 'single',
    package: 'Business',
  };
  const signedUp = await ok('business signs up', 'POST', '/api/public/signup', { ...su, role: 'superadmin' });
  check(
    'sign-up signs the new owner straight in – no authenticator app to set up',
    !signedUp.mfa && !!signedUp.token && signedUp.trialDays === 30,
  );
  const signed = await finishMfa(BASE, 'sanaowner', signedUp);
  check('a password sign-up has a password (Change password asks for it)', signed.user.hasPassword === true);
  check(
    'the owner is in; two-step sign-in is off but they may switch it on themselves',
    signed.token &&
      signed.user.role === 'owner' &&
      signed.user.mfa.required === false &&
      signed.user.mfa.optional === true &&
      signed.user.mfa.enabled === false,
  );
  check('a sign-up without an email code has an unconfirmed email', signed.user.emailVerified === false);
  const suData = await ok('new owner opens dashboard', 'GET', '/api/owner/data', null, signed.token);
  check('new business has a branch and trial plan', suData.branches.length === 1 && suData.salon.name === 'Signup Spa');
  const admSu = await ok('admin sees signed-up business', 'GET', '/api/admin/data', null, sa);
  const suRow = admSu.salons.find((x) => x.name === 'Signup Spa');
  check(
    'signed-up business is marked and active with expiry',
    suRow &&
      suRow.selfSignup === true &&
      suRow.active === true &&
      suRow.expiresAt &&
      suRow.plan === 'Trial' &&
      suRow.categoryId === gcat.id,
  );
  check('sign-up keeps one-service / one-staff choice', suRow.serviceMode === 'single' && suRow.staffMode === 'single');
  const suBranch = await ok('signed-up branch page', 'GET', '/api/public/branch/' + suData.branches[0].id);
  check(
    'booking form learns to skip both steps',
    suBranch.salon.serviceMode === 'single' && suBranch.salon.staffMode === 'single',
  );
  await deny('sign-up: username taken', [400, 409], 'POST', '/api/public/signup', { ...su, email: '' });
  await deny('sign-up: weak password', [400], 'POST', '/api/public/signup', {
    ...su,
    username: 'weakpw',
    email: '',
    password: '123',
  });
  await deny('sign-up: bad mobile', [400], 'POST', '/api/public/signup', {
    ...su,
    username: 'badmob',
    email: '',
    mobile: 'abc',
  });
  await deny('sign-up: bot field', [403], 'POST', '/api/public/signup', {
    ...su,
    username: 'botty',
    email: '',
    website: 'http://spam',
  });
  await ok(
    'admin switches sign-up to approval',
    'PUT',
    '/api/admin/site',
    { ...edited, signup: { enabled: true, mode: 'approval', trialDays: 14, planName: 'Pending' } },
    sa,
  );
  const pend = await ok('sign-up waiting for approval', 'POST', '/api/public/signup', {
    ...su,
    username: 'pendowner',
    email: 'pend@signup.test',
    businessName: 'Pending Clinic',
  });
  check('approval sign-up returns no session', pend.pending === true && !pend.token);
  await deny('pending owner cannot sign in yet', [401, 403], 'POST', '/api/login', {
    username: 'pendowner',
    password: 'Sana@12345-bq',
  });
  await ok('admin closes sign-up', 'PUT', '/api/admin/site', { ...edited, signup: { enabled: false } }, sa);
  await deny('closed sign-up refuses', [403], 'POST', '/api/public/signup', {
    ...su,
    username: 'closedone',
    email: '',
  });
  const reset = await ok('admin resets site to defaults', 'DELETE', '/api/admin/site', null, sa);
  check(
    'reset restores defaults',
    reset.content.hero.title === 'Digital token & queue system' && reset.content.signup.enabled === true,
  );

  // ---- 18. Customer app accounts, booking and history ----
  const cu = { name: 'Asha Customer', mobile: '98765 22222', email: 'Asha@Cust.test', password: 'Asha@12345' };
  const cs = await ok('customer signs up', 'POST', '/api/customer/signup', cu);
  check(
    'customer sign-up returns session',
    cs.token && cs.customer.mobile === '9876522222' && cs.customer.email === 'asha@cust.test',
  );
  await deny('customer: same mobile again', [409], 'POST', '/api/customer/signup', { ...cu, email: '' });
  await deny('customer: weak password', [400], 'POST', '/api/customer/signup', {
    ...cu,
    mobile: '9876522223',
    email: '',
    password: '1',
  });
  const cl = await ok('customer signs in by mobile', 'POST', '/api/customer/login', {
    login: '98765-22222',
    password: cu.password,
  });
  await deny('customer: wrong password', [401], 'POST', '/api/customer/login', {
    login: cu.mobile,
    password: 'nope12345',
  });
  await deny('customer token is not a staff session', [401], 'GET', '/api/me', null, cl.token);
  await deny('staff session is not a customer', [401], 'GET', '/api/customer/me', null, sa);
  const biz = await ok('customer lists businesses', 'GET', '/api/customer/businesses', null, cl.token);
  check(
    'business list has branches',
    biz.businesses.some((b) => b.branches.some((x) => x.id === a1)),
  );
  const ctk = await ok(
    'customer books from app',
    'POST',
    '/api/customer/book',
    { branchId: a1, items: [{ serviceId: svA }] },
    cl.token,
  );
  const hist = await ok('customer token history', 'GET', '/api/customer/tokens', null, cl.token);
  const mine = hist.tokens.find((x) => x.id === ctk.id);
  check(
    'history shows token with business and status',
    mine &&
      mine.business.name &&
      mine.branch.id === a1 &&
      mine.status === 'waiting' &&
      mine.customer.name === 'Asha Customer',
  );
  await ok('customer opens own token', 'GET', '/api/customer/tokens/' + ctk.id, null, cl.token);
  await deny('customer cannot open others token', [404], 'GET', '/api/customer/tokens/' + tk1, null, cl.token);
  const upd = await ok(
    'customer edits profile',
    'PUT',
    '/api/customer/me',
    { name: 'Asha K', email: 'asha@cust.test' },
    cl.token,
  );
  check('profile saved', upd.name === 'Asha K');
  await deny(
    'change password needs current',
    [400],
    'PUT',
    '/api/customer/me',
    { newPassword: 'NewPass123', currentPassword: 'bad' },
    cl.token,
  );
  const ac = await ok('admin lists customers', 'GET', '/api/admin/customers', null, sa);
  const acRow = ac.customers.find((x) => x.id === cs.customer.id);
  check(
    'admin sees customer with token count',
    acRow && acRow.tokens === 1 && acRow.email === 'asha@cust.test' && acRow.active === true,
  );
  await deny(
    'team member cannot disable customer',
    [401, 403],
    'PUT',
    '/api/admin/customers/' + cs.customer.id,
    { active: false },
    tt,
  );
  await ok('admin disables customer', 'PUT', '/api/admin/customers/' + cs.customer.id, { active: false }, sa);
  await deny('disabled customer signed out', [401, 403], 'GET', '/api/customer/me', null, cl.token);
  await deny('disabled customer cannot sign in', [403], 'POST', '/api/customer/login', {
    login: cu.mobile,
    password: cu.password,
  });
  await ok('admin enables customer', 'PUT', '/api/admin/customers/' + cs.customer.id, { active: true }, sa);
  const cl2 = await ok('customer signs in by email', 'POST', '/api/customer/login', {
    login: 'ASHA@cust.test',
    password: cu.password,
  });
  // Deletion is a request the super admin approves (section 24 covers every role).
  await deny(
    'delete request needs password',
    [400],
    'POST',
    '/api/customer/account-request',
    { kind: 'delete', reason: 'privacy', password: 'x' },
    cl2.token,
  );
  const cReq = await ok(
    'customer asks to delete account',
    'POST',
    '/api/customer/account-request',
    { kind: 'delete', reason: 'privacy', password: cu.password },
    cl2.token,
  );
  check('request waiting', cReq.request && cReq.request.status === 'pending' && cReq.request.kind === 'delete');
  await ok(
    'admin approves customer deletion',
    'POST',
    '/api/admin/account-requests/' + cReq.request.id + '/decide',
    { action: 'approve' },
    sa,
  );
  await deny('deleted account gone', [401], 'GET', '/api/customer/me', null, cl2.token);

  // ---- 19. Super admin controls each business's menus and features ----
  const oaF = await login('owna', 'Owner@1234-bq');
  const admF = await ok('admin data with features', 'GET', '/api/admin/data', null, sa);
  const rowA = admF.salons.find((x) => x.id === A.salon.id);
  check(
    'features default to everything on',
    rowA.features.menus.offers === true && rowA.features.maskContacts === false && rowA.features.reportExport === true,
  );
  const meF = await ok('owner /api/me has features', 'GET', '/api/me', null, oaF);
  check('signed-in owner sees features', meF.features && meF.features.menus.tokens === true);
  await deny(
    'owner cannot change features',
    [403],
    'PUT',
    '/api/admin/salons/' + A.salon.id + '/features',
    { features: { maskContacts: false } },
    oaF,
  );
  const setF = await ok(
    'admin switches features',
    'PUT',
    '/api/admin/salons/' + A.salon.id + '/features',
    {
      features: {
        maskContacts: true,
        reportExport: false,
        staffReports: false,
        menus: { offers: false, bogus: false },
      },
    },
    sa,
  );
  check(
    'saved features',
    setF.features.maskContacts === true &&
      setF.features.menus.offers === false &&
      setF.features.menus.tokens === true &&
      !('bogus' in setF.features.menus),
  );
  const dF = await ok('owner data after switch', 'GET', '/api/owner/data', null, oaF);
  check('owner data carries features', dF.features.menus.offers === false && dF.features.maskContacts === true);
  const withMobile = dF.tokens.filter((x) => x.customer.mobile);
  check('owner sees masked mobiles', withMobile.length > 0 && withMobile.every((x) => x.customer.mobile.includes('•')));
  check(
    'owner sees masked emails',
    dF.tokens.every((x) => !x.customer.email || x.customer.email.includes('•')),
  );
  const tlF = await ok('owner token list masked', 'GET', '/api/owner/tokens', null, oaF);
  check(
    'token list masked',
    tlF.every((x) => !x.customer.mobile || x.customer.mobile.includes('•')),
  );
  const tvF = await ok('owner opens token', 'GET', '/api/public/token/' + withMobile[0].id, null, oaF);
  check('token page masked for owner', tvF.token.customer.mobile.includes('•'));
  const repF = await ok('owner report', 'GET', '/api/owner/reports', null, oaF);
  check('report mobiles masked', repF.rows.length > 0 && repF.rows.every((x) => !x.mobile || x.mobile.includes('•')));
  await deny('report export switched off', [403], 'GET', '/api/owner/reports?export=1', null, oaF);
  await deny('offers menu switched off', [403], 'POST', '/api/owner/offers', { title: 'Nope' }, oaF);
  const s1F = await login('s1', 'Staff@1234-bq');
  await deny('staff reports switched off', [403], 'GET', '/api/staff/reports', null, s1F);
  const qF = await ok('staff queue', 'GET', '/api/staff/queue', null, s1F);
  check(
    'staff queue masked + features',
    qF.features.maskContacts === true && qF.tokens.every((x) => !x.customer.mobile || x.customer.mobile.includes('•')),
  );
  const offF = await ok(
    'admin switches everything back on',
    'PUT',
    '/api/admin/salons/' + A.salon.id + '/features',
    { features: { maskContacts: false, reportExport: true, staffReports: true, menus: { offers: true } } },
    sa,
  );
  check('restored', offF.features.menus.offers === true && offF.features.maskContacts === false);
  const tvF2 = await ok('owner opens token again', 'GET', '/api/public/token/' + withMobile[0].id, null, oaF);
  check('contact visible again', !tvF2.token.customer.mobile.includes('•'));
  await ok('report export back on', 'GET', '/api/owner/reports?export=1', null, oaF);

  // ---- 19b. Bulk change: several businesses at once, only the settings sent ----
  const bulkB = await ok(
    'admin adds a second business for bulk',
    'POST',
    '/api/admin/salons',
    { name: 'Bulk Two', username: 'bulktwo', password: 'Owner@1234-bq' },
    sa,
  );
  const both = [A.salon.id, bulkB.id];
  await deny(
    'owner cannot bulk change',
    [403],
    'POST',
    '/api/admin/salons/bulk',
    { ids: both, features: { maskContacts: true } },
    oaF,
  );
  await deny(
    'team member without permission cannot bulk change features',
    [403],
    'POST',
    '/api/admin/salons/bulk',
    { ids: both, features: { maskContacts: true } },
    tRepTok,
  );
  await deny(
    'team member without permission cannot bulk disable',
    [403],
    'POST',
    '/api/admin/salons/bulk',
    { ids: both, active: false },
    tRepTok,
  );
  await deny(
    'bulk needs businesses',
    [400],
    'POST',
    '/api/admin/salons/bulk',
    { ids: [], features: { maskContacts: true } },
    sa,
  );
  await deny('bulk needs a change', [400], 'POST', '/api/admin/salons/bulk', { ids: both }, sa);
  await deny(
    'bulk with unknown business',
    [404],
    'POST',
    '/api/admin/salons/bulk',
    { ids: [A.salon.id, 'nope'], features: { maskContacts: true } },
    sa,
  );
  await ok(
    'admin switches the second business’s reviews menu off',
    'PUT',
    '/api/admin/salons/' + bulkB.id + '/features',
    { features: { menus: { reviews: false } } },
    sa,
  );
  const bulk1 = await ok(
    'admin hides contacts for both',
    'POST',
    '/api/admin/salons/bulk',
    { ids: [...both, A.salon.id], features: { maskContacts: true, menus: { offers: false } } },
    sa,
  );
  check('bulk counts each business once', bulk1.updated === 2);
  const bd1 = await ok('admin data after bulk', 'GET', '/api/admin/data', null, sa);
  const ba = bd1.salons.find((x) => x.id === A.salon.id),
    bb = bd1.salons.find((x) => x.id === bulkB.id);
  check(
    'both businesses changed',
    ba.features.maskContacts && bb.features.maskContacts && !ba.features.menus.offers && !bb.features.menus.offers,
  );
  check(
    'settings not sent stay as they were',
    bb.features.menus.reviews === false && ba.features.menus.reviews === true && ba.features.reportExport === true,
  );
  const dBulk = await ok('owner A data after bulk', 'GET', '/api/owner/data', null, oaF);
  check(
    'owner A sees masked contacts',
    dBulk.features.maskContacts && dBulk.tokens.every((x) => !x.customer.mobile || x.customer.mobile.includes('•')),
  );
  await ok('admin disables both', 'POST', '/api/admin/salons/bulk', { ids: both, active: false }, sa);
  const bd2 = await ok('admin data after bulk disable', 'GET', '/api/admin/data', null, sa);
  check(
    'both disabled, features unchanged',
    bd2.salons.filter((x) => both.includes(x.id)).every((x) => !x.active && x.features.maskContacts),
  );
  await ok(
    'admin enables both and restores features',
    'POST',
    '/api/admin/salons/bulk',
    { ids: both, active: true, features: { maskContacts: false, menus: { offers: true, reviews: true } } },
    sa,
  );
  const bd3 = await ok('admin data after restore', 'GET', '/api/admin/data', null, sa);
  check(
    'both back to normal',
    bd3.salons
      .filter((x) => both.includes(x.id))
      .every((x) => x.active && !x.features.maskContacts && x.features.menus.offers && x.features.menus.reviews),
  );

  // ---- 20. Who onboarded each business, and referral links ----
  const obd = await ok('admin data with onboarding', 'GET', '/api/admin/data', null, sa);
  const obA = obd.salons.find((x) => x.id === A.salon.id);
  check(
    'admin-created business shows its creator',
    obA.onboard.source === 'admin' && obA.onboard.byName && obA.onboard.channel === 'web',
  );
  const rl = await ok('admin gets referral links', 'GET', '/api/admin/referral-links', null, sa);
  const ref1 = rl.links[0];
  check(
    'everyone starts with one link',
    rl.links.length === 1 && ref1.code && ref1.path === '/?ref=' + ref1.code && ref1.label === 'My link',
  );
  const fb = await ok('admin makes labelled link', 'POST', '/api/admin/referral-links', { label: 'Facebook ads' }, sa);
  check('labelled link made', fb.label === 'Facebook ads' && fb.code !== ref1.code && fb.active === true);
  await deny('label needed', [400], 'POST', '/api/admin/referral-links', { label: '' }, sa);
  const inv = await ok('public sees who invited', 'GET', '/api/public/referral/' + fb.code.toUpperCase());
  check('invite shows name', !!inv.name);
  await deny('bad referral code', [404], 'GET', '/api/public/referral/zzzzzz');
  await ok(
    'sign-up opened again',
    'PUT',
    '/api/admin/site',
    { ...reset.content, signup: { enabled: true, mode: 'trial', trialDays: 14, planName: 'Trial' } },
    sa,
  );
  const pubSite = await ok('public site has packages', 'GET', '/api/public/site');
  check('pricing on with packages', pubSite.sections.plans === true && pubSite.plans.length > 0);
  // Prices in each visitor's currency (test servers use the built-in rates: 1 USD = 88 INR = 3.6725 AED).
  const bizPlan = pubSite.plans.find((p) => p.name === 'Business');
  check(
    'each package priced in all 8 currencies (UAE, India, GCC, US$)',
    bizPlan.prices.INR === '₹999' &&
      bizPlan.prices.AED === 'AED 42' &&
      bizPlan.prices.USD === '$12' &&
      bizPlan.prices.KWD === 'KWD 3.5' &&
      pubSite.currencies.length === 8 &&
      pubSite.currencies.find((c) => c.code === 'AED').countries.includes('AE') &&
      pubSite.defaultCurrency === 'USD',
  );
  check('"Free" and "Talk to us" stay as words', pubSite.plans.filter((p) => !p.prices).length === 2);

  // Your currencies: ₹, AED, SAR, £ with rates; fixed ₹999 / AED 149 / $39. Saudi and UK = US$ × rate.
  await deny(
    'a currency code must be real',
    [400],
    'PUT',
    '/api/admin/site',
    { ...reset.content, currencies: [{ code: 'XYZ', rate: 1 }] },
    sa,
  );
  await deny(
    'a currency needs a rate',
    [400],
    'PUT',
    '/api/admin/site',
    { ...reset.content, currencies: [{ code: 'GBP', rate: '' }] },
    sa,
  );
  await deny(
    'fixed prices must be readable',
    [400],
    'PUT',
    '/api/admin/site',
    { ...reset.content, plans: reset.content.plans.map((p) => ({ ...p, fixedPrices: '₹999, banana' })) },
    sa,
  );
  const priced = await ok(
    'admin lists currencies and sets fixed prices',
    'PUT',
    '/api/admin/site',
    {
      ...reset.content,
      plans: reset.content.plans.map((p) => (p.name === 'Business' ? { ...p, fixedPrices: '₹999, AED 149, $39' } : p)),
      currencies: [
        { code: 'INR', rate: '88' },
        { code: 'aed', rate: '3.6725' },
        { code: 'SAR', rate: '3.80' },
        { code: 'GBP', rate: '0.79' },
        { code: '', rate: '' },
      ],
    },
    sa,
  );
  check(
    'currencies saved (codes in capitals, empty row dropped)',
    priced.content.currencies.map((c) => c.code).join() === 'INR,AED,SAR,GBP' &&
      priced.content.currencies[2].rate === 3.8,
  );
  const pubFixed = await ok('public site from Dubai', 'GET', '/api/public/site?tz=Asia%2FDubai');
  const biz2 = pubFixed.plans.find((p) => p.name === 'Business');
  check(
    'India ₹999, UAE AED 149, US$ $39 as typed; Saudi $39 × 3.80 = SAR 149; UK $39 × 0.79 = £31',
    biz2.prices.INR === '₹999' &&
      biz2.prices.AED === 'AED 149' &&
      biz2.prices.USD === '$39' &&
      biz2.prices.SAR === 'SAR 149' &&
      biz2.prices.GBP === '£31',
    JSON.stringify(biz2.prices),
  );
  check('a visitor in Dubai is offered AED', pubFixed.currencyHint === 'AED');
  check(
    'a visitor in Pakistan (PKR not listed) is offered US$',
    (await ok('public site from Karachi', 'GET', '/api/public/site?tz=Asia%2FKarachi')).currencyHint === 'USD',
  );
  check('no outside rate service any more', !('ratesUpdatedAt' in pubFixed));

  // "Get the BQuee app" buttons on business pages: links from the super admin, switch per business / in bulk.
  await deny(
    'customer app link must be https',
    [400],
    'PUT',
    '/api/admin/site',
    { ...reset.content, customerApp: { playUrl: 'javascript:alert(1)' } },
    sa,
  );
  await ok(
    'admin adds the customer app store link',
    'PUT',
    '/api/admin/site',
    {
      ...reset.content,
      customerApp: { playUrl: 'https://play.google.com/store/apps/details?id=com.bquee.customer', appStoreUrl: '' },
    },
    sa,
  );
  const appBiz = (await ok('admin data for app buttons', 'GET', '/api/admin/data', null, sa)).salons[0];
  const appPage1 = await ok('business page with app buttons', 'GET', '/api/public/salon/' + appBiz.slug);
  check(
    'business page shows the app buttons that have links',
    appPage1.appLinks &&
      /^https:\/\/play\.google\.com\//.test(appPage1.appLinks.play) &&
      appPage1.appLinks.appStore === '',
  );
  await ok(
    'switch app buttons off for one business',
    'PUT',
    `/api/admin/salons/${appBiz.id}/features`,
    { features: { appButtons: false } },
    sa,
  );
  check(
    '…that business page has none',
    (await ok('page after switch-off', 'GET', '/api/public/salon/' + appBiz.slug)).appLinks === null,
  );
  await ok(
    'switch app buttons on in bulk',
    'POST',
    '/api/admin/salons/bulk',
    { ids: [appBiz.id], features: { appButtons: true } },
    sa,
  );
  check(
    '…bulk switch brings them back',
    !!(await ok('page after bulk', 'GET', '/api/public/salon/' + appBiz.slug)).appLinks,
  );

  // Section titles of the home page are editable; an empty title goes back to the built-in one.
  const headed = await ok(
    'admin renames section titles',
    'PUT',
    '/api/admin/site',
    {
      ...reset.content,
      headings: {
        ...reset.content.headings,
        plans: { kicker: 'Plans', title: 'Prices for every size', text: 'Pick one.' },
        faqs: { kicker: 'FAQ', title: '', text: '' },
      },
    },
    sa,
  );
  check(
    'new pricing title saved; empty FAQ title back to the built-in one',
    headed.content.headings.plans.title === 'Prices for every size' &&
      headed.content.headings.faqs.title === 'Questions, answered' &&
      headed.content.headings.features.title === 'Everything your queue needs',
  );
  const homeHtml = await (await fetch(BASE + '/')).text();
  check('Google sees the new section title too', homeHtml.includes('Prices for every size'));
  await deny('package required when pricing is on', [400], 'POST', '/api/public/signup', {
    businessName: 'No Pkg',
    ownerName: 'N',
    mobile: '9876500097',
    username: 'nopkg',
    password: 'NoPkg@12345',
  });
  await ok('business signs up through FB link (app)', 'POST', '/api/public/signup', {
    businessName: 'Ref Clinic',
    categoryId: gcat.id,
    ownerName: 'Ravi',
    mobile: '9876500099',
    username: 'refowner',
    password: 'Refer@12345-bq',
    ref: fb.code,
    channel: 'app',
    package: 'Business',
  });
  await ok('business signs up with bad code', 'POST', '/api/public/signup', {
    businessName: 'Plain Shop',
    categoryId: gcat.id,
    ownerName: 'Lata',
    mobile: '9876500098',
    username: 'plainowner',
    password: 'Plain@12345-bq',
    ref: 'nope99',
    package: 'Starter',
  });
  const ob2 = await ok('admin data after referrals', 'GET', '/api/admin/data', null, sa);
  const rc = ob2.salons.find((x) => x.name === 'Ref Clinic');
  const pl = ob2.salons.find((x) => x.name === 'Plain Shop');
  check(
    'referral sign-up credited with label',
    rc.onboard.source === 'referral' &&
      rc.onboard.channel === 'app' &&
      rc.onboard.byName === obA.onboard.byName &&
      rc.onboard.label === 'Facebook ads',
  );
  check('package saved as plan', rc.signupPackage === 'Business' && rc.plan === 'Business' && rc.amount === 999);
  await ok('UAE business signs up (prices shown in AED)', 'POST', '/api/public/signup', {
    businessName: 'Dubai Lounge',
    categoryId: gcat.id,
    ownerName: 'Omar',
    mobile: '971501234567',
    username: 'dubaiowner',
    password: 'Dubai@12345-bq',
    package: 'Business',
    currency: 'AED',
    amount: 1, // a browser can't choose its own price
  });
  const ob2b = await ok('admin data after UAE sign-up', 'GET', '/api/admin/data', null, sa);
  const dxb = ob2b.salons.find((x) => x.name === 'Dubai Lounge');
  check('UAE sign-up: AED 42 a month, business currency AED', dxb.amount === 42 && dxb.currency === 'AED');
  check('no currency sent → the price’s own (₹)', rc.currency === '₹');
  check('unknown code = direct sign-up', pl.onboard.source === 'signup' && !pl.onboard.byName && pl.plan === 'Starter');
  const rl2 = await ok('link counts', 'GET', '/api/admin/referral-links', null, sa);
  check('FB link counted', rl2.links.find((l) => l.id === fb.id).referred === 1 && Array.isArray(rl2.people));
  const off = await ok(
    'switch FB link off',
    'PUT',
    '/api/admin/referral-links/' + fb.id,
    { active: false, label: 'FB ads Nov' },
    sa,
  );
  check('link off and renamed', off.active === false && off.label === 'FB ads Nov');
  await deny('switched-off link stops working', [404], 'GET', '/api/public/referral/' + fb.code);
  const ob3 = await ok('admin data after rename', 'GET', '/api/admin/data', null, sa);
  check('business shows new label', ob3.salons.find((x) => x.name === 'Ref Clinic').onboard.label === 'FB ads Nov');
  await deny('owner has no referral links', [403], 'GET', '/api/admin/referral-links', null, oaF);
  await ok(
    'admin turns pricing off',
    'PUT',
    '/api/admin/site',
    { ...reset.content, sections: { ...reset.content.sections, plans: false } },
    sa,
  );
  const noType = await request('POST', '/api/public/signup', {
    businessName: 'No Type Shop',
    ownerName: 'T',
    mobile: '9876500095',
    username: 'notypeshop',
    password: 'NoType@12345',
  });
  check(
    'business type is required when types exist',
    noType.status === 400 && noType.data.error === 'Choose your business type',
  );
  await ok('no package needed when pricing is off', 'POST', '/api/public/signup', {
    businessName: 'Free Shop',
    categoryId: gcat.id,
    ownerName: 'F',
    mobile: '9876500096',
    username: 'freeshop',
    password: 'Free@12345',
  });

  // ---- 21. Support tickets ----
  const tk = await ok(
    'owner raises ticket',
    'POST',
    '/api/owner/tickets',
    { category: 'bug', subject: 'QR not scanning', message: 'Camera shows black screen' },
    oaF,
  );
  check(
    'ticket created open with number',
    tk.status === 'open' && tk.number >= 1001 && tk.messages.length === 1 && tk.category === 'bug',
  );
  await deny('ticket needs subject', [400], 'POST', '/api/owner/tickets', { message: 'x' }, oaF);
  const ownB = await login('refowner', 'Refer@12345-bq');
  await deny('other business cannot see ticket', [404], 'GET', '/api/owner/tickets/' + tk.id, null, ownB);
  const at = await ok('admin lists tickets', 'GET', '/api/admin/tickets', null, sa);
  const atRow = at.tickets.find((x) => x.id === tk.id);
  check(
    'admin sees new unread ticket',
    atRow && atRow.unread === true && atRow.business === 'Salon A' && at.counts.open >= 1,
  );
  const sRep = await ok(
    'admin replies and starts work',
    'POST',
    '/api/admin/tickets/' + tk.id + '/reply',
    { message: 'Looking into it', status: 'in_progress', priority: 'high' },
    sa,
  );
  check(
    'status and priority changed',
    sRep.status === 'in_progress' && sRep.priority === 'high' && sRep.messages.some((m) => m.status === 'in_progress'),
  );
  await deny('empty team reply', [400], 'POST', '/api/admin/tickets/' + tk.id + '/reply', {}, sa);
  const ol = await ok('owner list shows reply', 'GET', '/api/owner/tickets', null, oaF);
  check('owner sees unread reply', ol.unread === 1 && ol.tickets[0].status === 'in_progress');
  await ok('admin resolves', 'POST', '/api/admin/tickets/' + tk.id + '/reply', { status: 'resolved' }, sa);
  const reo = await ok(
    'owner replies to resolved ticket',
    'POST',
    '/api/owner/tickets/' + tk.id + '/reply',
    { message: 'Still happening' },
    oaF,
  );
  check('reply reopens ticket', reo.status === 'open');
  await deny('owner cannot use admin tickets', [403], 'GET', '/api/admin/tickets', null, oaF);
  await deny('admin cannot use owner tickets', [403], 'GET', '/api/owner/tickets', null, sa);

  // ---- 22. Price per branch ----
  await ok(
    'create salon for branch prices',
    'POST',
    '/api/admin/salons',
    { name: 'Price Shop', username: 'pricey', password: 'Price@12345-bq' },
    sa,
  );
  const op = await login('pricey', 'Price@12345-bq');
  const pd = await ok('price shop data', 'GET', '/api/owner/data', null, op);
  const p1 = pd.branches[0].id;
  const p2 = (await ok('price shop 2nd branch', 'POST', '/api/owner/branches', { name: 'City', prefix: 'C' }, op)).id;
  const pAll = (
    await ok(
      'default service with a branch price',
      'POST',
      '/api/owner/services',
      { name: 'Wash', duration: 20, price: 200, branchPrices: { [p2]: 250, [p1]: '' } },
      op,
    )
  ).id;
  const pSome = (
    await ok(
      'service at one branch only',
      'POST',
      '/api/owner/services',
      { name: 'Spa', duration: 30, price: 500, branchIds: [p2], branchPrices: { [p2]: 650, [p1]: 999 } },
      op,
    )
  ).id;
  await ok(
    'price shop staff at City',
    'POST',
    '/api/owner/staff',
    { name: 'PC', branchId: p2, serviceIds: [pAll, pSome], username: 'pricestaff', password: 'Staff@1234-bq' },
    op,
  );
  await ok(
    'price shop staff at main',
    'POST',
    '/api/owner/staff',
    { name: 'PM', branchId: p1, serviceIds: [pAll], username: 'pricemain', password: 'Staff@1234-bq' },
    op,
  );
  const pd2 = await ok('price shop data again', 'GET', '/api/owner/data', null, op);
  const wash = pd2.services.find((x) => x.id === pAll),
    spa = pd2.services.find((x) => x.id === pSome);
  check(
    'owner sees branch prices (blank = normal price)',
    wash.price === 200 &&
      wash.branchPrices[p2] === 250 &&
      wash.branchPrices[p1] === undefined &&
      wash.branchIds.length === 0,
  );
  check(
    'price for an unselected branch is dropped',
    spa.branchPrices[p2] === 650 && spa.branchPrices[p1] === undefined,
  );
  const brMain = await ok('booking page main branch', 'GET', '/api/public/branch/' + p1);
  const brCity = await ok('booking page City branch', 'GET', '/api/public/branch/' + p2);
  check(
    'main branch shows normal price',
    brMain.services.find((x) => x.id === pAll).price === 200 && !brMain.services.some((x) => x.id === pSome),
  );
  check(
    'City branch shows its own prices',
    brCity.services.find((x) => x.id === pAll).price === 250 &&
      brCity.services.find((x) => x.id === pSome).price === 650,
  );
  const ldCity = await ok('City landing', 'GET', '/api/public/landing/' + p2);
  check('single-branch landing shows branch price', ldCity.services.find((x) => x.id === pAll).price === 250);
  const tkCityId = (
    await ok('book at City', 'POST', '/api/public/book', {
      branchId: p2,
      name: 'P',
      mobile: '9876500111',
      items: [{ serviceId: pAll }, { serviceId: pSome }],
    })
  ).id;
  const tkMainId = (
    await ok('book at main', 'POST', '/api/public/book', {
      branchId: p1,
      name: 'Q',
      mobile: '9876500112',
      items: [{ serviceId: pAll }],
    })
  ).id;
  const tkCity = (await ok('City token', 'GET', '/api/public/token/' + tkCityId)).token;
  const tkMain = (await ok('main token', 'GET', '/api/public/token/' + tkMainId)).token;
  check(
    'token charges City prices',
    tkCity.items
      .map((i) => i.price)
      .sort()
      .join() === '250,650' && tkCity.total === 900,
  );
  check('token charges normal price at main', tkMain.items[0].price === 200 && tkMain.total === 200);
  await ok(
    'change back to one price',
    'PUT',
    '/api/owner/services/' + pAll,
    { name: 'Wash', duration: 20, price: 210, branchPrices: {} },
    op,
  );
  const brCity2 = await ok('City after reset', 'GET', '/api/public/branch/' + p2);
  check('cleared branch price falls back to normal price', brCity2.services.find((x) => x.id === pAll).price === 210);
  const pst = await login('pricestaff', 'Staff@1234-bq');
  await ok(
    'price shop sets City price again',
    'PUT',
    '/api/owner/services/' + pAll,
    { name: 'Wash', duration: 20, price: 210, branchPrices: { [p2]: 260 } },
    op,
  );
  const opts = await ok('staff add-service list', 'GET', '/api/token/' + tkCity.id + '/services', null, pst);
  check(
    'staff add-service list shows branch price',
    (opts.services || []).some((x) => x.id === pAll && x.price === 260),
  );

  // ---- 23. Uploads: only real pictures, no hidden code ----
  const png = fixture('ok.png'),
    jpg = fixture('ok.jpg'),
    webp = fixture('ok.webp');
  const upload = (label, photo) => request('POST', '/api/owner/testimonials', { name: 'U', text: label, photo }, op);
  const accepted = [];
  for (const [mime, bytes] of [
    ['image/png', png],
    ['image/jpeg', jpg],
    ['image/webp', webp],
  ]) {
    const r = await upload('real ' + mime, dataUrl(mime, bytes));
    check('real ' + mime + ' accepted', r.status === 200);
  }
  const list = await ok('reviews with photos', 'GET', '/api/owner/data', null, op);
  for (const t of list.testimonials.filter((x) => x.photo)) accepted.push(t.photo);
  check(
    'three photos stored with safe names',
    accepted.length >= 3 && accepted.every((u) => /^\/uploads\/[a-f0-9]+\.(png|jpg|webp)$/.test(u)),
  );
  const served = await fetch(BASE + accepted[0]);
  check(
    'photo served as an image that can never run code',
    /^image\//.test(served.headers.get('content-type')) &&
      /sandbox/.test(served.headers.get('content-security-policy') || '') &&
      served.headers.get('x-content-type-options') === 'nosniff',
  );

  const attacks = [
    ['script hidden after a PNG', dataUrl('image/png', Buffer.concat([png, Buffer.from('<script>alert(1)</script>')]))],
    [
      'PHP inside a JPG comment',
      dataUrl(
        'image/jpeg',
        Buffer.concat([
          jpg.subarray(0, 2),
          Buffer.from([0xff, 0xfe, 0, 24]),
          Buffer.from('<?php system($_GET[c]);'),
          jpg.subarray(2),
        ]),
      ),
    ],
    ['web page named as PNG', dataUrl('image/png', Buffer.from('<html><body onload=alert(1)>hi</body></html>'))],
    [
      'SVG picture with script',
      'data:image/svg+xml;base64,' +
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64'),
    ],
    ['PDF named as JPG', dataUrl('image/jpeg', Buffer.from('%PDF-1.4\n1 0 obj<</JS(app.alert(1))>>endobj'))],
    ['ZIP hidden after a JPG', dataUrl('image/jpeg', Buffer.concat([jpg, Buffer.from('PK\x03\x04 hidden.zip')]))],
    [
      'PNG with fake 20000 px size',
      dataUrl(
        'image/png',
        (() => {
          const b = Buffer.from(png);
          b.writeUInt32BE(20000, 16);
          b.writeUInt32BE(20000, 20);
          return b;
        })(),
      ),
    ],
    ['cut-off PNG', dataUrl('image/png', png.subarray(0, 60))],
    ['picture over the size limit', dataUrl('image/png', fixture('big.png'))],
    ['not base64 at all', 'data:image/png;base64,<<<>>>'],
    ['a link instead of a file', 'https://evil.example/x.png'],
    ['javascript link', 'javascript:alert(1)'],
  ];
  // Every refusal says the reason in plain words (no codes, no "Broken file").
  const why = {
    'picture over the size limit': /This picture is [\d.]+ (KB|MB) – the largest allowed here is [\d.]+ (KB|MB)/,
    'cut-off PNG': /damaged or incomplete/,
    'ZIP hidden after a JPG': /extra hidden data after the picture/,
    'PNG with fake 20000 px size': /too large in pixels/,
    'not base64 at all': /PNG, JPG or WEBP/,
  };
  for (const [label, photo] of attacks) {
    const r = await upload(label, photo);
    check('refused: ' + label, r.status === 400);
    if (why[label]) check('…and says why: ' + label, why[label].test(r.data.error || ''), r.data.error);
  }
  const after = await ok('reviews after attacks', 'GET', '/api/owner/data', null, op);
  check('no attack was stored', after.testimonials.filter((x) => x.photo).length === accepted.length);
  // Sent raw (fetch would tidy "../" away before sending).
  const raw = (rawPath) =>
    new Promise((resolve) => {
      const u = new URL(BASE);
      require('http')
        .get({ host: u.hostname, port: u.port, path: rawPath }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode, body }));
        })
        .on('error', () => resolve({ status: 0, body: '' }));
    });
  for (const bad of [
    '/uploads/../../etc/passwd',
    '/uploads/%2e%2e/%2e%2e/package.json',
    '/uploads/..%2f..%2fpackage.json',
    '/uploads/x.html',
    '/uploads/abc.svg',
    '/uploads/' + 'a'.repeat(30) + '.php',
  ]) {
    const r = await raw(bad);
    const safe = r.status === 404 || (r.status === 200 && r.body.includes('<div id="root"'));
    check('upload path blocked: ' + bad, safe && !/root:x:|"dependencies"/.test(r.body));
  }
  for (const bad of ['/../package.json', '/%2e%2e/src/config.js', '/..%2f.env'])
    check('no server file leaks: ' + bad, !/"dependencies"|DATABASE_URL|module\.exports/.test((await raw(bad)).body));
  const huge = await fetch(BASE + '/api/owner/testimonials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + op },
    body: JSON.stringify({ name: 'x', text: 'x', photo: 'data:image/png;base64,' + 'A'.repeat(5 * 1024 * 1024) }),
  }).catch(() => ({ status: 413 }));
  check('5 MB request refused', huge.status === 413 || huge.status === 400);

  // Compression: lists are sent smaller; sign-in answers never are (BREACH).
  const zlib = require('zlib');
  const rawGet = (url, headers) =>
    new Promise((resolve, reject) => {
      const u = new URL(BASE + url);
      const req = require('http').request({ hostname: u.hostname, port: u.port, path: u.pathname, headers }, (res) => {
        const parts = [];
        res.on('data', (c) => parts.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
      });
      req.on('error', reject);
      req.end();
    });
  const auth = { Authorization: 'Bearer ' + sa };
  const plain = await rawGet('/api/admin/data', auth);
  const gz = await rawGet('/api/admin/data', { ...auth, 'Accept-Encoding': 'gzip' });
  const br = await rawGet('/api/admin/data', { ...auth, 'Accept-Encoding': 'gzip, deflate, br' });
  check('API answer not compressed when the client can’t unpack it', !plain.headers['content-encoding']);
  check(
    'API answer gzip-compressed for the apps, same data',
    gz.headers['content-encoding'] === 'gzip' &&
      zlib.gunzipSync(gz.body).equals(plain.body) &&
      gz.body.length < plain.body.length,
  );
  check(
    'API answer brotli-compressed for browsers, same data',
    br.headers['content-encoding'] === 'br' && zlib.brotliDecompressSync(br.body).equals(plain.body),
  );
  const signIn = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, br' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@12345-bq' }),
  });
  check('sign-in answers are never compressed', !signIn.headers.get('content-encoding'));
  const appFile = await rawGet('/app/app.js', { 'Accept-Encoding': 'gzip' });
  check(
    'website files are gzip-compressed',
    appFile.headers['content-encoding'] === 'gzip' && appFile.headers.vary === 'Accept-Encoding',
  );
  await new Promise((r) => setTimeout(r, 2500)); // strongest brotli is made in the background
  const pageBr = await rawGet('/app/app.js', { 'Accept-Encoding': 'gzip, br' });
  check(
    'website files are brotli-compressed once ready, and smaller than gzip',
    pageBr.headers['content-encoding'] === 'br' && pageBr.body.length < appFile.body.length,
  );

  console.log(`API audit: ${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exitCode = failures.length ? 1 : 0;
})().catch((err) => {
  console.error('Audit crashed:', err, failures);
  process.exitCode = 1;
});
