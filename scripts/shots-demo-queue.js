'use strict';

/**
 * For the store screenshots only (.github/workflows/store-shots.yml): fills the demo business from
 * scripts/seed.js with a busier day on a local test server – customers booking by QR and walk-ins
 * added by staff – so the app's screens look like a real morning. Never point this at bquee.com.
 *   node scripts/shots-demo-queue.js http://127.0.0.1:3000
 */

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error('Only for a local test server (http://127.0.0.1:…).');
  process.exit(1);
}

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error || ''}`);
  return data;
}

(async () => {
  const owner = (await call('POST', '/api/login', { username: 'owner', password: 'Owner@123' })).token;
  const staff = (await call('POST', '/api/login', { username: 'staff', password: 'Staff@123' })).token;
  const data = await call('GET', '/api/owner/data', null, owner);
  const branchId = data.branches[0].id;
  const service = Object.fromEntries(data.services.map((s) => [s.name, s.id]));
  const staffId = Object.fromEntries(data.staff.map((s) => [s.name, s.id]));

  // Customers who scanned the QR code.
  const booked = [
    ['Sneha Pillai', '9800000011', [['Hair Colour', 'Ravi Kumar']]],
    ['Rahul Das', '9800000012', [['Full Body Massage', 'Suresh Babu']]],
    ['Aisha Khan', '9800000013', [['Manicure', 'Anjali Menon'], ['Threading', 'Anjali Menon']]],
    ['Vikram Rao', '9800000014', [['Haircut & Style', 'Ravi Kumar'], ['Beard Trim', 'Ravi Kumar']]],
    ['Nisha Thomas', '9800000015', [['Head Massage', 'any']]],
  ];
  for (const [name, mobile, items] of booked) {
    await call('POST', '/api/public/book', {
      branchId,
      name,
      mobile,
      items: items.map(([svc, who]) => ({ serviceId: service[svc], staffId: who === 'any' ? 'any' : staffId[who] })),
    });
  }
  // Walk-ins added at the counter by the stylist (BQuee Biz "New token").
  for (const [name, svc] of [
    ['Joseph M.', 'Beard Trim'],
    ['Priya S.', 'Haircut & Style'],
  ]) {
    await call('POST', '/api/staff/tokens', { name, serviceIds: [service[svc]] }, staff);
  }
  // A demo customer of the BQuee app with two tokens; one of them has just started ("It's your turn").
  const customer = (
    await call('POST', '/api/customer/signup', {
      name: 'Ananya Iyer',
      mobile: '9800000020',
      email: 'ananya@example.com',
      password: 'Demo@12345-shots',
    })
  ).token;
  const massage = await call(
    'POST',
    '/api/customer/book',
    { branchId, items: [{ serviceId: service['Head Massage'], staffId: staffId['Suresh Babu'] }] },
    customer,
  );
  await call(
    'POST',
    '/api/customer/book',
    { branchId, items: [{ serviceId: service['Classic Facial'], staffId: staffId['Anjali Menon'] }] },
    customer,
  );
  await call('POST', `/api/token/${massage.id || massage.token.id}/next`, {}, owner);
  console.log('Demo queue ready:', booked.length + 4, 'more tokens, demo customer ananya@example.com');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
