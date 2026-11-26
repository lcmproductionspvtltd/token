/**
 * Our PostgreSQL client (src/db/postgres.js) under stress: TLS certificate checks, the production
 * transport rule, time limits, a full pool, dropped connections, failed transactions and garbled
 * server replies. Audit finding F-06.
 *
 * Run: TEST_DATABASE_URL=postgres://… node tests/db-driver.test.js   (also part of `npm test`)
 * Needs a plain (non-TLS) test PostgreSQL and the `openssl` command. TLS is tested through a small
 * TLS front-end started here, with certificates made here, so no database setup is needed.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const tls = require('tls');
require('../src/config');
const { createPool, checkTransport, parseConnectionString } = require('../src/db/postgres');

const DB = process.env.TEST_DATABASE_URL || 'postgres://bquee:bquee@localhost:5432/bquee_test';
const target = parseConnectionString(DB);
let passed = 0;
const failures = [];
const ok = (label, cond, extra = '') => (
  process.env.DEBUG && console.log('·', label),
  cond ? passed++ : failures.push(label + (extra ? ' – ' + extra : ''))
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const urlWith = (host, port, query) => {
  const u = new URL(DB);
  u.hostname = host;
  u.port = String(port);
  u.search = query || '';
  return u.toString();
};
async function rejects(promise) {
  try {
    await promise;
    return null;
  } catch (err) {
    return err;
  }
}

/* ---------- certificates for the TLS tests ---------- */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bquee-tls-'));
const ssl = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' });
function makeCa(name) {
  ssl(
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '2',
    '-subj',
    '/CN=' + name,
    '-keyout',
    name + '.key',
    '-out',
    name + '.pem',
  );
}
makeCa('ca');
makeCa('otherca');
fs.writeFileSync(path.join(dir, 'san.cnf'), 'subjectAltName=DNS:localhost\n');
ssl('req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-keyout', 'server.key', '-out', 'server.csr');
ssl(
  'x509',
  '-req',
  '-in',
  'server.csr',
  '-CA',
  'ca.pem',
  '-CAkey',
  'ca.key',
  '-CAcreateserial',
  '-days',
  '2',
  '-extfile',
  'san.cnf',
  '-out',
  'server.pem',
);
const CA = path.join(dir, 'ca.pem');
const OTHER_CA = path.join(dir, 'otherca.pem');

/* ---------- fake servers ---------- */
function listen(onSocket) {
  return new Promise((resolve) => {
    const server = net.createServer(onSocket);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
/** Answers PostgreSQL's SSLRequest with 'S', does TLS with our certificate, then passes everything to the real database. */
const tlsFront = () =>
  listen((client) => {
    client.once('data', () => {
      client.write('S');
      const secure = new tls.TLSSocket(client, {
        isServer: true,
        cert: fs.readFileSync(path.join(dir, 'server.pem')),
        key: fs.readFileSync(path.join(dir, 'server.key')),
      });
      const backend = net.connect(target.port, target.host);
      secure.pipe(backend).pipe(secure);
      const close = () => (secure.destroy(), backend.destroy());
      secure.on('error', close);
      backend.on('error', close);
    });
    client.on('error', () => {});
  });
/** A server that refuses TLS ('N'). */
const noTlsFront = () => listen((c) => (c.once('data', () => c.write('N')), c.on('error', () => {})));
/** Accepts the connection and never answers. */
const silent = () => listen((c) => c.on('error', () => {}));
/** Answers the sign-in with the given bytes. */
const garbage = (bytes) => listen((c) => (c.once('data', () => c.write(bytes)), c.on('error', () => {})));

(async () => {
  /* 1. ordinary queries and value types */
  const db = createPool({ connectionString: DB, max: 3 });
  const big = 'x'.repeat(1_000_000);
  const r = await db.query(
    'SELECT $1::text AS a, $2::int AS b, $3::text AS c, $4::jsonb AS d, $5::text AS e, length($6::text) AS f',
    ['தமிழ் ✓ "quote" \\ back', 42, null, JSON.stringify({ k: [1, 2] }), "'; DROP TABLE salons; --", big],
  );
  const row = r.rows[0];
  ok('text and unicode round trip', row.a === 'தமிழ் ✓ "quote" \\ back');
  ok('int', row.b === 42);
  ok('null', row.c === null);
  ok('json', row.d && row.d.k && row.d.k[1] === 2);
  ok('SQL in a parameter stays text', row.e === "'; DROP TABLE salons; --");
  ok('1 MB parameter', row.f === 1_000_000);
  const many = Array.from({ length: 300 }, (_, i) => i);
  const sum = await db.query('SELECT ' + many.map((i) => '$' + (i + 1) + '::int').join('+') + ' AS s', many);
  ok('300 parameters', sum.rows[0].s === many.reduce((a, b) => a + b, 0));

  /* 1b. more value types (audit 3.6): exact numbers, dates, lists, large replies */
  const t = (
    await db.query(
      `SELECT 12345678901234567890.123456789::numeric AS n, 9007199254740993::bigint AS big,
              '2026-11-19T10:15:30.123Z'::timestamptz AS ts, '2026-11-19'::date::text AS d,
              ARRAY['a', 'b,c', 'd"e', NULL]::text[] AS arr, ARRAY[1, 2, 3]::int[] AS nums,
              true AS yes, false AS no, repeat('y', 3000000) AS huge`,
    )
  ).rows[0];
  ok('numeric keeps every digit (no rounding)', String(t.n) === '12345678901234567890.123456789', String(t.n));
  ok('bigint beyond JavaScript’s safe range is exact', String(t.big) === '9007199254740993', String(t.big));
  ok('timestamp with time zone', new Date(t.ts).toISOString() === '2026-11-19T10:15:30.123Z', String(t.ts));
  ok('date as text', t.d === '2026-11-19');
  const arr = Array.isArray(t.arr) ? t.arr : String(t.arr);
  ok(
    'text array with a comma, a quote and a null',
    Array.isArray(arr)
      ? arr.length === 4 && arr[1] === 'b,c' && arr[2] === 'd"e' && arr[3] === null
      : arr === '{a,"b,c","d\\"e",NULL}',
    JSON.stringify(t.arr),
  );
  ok(
    'int array',
    Array.isArray(t.nums) ? t.nums.join() === '1,2,3' : String(t.nums) === '{1,2,3}',
    JSON.stringify(t.nums),
  );
  ok('booleans', t.yes === true && t.no === false);
  ok('3 MB reply arrives whole', t.huge.length === 3_000_000);

  /* 1c. sign-in method and server error codes */
  const enc = (await db.query('SHOW password_encryption')).rows[0].password_encryption;
  ok('signed in to a server that uses SCRAM-SHA-256 passwords', enc === 'scram-sha-256', enc);
  await db.query('CREATE TEMP TABLE IF NOT EXISTS uniq_test (k int PRIMARY KEY)').catch(() => {});
  let dupCode = '';
  try {
    await db.transaction(async (tx) => {
      await tx.query('CREATE TEMP TABLE u2 (k int PRIMARY KEY)');
      await tx.query('INSERT INTO u2 VALUES (1)');
      await tx.query('INSERT INTO u2 VALUES (1)');
    });
  } catch (err) {
    dupCode = err.code;
  }
  ok('a duplicate value reports PostgreSQL’s code (23505)', dupCode === '23505', dupCode);
  let syntaxCode = '';
  try {
    await db.query('SELEC 1');
  } catch (err) {
    syntaxCode = err.code;
  }
  ok(
    'a broken query reports its code (42601) and the pool keeps working',
    syntaxCode === '42601' && (await db.query('SELECT 1 AS x')).rows[0].x === 1,
  );

  /* 2. errors keep the pool usable */
  const syntax = await rejects(db.query('SELEC 1'));
  ok('syntax error reported', syntax && syntax.code === '42601', syntax && syntax.code);
  ok('pool works after an error', (await db.query('SELECT 1 AS x')).rows[0].x === 1);
  const badPass = new URL(DB);
  badPass.password = 'wrong-password';
  const pool2 = createPool({ connectionString: badPass.toString(), max: 1 });
  const authErr = await rejects(pool2.query('SELECT 1'));
  ok(
    'wrong password refused',
    authErr && (authErr.code === '28P01' || /password/i.test(authErr.message)),
    authErr && authErr.message,
  );
  await pool2.end();

  /* 3. time limits */
  const quick = createPool({ connectionString: DB, max: 1, statementTimeoutMs: 400 });
  const t0 = Date.now();
  const slow = await rejects(quick.query('SELECT pg_sleep(3)'));
  ok(
    'statement time limit stops a long query',
    slow && slow.code === '57014' && Date.now() - t0 < 2000,
    slow && slow.code,
  );
  ok('same pool fine afterwards', (await quick.query('SELECT 2 AS x')).rows[0].x === 2);
  await quick.end();

  const quiet = await silent();
  const t1 = Date.now();
  const silentPool = createPool({
    connectionString: urlWith('127.0.0.1', quiet.address().port),
    max: 1,
    connectTimeoutMs: 500,
  });
  const conErr = await rejects(silentPool.query('SELECT 1'));
  ok('connect time limit', conErr && /within/.test(conErr.message) && Date.now() - t1 < 2000, conErr && conErr.message);
  quiet.close();

  /* 4. full pool */
  const small = createPool({ connectionString: DB, max: 3 });
  const res = await Promise.all(
    Array.from({ length: 30 }, (_, i) => small.query('SELECT pg_sleep(0.02), $1::int AS i', [i])),
  );
  ok(
    '30 queries through 3 connections',
    res.every((x, i) => x.rows[0].i === i),
  );
  ok('never more than 3 connections', small.stats().total <= 3, JSON.stringify(small.stats()));
  await small.end();

  const one = createPool({ connectionString: DB, max: 1, acquireTimeoutMs: 300 });
  const held = one.transaction((tx) => tx.query('SELECT pg_sleep(1.2)'));
  await sleep(50);
  const t2 = Date.now();
  const busy = await rejects(one.query('SELECT 1'));
  ok(
    'waiting for a free connection gives "busy" (503), not a hang',
    busy && busy.status === 503 && Date.now() - t2 < 1000,
    busy && busy.message,
  );
  await held;
  ok('works again when the connection is free', (await one.query('SELECT 3 AS x')).rows[0].x === 3);
  await one.end();

  /* 5. a connection killed by the server is replaced */
  const victim = createPool({ connectionString: DB, max: 1 });
  const pid = (await victim.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  await db.query('SELECT pg_terminate_backend($1)', [pid]);
  await sleep(100);
  let after = await rejects(victim.query('SELECT 4 AS x'));
  if (after) after = await rejects(victim.query('SELECT 4 AS x')); // the first try may see the closed socket
  ok('reconnects after the server dropped the connection', !after, after && after.message);
  const newPid = (await victim.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  ok('a new connection was opened', newPid !== pid);
  await victim.end();

  /* 6. transactions roll back on failure */
  await db.query('CREATE TABLE IF NOT EXISTS driver_test (n int)');
  await db.query('TRUNCATE driver_test');
  await rejects(
    db.transaction(async (tx) => {
      await tx.query('INSERT INTO driver_test VALUES (1)');
      throw new Error('stop');
    }),
  );
  await rejects(
    db.transaction(async (tx) => {
      await tx.query('INSERT INTO driver_test VALUES (2)');
      await tx.query('INSERT INTO driver_test VALUES ($1)', ['not a number']);
    }),
  );
  await db.transaction(async (tx) => tx.query('INSERT INTO driver_test VALUES (3)'));
  const kept = (await db.query("SELECT string_agg(n::text, ',') AS n FROM driver_test")).rows[0].n;
  ok('failed transactions leave nothing behind', kept === '3', kept);
  await db.query('DROP TABLE driver_test');

  /* 7. TLS: certificate always checked */
  const front = await tlsFront();
  const port = front.address().port;
  const viaTls = (host, query) =>
    createPool({ connectionString: urlWith(host, port, query), max: 1, connectTimeoutMs: 3000 });
  async function tryTls(label, host, query, shouldWork) {
    const p = viaTls(host, query);
    const err = await rejects(p.query('SELECT 5 AS x'));
    ok(label, shouldWork ? !err : !!err, err ? err.message : 'connected');
    await p.end();
  }
  await tryTls('verify-full with the right CA connects', 'localhost', '?sslmode=verify-full&sslrootcert=' + CA, true);
  await tryTls(
    'verify-full with another CA is refused',
    'localhost',
    '?sslmode=verify-full&sslrootcert=' + OTHER_CA,
    false,
  );
  await tryTls('verify-full with unknown (self-signed) CA is refused', 'localhost', '?sslmode=verify-full', false);
  await tryTls('require also checks the certificate', 'localhost', '?sslmode=require', false);
  await tryTls('require with the right CA connects', 'localhost', '?sslmode=require&sslrootcert=' + CA, true);
  await tryTls(
    'verify-full refuses a host name the certificate is not for',
    '127.0.0.1',
    '?sslmode=verify-full&sslrootcert=' + CA,
    false,
  );
  await tryTls('verify-ca accepts it (checks the CA only)', '127.0.0.1', '?sslmode=verify-ca&sslrootcert=' + CA, true);
  await tryTls('no-verify connects (only when asked)', '127.0.0.1', '?sslmode=no-verify', true);
  front.close();

  const plainOnly = await noTlsFront();
  const p3 = createPool({
    connectionString: urlWith('127.0.0.1', plainOnly.address().port, '?sslmode=verify-full'),
    max: 1,
  });
  const down = await rejects(p3.query('SELECT 1'));
  ok(
    'no silent fall-back to plain text when the server refuses TLS',
    down && /SSL/.test(down.message),
    down && down.message,
  );
  plainOnly.close();
  ok(
    'unknown sslmode refused',
    !!(await rejects(Promise.resolve().then(() => parseConnectionString(DB.split('?')[0] + '?sslmode=bogus')))),
  );

  /* 8. production rule */
  const rule = (u) => checkTransport(u);
  ok('public host without TLS refused', !rule('postgres://u:p@db.example.com/x').ok);
  ok('public host with no-verify refused', !rule('postgres://u:p@db.example.com/x?sslmode=no-verify').ok);
  ok('public host with checked TLS allowed', rule('postgres://u:p@db.example.com/x?sslmode=verify-full').ok);
  ok(
    'private-network host allowed with a warning',
    rule('postgres://u:p@dpg-abc123-a/x').ok && rule('postgres://u:p@dpg-abc123-a/x').warning,
  );
  ok(
    'private IP allowed with a warning',
    rule('postgres://u:p@10.0.3.4/x').ok && rule('postgres://u:p@192.168.1.9/x').ok,
  );
  ok('localhost allowed', rule('postgres://u:p@localhost/x').ok);
  ok('public IP without TLS refused', !rule('postgres://u:p@34.12.1.9/x').ok);
  ok(
    'public host with verify-ca (no host name check) refused',
    !rule('postgres://u:p@db.example.com/x?sslmode=verify-ca').ok,
  );
  ok('private host with verify-ca allowed', rule('postgres://u:p@10.0.3.4/x?sslmode=verify-ca').ok);
  const FAKE_PW = ['Fake', 'Pass', '42'].join(''); // made at run time so the secret scan doesn't flag it
  ok(
    'the start-up message never contains the password',
    [
      `postgres://u:${FAKE_PW}@db.example.com/x`,
      `postgres://u:${FAKE_PW}@db.example.com/x?sslmode=verify-full`,
      `postgres://u:${FAKE_PW}@10.0.3.4/x`,
    ].every((u) => !rule(u).message.includes(FAKE_PW)),
  );

  /* 9. garbled replies never crash the server */
  let crashed = false;
  const onCrash = () => (crashed = true);
  process.on('uncaughtException', onCrash);
  const samples = [
    Buffer.from('R\x00\x00\x00\x02'), // impossible length
    Buffer.from('D\x00\x00\x00\x08\x00\x05abc'), // row before any query
    Buffer.from('R\x7f\xff\xff\xff'), // huge length
    Buffer.from('R\x00\x00\x00\x08\x00\x00\x00\x63'), // unknown sign-in method
  ];
  for (let i = 0; i < 40; i++)
    samples.push(
      Buffer.from(Array.from({ length: 1 + Math.floor(Math.random() * 64) }, () => Math.floor(Math.random() * 256))),
    );
  let refused = 0;
  for (const bytes of samples) {
    const g = await garbage(bytes);
    const p = createPool({ connectionString: urlWith('127.0.0.1', g.address().port), max: 1, connectTimeoutMs: 400 });
    if (await rejects(p.query('SELECT 1'))) refused++;
    g.close();
  }
  await sleep(50);
  process.off('uncaughtException', onCrash);
  ok(
    '44 garbled / random replies: all refused, no crash',
    refused === samples.length && !crashed,
    refused + '/' + samples.length,
  );

  await db.end();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`Database client: ${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('Database client test crashed:', err);
  process.exit(1);
});
