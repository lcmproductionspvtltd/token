'use strict';

/**
 * Start-up rules (audit 2.2): in production BQuee refuses to start without a strong APP_SECRET and
 * never stores two-step secrets unencrypted; secrets stored earlier without a key are encrypted at
 * start-up; changing the key with APP_SECRET_PREVIOUS keeps every secret readable.
 */

const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { createPool } = require('../src/db/postgres');

const ROOT = path.join(__dirname, '..');
const DATABASE_URL = process.env.TEST_DATABASE_URL;
const GOOD = 'k3J9-pQ2x_Lm7Vb4Rt8Wn1Zc6Hy5Fd0Sg+aE'; // 36 characters of mixed text
const NEW_KEY = 'Nw8_Qe3Rt6Yu1Io4Pa7Sd0Fg2Hj5Kl9Zx-Cv';
let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}

/** Starts server.js; resolves { started, code, output } once it is listening or has exited. */
function start(env, port) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, DATABASE_URL, PORT: String(port), ADMIN_PASSWORD: 'Admin@12345-bq', ...env },
    });
    let output = '';
    const done = (r) => {
      clearTimeout(timer);
      resolve({ ...r, output, child });
    };
    child.stdout.on('data', (d) => {
      output += d;
      if (/is running on/.test(output)) done({ started: true });
    });
    child.stderr.on('data', (d) => (output += d));
    child.on('exit', (code) => done({ started: false, code }));
    const timer = setTimeout(() => done({ started: false, code: 'timeout' }), 20000);
  });
}
const stop = (r) =>
  new Promise((res) => (r.child.exitCode !== null ? res() : (r.child.on('exit', res), r.child.kill('SIGTERM'))));

/** Decrypts a stored value in a fresh process that has only the given keys. */
function openWith(env, value) {
  const r = spawnSync(
    process.execPath,
    ['-e', `process.stdout.write(require('./src/services/secret-box').open(process.argv[1]))`, value],
    {
      cwd: ROOT,
      env: { PATH: process.env.PATH, ...env },
      encoding: 'utf8',
    },
  );
  return r.status === 0 ? r.stdout : null;
}

(async () => {
  const prod = { NODE_ENV: 'production' };
  for (const [label, secret] of [
    ['no APP_SECRET', undefined],
    ['a short APP_SECRET', 'short-secret'],
    ['a placeholder APP_SECRET', 'changeme'],
    ['a repetitive APP_SECRET', 'a'.repeat(40)],
  ]) {
    const r = await start(secret === undefined ? prod : { ...prod, APP_SECRET: secret }, 3981);
    check(
      `production with ${label}: refuses to start`,
      !r.started && r.code !== 0 && /APP_SECRET/.test(r.output),
      r.output.slice(-200),
    );
    if (r.started) await stop(r);
  }
  const ok = await start({ ...prod, APP_SECRET: GOOD }, 3982);
  check('production with a strong APP_SECRET: starts', ok.started, ok.output.slice(-200));
  if (ok.started) {
    // Request log (audit 4.6): one JSON line per API request; route pattern, never passwords or address ids.
    const SECRET_PW = 'Never-In-Logs-77';
    let logged = '';
    ok.child.stdout.on('data', (d) => (logged += d));
    ok.child.stderr.on('data', (d) => (logged += d));
    await fetch('http://127.0.0.1:3982/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: SECRET_PW }),
    });
    await fetch('http://127.0.0.1:3982/api/public/token/tok-id-in-address-123');
    await new Promise((r) => setTimeout(r, 300));
    const lines = logged
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch (err) {
          return null;
        }
      })
      .filter(Boolean);
    const login = lines.find((l) => l.route === '/api/login');
    const token = lines.find((l) => l.route === '/api/public/token/:id');
    check(
      'production logs one JSON line per request: route, status, time, request id',
      login && login.status === 401 && typeof login.ms === 'number' && login.id && token && token.status === 404,
      JSON.stringify(lines.slice(-3)),
    );
    check(
      'the log never holds passwords or ids from the address',
      logged.length > 0 && !logged.includes(SECRET_PW) && !logged.includes('tok-id-in-address-123'),
    );
  }
  if (ok.started) await stop(ok);
  const dev = await start({}, 3983);
  check(
    'development without APP_SECRET: starts (with a note)',
    dev.started && /required in production/.test(dev.output),
  );
  if (dev.started) await stop(dev);

  const sealProd = spawnSync(process.execPath, ['-e', "require('./src/services/secret-box').seal('x')"], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, NODE_ENV: 'production' },
  });
  check('production never stores a two-step secret unencrypted (no key → error)', sealProd.status !== 0);

  // Stored readable earlier → encrypted at the next start with a key.
  const db = createPool({ connectionString: DATABASE_URL, max: 2 });
  // Disposable test database: forget two-step secrets that earlier runs locked with other test keys.
  await db.query("UPDATE users SET mfa_secret = NULL WHERE mfa_secret LIKE 'e:%'");
  await db.query('DELETE FROM mfa_challenges');
  const {
    rows: [admin],
  } = await db.query("SELECT id FROM users WHERE role = 'superadmin' ORDER BY created_at LIMIT 1");
  await db.query("UPDATE users SET mfa_secret = 'p:JBSWY3DPEHPK3PXP' WHERE id = $1", [admin.id]);
  const up = await start({ ...prod, APP_SECRET: GOOD }, 3984);
  if (up.started) await stop(up);
  let {
    rows: [row],
  } = await db.query('SELECT mfa_secret FROM users WHERE id = $1', [admin.id]);
  check(
    'an unencrypted secret from before is encrypted at start-up and still reads the same',
    /Encrypted 1 two-step/.test(up.output) &&
      row.mfa_secret.startsWith('e:') &&
      openWith({ APP_SECRET: GOOD }, row.mfa_secret) === 'JBSWY3DPEHPK3PXP',
  );

  // Changing the key: new APP_SECRET + old one in APP_SECRET_PREVIOUS → re-encrypted with the new key.
  const rot = await start({ ...prod, APP_SECRET: NEW_KEY, APP_SECRET_PREVIOUS: GOOD }, 3985);
  if (rot.started) await stop(rot);
  ({
    rows: [row],
  } = await db.query('SELECT mfa_secret FROM users WHERE id = $1', [admin.id]));
  check(
    'changing APP_SECRET (old one in APP_SECRET_PREVIOUS): re-encrypted, readable with only the new key',
    openWith({ APP_SECRET: NEW_KEY }, row.mfa_secret) === 'JBSWY3DPEHPK3PXP' &&
      openWith({ APP_SECRET: GOOD }, row.mfa_secret) === null,
  );
  await db.query('UPDATE users SET mfa_secret = NULL WHERE id = $1', [admin.id]);
  await db.end();

  console.log(`Start-up rules: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error('Start-up test crashed:', e);
  process.exit(1);
});
