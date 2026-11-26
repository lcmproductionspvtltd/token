/**
 * Notifications, staff-made tokens, the home page contact form and the sign-up currency.
 *   - a booking tells the owner and the staff member; "It's your turn" reaches the customer
 *   - "anything after #id?" answers empty when nothing is new; read marks clear the count
 *   - people only ever see their own notifications
 *   - staff make a token by hand: always their own name, only their services
 *   - the contact form and new sign-ups reach the BQuee team
 *   - the sign-up currency comes from where the device is, not a manual choice
 * Runs against a server at BASE (started by tests/run.js, after the API audit).
 */

const BASE = process.env.BASE || 'http://localhost:3000';
const { login: signIn } = require('./helpers/session');
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

(async () => {
  const sa = await signIn(BASE, 'admin', 'Admin@12345-bq');
  const before = await ok('admin notifications', 'GET', '/api/notifications', null, sa);

  // ---- the pricing the sign-up uses: AED for a phone in Dubai, US$ for Karachi ----
  const content = (await ok('admin site', 'GET', '/api/admin/site', null, sa)).content;
  await ok(
    'admin shows pricing',
    'PUT',
    '/api/admin/site',
    {
      ...content,
      sections: { ...content.sections, plans: true },
      plans: [{ name: 'Business', price: '$12', period: 'per month', fixedPrices: 'AED 42' }],
      currencies: [{ code: 'AED', rate: 3.6725 }],
    },
    sa,
  );

  const types = (await (await fetch(BASE + '/api/public/site')).json()).categories || [];
  const signup = (tag, where) =>
    ok('sign-up ' + tag, 'POST', '/api/public/signup', {
      businessName: 'Notes ' + tag + RUN,
      ownerName: 'Owner ' + tag,
      mobile: '0501234567',
      email: `n${tag}${RUN}@example.com`,
      username: `n${tag}${RUN}`,
      password: 'Owner@1234-bq-long',
      package: 'Business',
      categoryId: types.length ? types[0].id : '',
      currency: 'USD', // an old app's manual choice – ignored when the location is sent
      ...where,
    });
  const dubai = await signup('dxb', { tz: 'Asia/Dubai', region: 'AE' });
  const karachi = await signup('khi', { tz: 'Asia/Karachi', region: 'PK' });
  const owner = dubai.token;
  const dData = await ok('Dubai owner data', 'GET', '/api/owner/data', null, owner);
  const kData = await ok('Karachi owner data', 'GET', '/api/owner/data', null, karachi.token);
  check('Dubai sign-up is in dirhams (from the location)', dData.salon.currency === 'AED', dData.salon.currency);
  check('Karachi sign-up is in US$ (rupee not on sale)', kData.salon.currency === '$', kData.salon.currency);

  const teamNotes = await ok('admin notifications after sign-ups', 'GET', '/api/notifications', null, sa);
  check(
    'the BQuee team hears about new sign-ups',
    teamNotes.items.some((n) => n.title.includes('Notes dxb' + RUN)) && teamNotes.unread > before.unread,
  );

  // ---- a business with two staff ----
  const branch = dData.branches[0].id;
  const cut = (await ok('service Cut', 'POST', '/api/owner/services', { name: 'Cut', duration: 30, price: 50 }, owner))
    .id;
  const spa = (await ok('service Spa', 'POST', '/api/owner/services', { name: 'Spa', duration: 60, price: 90 }, owner))
    .id;
  const anu = (
    await ok(
      'staff Anu',
      'POST',
      '/api/owner/staff',
      { name: 'Anu', branchId: branch, serviceIds: [cut], username: 'anu' + RUN, password: 'Staff@1234-bq' },
      owner,
    )
  ).id;
  await ok(
    'staff Sam',
    'POST',
    '/api/owner/staff',
    { name: 'Sam', branchId: branch, serviceIds: [cut, spa], username: 'sam' + RUN, password: 'Staff@1234-bq' },
    owner,
  );
  const anuT = await signIn(BASE, 'anu' + RUN, 'Staff@1234-bq');
  const samT = await signIn(BASE, 'sam' + RUN, 'Staff@1234-bq');
  const anuStart = await ok('Anu notifications', 'GET', '/api/notifications', null, anuT);
  const ownerStart = await ok('owner notifications', 'GET', '/api/notifications', null, owner);

  // ---- a customer with an account books Anu ----
  const cust = await ok('customer signs up', 'POST', '/api/customer/signup', {
    name: 'Ravi',
    mobile: '0509' + String(Date.now()).slice(-6),
    password: 'Cust@1234-bq',
  });
  const custT = cust.token;
  const booked = await ok(
    'customer books Anu',
    'POST',
    '/api/customer/book',
    { branchId: branch, items: [{ serviceId: cut, staffId: anu }] },
    custT,
  );
  const tokenId = booked.id || (booked.token && booked.token.id);

  const anuNew = await ok('Anu: anything new?', 'GET', '/api/notifications?after=' + anuStart.last, null, anuT);
  check(
    'staff hears about a new customer in their queue',
    anuNew.items.length === 1 && /New customer in your queue/.test(anuNew.items[0].title),
    JSON.stringify(anuNew.items),
  );
  const samNew = await ok('Sam: anything new?', 'GET', '/api/notifications', null, samT);
  check('other staff are not told', samNew.items.length === 0);
  const ownerNew = await ok('owner: anything new?', 'GET', '/api/notifications?after=' + ownerStart.last, null, owner);
  check(
    'owner hears about every new token',
    ownerNew.items.some((n) => /^New token/.test(n.title)),
  );
  check(
    '…with the customer and service',
    ownerNew.items.some((n) => /Ravi: Cut \(Anu\)/.test(n.body)),
  );

  const again = await ok('Anu asks again', 'GET', '/api/notifications?after=' + anuNew.items[0].id, null, anuT);
  check('nothing new → an empty answer', again.items.length === 0);

  // ---- read marks ----
  check('unread count', anuNew.unread >= 1);
  await ok('Anu reads all', 'POST', '/api/notifications/read', {}, anuT);
  const read = await ok('Anu after reading', 'GET', '/api/notifications', null, anuT);
  check('read → unread is 0', read.unread === 0 && read.readUpTo === read.last);

  // ---- "It's your turn" for the customer ----
  await ok('Anu starts the token', 'POST', '/api/token/' + tokenId + '/next', {}, anuT);
  const custNotes = await ok('customer notifications', 'GET', '/api/customer/notifications', null, custT);
  check(
    'customer hears it is their turn',
    custNotes.items.some((n) => /It’s your turn/.test(n.title) && /Cut with Anu/.test(n.body)),
    JSON.stringify(custNotes.items),
  );
  await ok('customer reads', 'POST', '/api/customer/notifications/read', { upTo: custNotes.last }, custT);
  check(
    'customer read mark',
    (await ok('customer again', 'GET', '/api/customer/notifications', null, custT)).unread === 0,
  );

  // ---- privacy: only your own ----
  await deny('customer token on staff notifications', [401, 403], 'GET', '/api/notifications', null, custT);
  await deny('no sign-in', [401], 'GET', '/api/notifications');
  await deny('staff token on customer notifications', [401], 'GET', '/api/customer/notifications', null, anuT);
  const otherOwner = await ok('Karachi owner notifications', 'GET', '/api/notifications', null, karachi.token);
  check('another business sees none of these', !otherOwner.items.some((n) => /Ravi/.test(n.body)));

  // ---- staff make a token by hand ----
  const mine = await ok('Anu’s services', 'GET', '/api/staff/my-services', null, anuT);
  check(
    'only Anu’s own services are offered',
    mine.services.length === 1 && mine.services[0].id === cut && mine.staff.name === 'Anu',
  );
  const samMine = await ok('Sam’s services', 'GET', '/api/staff/my-services', null, samT);
  check('Sam has both', samMine.services.length === 2);
  await deny(
    'Anu can’t add a service she doesn’t do',
    [400],
    'POST',
    '/api/staff/tokens',
    { name: 'Walk-in', serviceIds: [spa] },
    anuT,
  );
  await deny('a name is needed', [400], 'POST', '/api/staff/tokens', { serviceIds: [cut] }, anuT);
  await deny('a service is needed', [400], 'POST', '/api/staff/tokens', { name: 'Walk-in' }, anuT);
  await deny(
    'owners use their own screen',
    [403],
    'POST',
    '/api/staff/tokens',
    { name: 'X', serviceIds: [cut] },
    owner,
  );
  await ok('Anu goes offline', 'PUT', '/api/staff/status', { online: false }, anuT);
  const ownerMark = (await ok('owner before walk-in', 'GET', '/api/notifications', null, owner)).last;
  const walk = await ok(
    'Anu makes a token (even while offline, no mobile)',
    'POST',
    '/api/staff/tokens',
    { name: 'Walk-in Meera', serviceIds: [cut], staffId: 'someone-else' },
    anuT,
  );
  check(
    'the token is Anu’s own, whatever was sent',
    walk.token && walk.token.items.length === 1 && walk.token.items[0].staffId === anu,
    JSON.stringify(walk.token && walk.token.items),
  );
  const queue = await ok('Anu queue', 'GET', '/api/staff/queue', null, anuT);
  check(
    'the walk-in is in Anu’s queue',
    queue.tokens.some((t) => t.id === walk.token.id),
  );
  const ownerWalk = await ok('owner after walk-in', 'GET', '/api/notifications?after=' + ownerMark, null, owner);
  check(
    'owner is told who added it',
    ownerWalk.items.some((n) => /Added by Anu for Walk-in Meera/.test(n.body)),
  );
  const anuSelf = await ok('Anu after her own token', 'GET', '/api/notifications?after=' + read.last, null, anuT);
  check('staff aren’t told about a token they made themselves', !anuSelf.items.some((n) => /Meera/.test(n.body)));
  const otherWalk = await ok('Karachi staff can’t see it', 'GET', '/api/owner/tokens', null, karachi.token);
  check('other business doesn’t see the walk-in', !otherWalk.some((t) => t.id === walk.token.id));

  // ---- starting tokens: each service on its own (default) or the whole token at once ----
  const flowOf = async () => (await ok('owner data (flow)', 'GET', '/api/owner/data', null, owner)).salon.tokenFlow;
  check('new businesses start each service on its own', (await flowOf()) === 'perService');
  await ok('Sam back online', 'PUT', '/api/staff/status', { online: true }, samT);
  const two = async (label) =>
    (await ok(label, 'POST', '/api/staff/tokens', { name: 'Two ' + label, serviceIds: [cut, spa] }, samT)).token;
  const statuses = (t) => t.items.map((i) => i.status).join(',');
  // per service: Start starts one service; a chosen service (index) starts on its own
  const p1 = await two('per-service');
  const p1a = await ok('Sam starts (per service)', 'POST', '/api/token/' + p1.id + '/start', {}, samT);
  check('per service: Start starts just the first service', statuses(p1a.token) === 'in_progress,waiting', statuses(p1a.token));
  const p1b = await ok('Sam starts the second by its button', 'POST', '/api/token/' + p1.id + '/start', { index: 1 }, samT);
  check('per service: each service has its own Start', statuses(p1b.token) === 'in_progress,in_progress');
  const p1c = await ok('Sam finishes the second only', 'POST', '/api/token/' + p1.id + '/finish', { index: 1 }, samT);
  check('per service: each service has its own Finish', statuses(p1c.token) === 'in_progress,done');
  await deny('per service: a finished service can’t finish again', [400], 'POST', '/api/token/' + p1.id + '/finish', { index: 1 }, samT);
  await deny('a service that isn’t on the token', [404], 'POST', '/api/token/' + p1.id + '/start', { index: 9 }, samT);

  // whole token: one Start / Finish for everything
  const saved = await ok('owner picks “whole token”', 'PUT', '/api/owner/salon', { tokenFlow: 'whole' }, owner);
  check('the setting is saved', saved.tokenFlow === 'whole' && (await flowOf()) === 'whole');
  const w1 = await two('whole');
  const custMark = (await ok('customer mark', 'GET', '/api/customer/notifications', null, custT)).last;
  const w1a = await ok('Sam starts (whole)', 'POST', '/api/token/' + w1.id + '/start', {}, samT);
  check('whole: one Start starts every service', statuses(w1a.token) === 'in_progress,in_progress', statuses(w1a.token));
  check('whole: says how many', w1a.message === 'Started 2 services', w1a.message);
  const w1b = await ok('Sam finishes (whole)', 'POST', '/api/token/' + w1.id + '/finish', {}, samT);
  check('whole: one Finish ends them all', statuses(w1b.token) === 'done,done' && w1b.token.status === 'done');
  const w2 = await two('whole-scan');
  const w2a = await ok('Sam scans once', 'POST', '/api/token/' + w2.id + '/next', {}, samT);
  check('whole: one scan starts the token', statuses(w2a.token) === 'in_progress,in_progress');
  const w2b = await ok('Sam scans again', 'POST', '/api/token/' + w2.id + '/next', {}, samT);
  check('whole: the next scan finishes it', w2b.token.status === 'done');
  // a token shared by two staff: each starts only their own services
  await ok('Anu online', 'PUT', '/api/staff/status', { online: true }, anuT);
  const shared = await ok(
    'customer books Anu and Sam',
    'POST',
    '/api/customer/book',
    { branchId: branch, items: [{ serviceId: cut, staffId: anu }, { serviceId: spa }] },
    custT,
  );
  const sharedId = shared.id || (shared.token && shared.token.id);
  const sh1 = await ok('Anu starts (whole)', 'POST', '/api/token/' + sharedId + '/start', {}, anuT);
  check(
    'whole: staff start only their own services',
    sh1.token.items.find((i) => i.staffId === anu).status === 'in_progress' &&
      sh1.token.items.filter((i) => i.staffId !== anu).every((i) => i.status === 'waiting'),
    statuses(sh1.token),
  );
  await deny('Anu can’t start Sam’s service', [403], 'POST', '/api/token/' + sharedId + '/start', { index: 1 }, anuT);
  const sh2 = await ok('owner starts the rest (whole)', 'POST', '/api/token/' + sharedId + '/start', {}, owner);
  check('whole: the owner’s Start starts everything still waiting', sh2.token.items.every((i) => i.status === 'in_progress'));
  const turn = await ok('customer notes after start', 'GET', '/api/customer/notifications?after=' + custMark, null, custT);
  check(
    'whole: the customer’s “It’s your turn” names the services',
    turn.items.some((n) => /It’s your turn/.test(n.title)),
  );
  const pub = await ok('public token view', 'GET', '/api/public/token/' + sharedId);
  check('the token page knows the setting', pub.salon.tokenFlow === 'whole');
  await ok('owner switches back', 'PUT', '/api/owner/salon', { tokenFlow: 'anything-else' }, owner);
  check('anything else means each service on its own', (await flowOf()) === 'perService');

  // ---- cancelling tells the customer and staff ----
  const second = await ok(
    'customer books again',
    'POST',
    '/api/customer/book',
    { branchId: branch, items: [{ serviceId: spa }] },
    custT,
  );
  const secondId = second.id || (second.token && second.token.id);
  const samMark = (await ok('Sam mark', 'GET', '/api/notifications', null, samT)).last;
  await ok('owner cancels', 'POST', '/api/token/' + secondId + '/cancel', {}, owner);
  check(
    'customer is told it was cancelled',
    (await ok('customer notes', 'GET', '/api/customer/notifications', null, custT)).items.some((n) =>
      /was cancelled/.test(n.title),
    ),
  );
  check(
    'staff on it are told too',
    (await ok('Sam notes', 'GET', '/api/notifications?after=' + samMark, null, samT)).items.some((n) =>
      /was cancelled/.test(n.title),
    ),
  );

  // ---- home page contact form ----
  const mark = (await ok('team mark', 'GET', '/api/notifications', null, sa)).last;
  await deny('contact: a message is needed', [400], 'POST', '/api/public/contact', { name: 'Lea', email: 'l@x.com' });
  await deny('contact: email or phone needed', [400], 'POST', '/api/public/contact', {
    name: 'Lea',
    message: 'Hello!',
  });
  await deny('contact: bad email', [400], 'POST', '/api/public/contact', {
    name: 'Lea',
    email: 'nope',
    message: 'Hello there',
  });
  await ok('contact form sends', 'POST', '/api/public/contact', {
    name: 'Lea',
    email: 'lea@example.com',
    message: 'Can I get a demo for my clinic?',
  });
  await ok('a bot filling the hidden field gets a quiet OK', 'POST', '/api/public/contact', {
    name: 'Bot',
    email: 'b@x.com',
    message: 'spam spam',
    website: 'http://spam',
  });
  const contactNotes = await ok('team after contact', 'GET', '/api/notifications?after=' + mark, null, sa);
  check(
    'the message reaches the team, with the reply address',
    contactNotes.items.some(
      (n) => n.title === 'Website message from Lea' && /lea@example\.com/.test(n.body) && /demo/.test(n.body),
    ),
  );
  check('bot messages are dropped', !contactNotes.items.some((n) => /Bot/.test(n.title)));
  check(
    'owners don’t get team messages',
    !(await ok('owner check', 'GET', '/api/notifications', null, owner)).items.some((n) => /Lea/.test(n.title)),
  );
  let limited = false;
  for (let i = 0; i < 6 && !limited; i++) {
    const r = await request('POST', '/api/public/contact', { name: 'Flood', email: 'f@x.com', message: 'Hello ' + i });
    limited = r.status === 429;
  }
  check('the contact form is rate limited', limited);

  // ---- the hidden deletion request page exists but is never indexed ----
  const page = await fetch(BASE + '/request');
  check('/request opens', page.status === 200);
  check('/request is not for search engines', /noindex/.test(page.headers.get('x-robots-tag') || ''));
  const robots = await (await fetch(BASE + '/robots.txt')).text();
  const sitemap = await (await fetch(BASE + '/sitemap.xml')).text();
  check('/request is not in the sitemap', !/\/request</.test(sitemap));
  check('robots.txt doesn’t point to it either', !/\/request/.test(robots));

  console.log(`Notifications audit: ${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exitCode = failures.length ? 1 : 0;
})().catch((err) => {
  console.error('Audit crashed:', err, failures);
  process.exitCode = 1;
});
