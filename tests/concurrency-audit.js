/**
 * Many things at once (audit F-07 and section 5): 200 customers booking the same branch at the
 * same moment through two servers sharing one database, a number reset in the middle of it,
 * two staff scanning the same token together, and rate limits shared between the two servers.
 * Started by tests/run.js with BASE and BASE2 (two servers, TRUST_PROXY=1).
 */

const { createPool } = require('../src/db/postgres');
const { login: signIn } = require('./helpers/session');

const BASES = [process.env.BASE, process.env.BASE2];
const DB = process.env.TEST_DATABASE_URL;
let passed = 0;
const failures = [];
const check = (label, cond, extra = '') => (cond ? passed++ : failures.push(label + (extra ? ' – ' + extra : '')));

async function call(base, method, url, body, token, ip) {
  const r = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Each simulated customer comes from its own address (the servers trust X-Forwarded-For here).
      ...(ip ? { 'X-Forwarded-For': ip } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, headers: r.headers, data: await r.json().catch(() => ({})) };
}
const must = async (label, ...args) => {
  const r = await call(...args);
  if (r.status !== 200) throw new Error(`${label}: ${r.status} ${r.data.error || ''}`);
  return r.data;
};

(async () => {
  const [A, B] = BASES;
  const sa = await signIn(A, 'admin', 'Admin@12345-bq');
  await must(
    'create business',
    A,
    'POST',
    '/api/admin/salons',
    { name: 'Rush Salon', username: 'rushown', password: 'Owner@12345-bq' },
    sa,
  );
  const own = await signIn(A, 'rushown', 'Owner@12345-bq');
  const d = await must('owner data', A, 'GET', '/api/owner/data', null, own);
  const branchId = d.branches[0].id;
  const sv = await must('service', A, 'POST', '/api/owner/services', { name: 'Cut', duration: 10, price: 100 }, own);
  for (const n of [1, 2])
    await must(
      'staff',
      A,
      'POST',
      '/api/owner/staff',
      { name: 'Rush ' + n, branchId, serviceIds: [sv.id], username: 'rush' + n, password: 'Staff@12345-bq' },
      own,
    );

  /* 1. 200 bookings at once, through both servers */
  const book = (i) =>
    call(
      BASES[i % 2],
      'POST',
      '/api/public/book',
      {
        branchId,
        name: 'Guest ' + i,
        mobile: '90000' + String(i).padStart(5, '0'),
        items: [{ serviceId: sv.id, staffId: 'any' }],
      },
      null,
      '10.9.' + Math.floor(i / 250) + '.' + (i % 250),
    );
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: 200 }, (_, i) => book(i)));
  const okOnes = results.filter((r) => r.status === 200);
  check(
    'all 200 parallel bookings accepted',
    okOnes.length === 200,
    results
      .filter((r) => r.status !== 200)
      .slice(0, 3)
      .map((r) => r.status + ' ' + r.data.error)
      .join('; '),
  );
  const db = createPool({ connectionString: DB, max: 2 });
  const numbers = (
    await db.query('SELECT number FROM tokens WHERE branch_id = $1 ORDER BY number', [branchId])
  ).rows.map((r) => r.number);
  check('no duplicate token numbers', new Set(numbers).size === numbers.length);
  check('numbers are 1…200 with no gaps', numbers.length === 200 && numbers[0] === 1 && numbers[199] === 200);
  console.log(`  (200 bookings through 2 servers in ${Date.now() - t0} ms)`);

  /* 2. resetting numbers while bookings keep arriving */
  const mixed = await Promise.all([
    ...Array.from({ length: 60 }, (_, i) => book(1000 + i)),
    call(A, 'POST', '/api/owner/branches/' + branchId + '/reset-numbers', {}, own),
    ...Array.from({ length: 60 }, (_, i) => book(2000 + i)),
  ]);
  check('bookings during a reset all accepted', mixed.filter((r) => r.status === 200).length === 121);
  const dup = await db.query(
    `SELECT number, cycle, count(*)::int AS n FROM tokens WHERE branch_id = $1 GROUP BY token_date, number, cycle HAVING count(*) > 1`,
    [branchId],
  );
  check(
    'no duplicate number within a numbering cycle after the reset',
    dup.rows.length === 0,
    JSON.stringify(dup.rows.slice(0, 3)),
  );
  const total = (await db.query('SELECT count(*)::int AS n FROM tokens WHERE branch_id = $1', [branchId])).rows[0].n;
  check('every booking stored exactly once', total === 320, String(total));

  /* 3. two staff scan the same token at the same moment */
  const s1 = await signIn(A, 'rush1', 'Staff@12345-bq');
  const s2 = await signIn(B, 'rush2', 'Staff@12345-bq');
  const target = okOnes[0].data.id;
  const both = await Promise.all([
    call(A, 'POST', '/api/token/' + target + '/next', {}, s1),
    call(B, 'POST', '/api/token/' + target + '/next', {}, s2),
  ]);
  const after = await must('token after double scan', A, 'GET', '/api/public/token/' + target);
  const serving = after.token.items.filter((x) => x.status === 'in_progress').length;
  check(
    'double scan: exactly one service started, never two',
    serving === 1 && both.some((r) => r.status === 200),
    both.map((r) => r.status).join('/') + ' serving=' + serving,
  );

  /* 4. rate limits are shared by both servers */
  const tries = [];
  for (let i = 0; i < 24; i++)
    tries.push(
      await call(
        BASES[i % 2],
        'POST',
        '/api/login',
        { login: 'nobody' + i, password: 'wrong-password' },
        null,
        '10.77.0.1',
      ),
    );
  const limitedAt = tries.findIndex((r) => r.status === 429);
  check(
    'login limit counts tries on both servers together (20 per address)',
    limitedAt === 20,
    'first 429 at try ' + (limitedAt + 1),
  );
  check(
    '429 says when to try again (Retry-After)',
    limitedAt >= 0 && Number(tries[limitedAt].headers.get('retry-after')) > 0,
  );
  const acct = [];
  for (let i = 0; i < 12; i++)
    acct.push(
      (
        await call(
          BASES[i % 2],
          'POST',
          '/api/login',
          { login: 'rushown', password: 'wrong-password' },
          null,
          '10.78.0.' + i,
        )
      ).status,
    );
  check(
    'per-account limit stops guessing one account from many addresses (10 wrong passwords)',
    acct.indexOf(429) === 10,
    acct.join(','),
  );
  const stillIn = await call(
    A,
    'POST',
    '/api/login',
    { login: 'rush1', password: 'Staff@12345-bq' },
    null,
    '10.79.0.1',
  );
  check('a different account is not affected', stillIn.status === 200);

  /* 4b. many wrong passwords for one account at the SAME moment, on both servers (audit 3.1) */
  const rush = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      call(
        BASES[i % 2],
        'POST',
        '/api/login',
        { login: 'rush2', password: 'wrong-password' },
        null,
        '10.77.' + Math.floor(i / 200) + '.' + (i % 200),
      ),
    ),
  );
  const checkedNow = rush.filter((r) => r.status === 401).length;
  check(
    '40 wrong passwords at the same moment on two servers: at most 10 are checked, the rest refused',
    checkedNow <= 10 && checkedNow + rush.filter((r) => r.status === 429).length === 40,
    rush.map((r) => r.status).join(','),
  );

  /* 5. one address flooding the API is slowed down (600 a minute per server) */
  const burst = await Promise.all(
    Array.from({ length: 650 }, () => call(A, 'GET', '/api/public/site', null, null, '10.88.0.1')),
  );
  const slowed = burst.filter((r) => r.status === 429).length;
  check('a flood from one address gets 429 after 600 requests a minute', slowed === 50, slowed + ' refused');
  const other = await call(A, 'GET', '/api/public/site', null, null, '10.88.0.2');
  check('other visitors are not affected', other.status === 200);

  await db.end();
  console.log(`Concurrency audit: ${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('Concurrency audit crashed:', err.message);
  process.exit(1);
});
