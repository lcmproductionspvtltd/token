'use strict';

/**
 * The shared sign-in limiter (src/http/security.js → RateLimiter), on a real PostgreSQL:
 *   - audit 2.1: when its database can't answer, requests are refused (503), never let through
 *   - audit 3.1: many simultaneous wrong passwords can never get past the limit
 *   - successful sign-ins and refused tries don't count; only real wrong passwords do
 */

const { createPool } = require('../src/db/postgres');
const { migrate } = require('../src/db/migrate');
const { RateLimiter } = require('../src/http/security');

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name + (detail ? ` – ${detail}` : ''));
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}
const quiet = { error() {}, warn() {}, log() {} };
const statusOf = (p) =>
  p.then(
    () => 200,
    (e) => e.status || 500,
  );
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1. Storage failure: refuse safely, never run the protected work.
  const alerts = [];
  const broken = new RateLimiter(
    { query: async () => Promise.reject(new Error('connection lost')) },
    { error: (m) => alerts.push(m) },
  );
  let ran = false;
  check(
    'database failure: a limited request is refused with 503',
    (await statusOf(broken.check('login', '1.2.3.4', 20, 60_000))) === 503,
  );
  const s = await statusOf(broken.attempt('login-account', 'owner', 10, 60_000, async () => (ran = true)));
  check('database failure: a sign-in attempt is refused with 503 and the password is never checked', s === 503 && !ran);
  check(
    'database failure: logged as an alert line (no secrets)',
    alerts.length === 2 && alerts.every((a) => JSON.parse(a).alert === 'rate_limit_storage_error'),
  );
  const err = await broken.check('x', 'y', 1, 1000).catch((e) => e);
  check('database failure: the client is told to retry in a few seconds', err.retryAfter === 5);

  // 2. Real database.
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.log('TEST_DATABASE_URL not set – skipping the database part');
  } else {
    const db = createPool({ connectionString: url, max: 20 });
    await migrate(db, () => {});
    await db.query("DELETE FROM rate_limits WHERE key LIKE 'rl-test|%'");
    const limiter = new RateLimiter(db, quiet);
    const MAX = 10;

    let executed = 0;
    const wrongPassword = async () => {
      executed++;
      await wait(40);
      const e = new Error('Wrong password');
      e.status = 401;
      throw e;
    };
    const results = await Promise.all(
      Array.from({ length: 40 }, () => statusOf(limiter.attempt('rl-test', 'acct', MAX, 60_000, wrongPassword))),
    );
    const wrong = results.filter((x) => x === 401).length;
    const refused = results.filter((x) => x === 429).length;
    check(
      `40 wrong passwords at the same moment: at most ${MAX} are checked`,
      executed <= MAX && wrong === executed,
      `checked ${executed}`,
    );
    check('…and all the others are refused (429)', refused === 40 - executed, `refused ${refused}`);
    const after = await statusOf(limiter.attempt('rl-test', 'acct', MAX, 60_000, async () => 'ok'));
    check('once the limit is reached, even the right password waits', after === 429);
    const { rows } = await db.query("SELECT hits FROM rate_limits WHERE key = 'rl-test|acct'");
    check(
      'refused tries are not counted (only the real wrong passwords)',
      rows[0] && rows[0].hits === MAX,
      rows[0] && `hits ${rows[0].hits}`,
    );

    let okRuns = 0;
    for (let i = 0; i < 25; i++)
      if ((await statusOf(limiter.attempt('rl-test', 'happy', MAX, 60_000, async () => okRuns++))) === 200);
    check('25 successful sign-ins in a row are never blocked', okRuns === 25);

    let other = 0;
    const serverError = async () => {
      other++;
      const e = new Error('boom');
      e.status = 500;
      throw e;
    };
    for (let i = 0; i < 15; i++) await statusOf(limiter.attempt('rl-test', 'errors', MAX, 60_000, serverError));
    check('errors that are not wrong passwords do not count', other === 15);

    const ip = await Promise.all(
      Array.from({ length: 30 }, () => statusOf(limiter.check('rl-test', 'ip', 20, 60_000))),
    );
    check('per-address limit: 30 at once → exactly 20 allowed', ip.filter((x) => x === 200).length === 20);

    await db.query("DELETE FROM rate_limits WHERE key LIKE 'rl-test|%'");
    await db.end();
  }

  console.log(`Sign-in limiter: ${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
})().catch((e) => {
  console.error('Limiter test crashed:', e);
  process.exit(1);
});
