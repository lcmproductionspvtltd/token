/**
 * Test runner: `npm test`
 *
 * Uses TEST_DATABASE_URL (default: postgres://bquee:bquee@localhost:5432/bquee_test).
 * ⚠ All data in that database is deleted before the run – never point it at production.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('../src/config'); // loads .env
const { createPool } = require('../src/db/postgres');
const { migrate } = require('../src/db/migrate');

const ROOT = path.join(__dirname, '..');
const DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://bquee:bquee@localhost:5432/bquee_test';
const PORT = 4100 + Math.floor(Math.random() * 800);

function runNode(script, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code || 0));
  });
}

async function resetDatabase() {
  const db = createPool({ connectionString: DATABASE_URL, max: 1 });
  try {
    await migrate(db, () => {});
    await db.exec(
      'TRUNCATE salons, users, sessions, images, default_services, service_groups, business_categories, site_content, customers, referral_links, support_tickets RESTART IDENTITY CASCADE',
    );
  } finally {
    await db.end();
  }
}

async function clearRateLimits() {
  const db = createPool({ connectionString: DATABASE_URL, max: 1 });
  try {
    await db.query('DELETE FROM rate_limits');
  } finally {
    await db.end();
  }
}

async function waitForServer(url, timeoutMs = 10_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch (err) {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Server did not start');
}

(async () => {
  let failed = await runNode(path.join(__dirname, 'qr-engine.test.js'));
  failed += await runNode(path.join(__dirname, 'queue.test.js'));
  failed += await runNode(path.join(__dirname, 'static-files.test.js'));
  failed += await runNode(path.join(__dirname, 'http-rules.test.js'));
  failed += await runNode(path.join(__dirname, 'db-driver.test.js'), { TEST_DATABASE_URL: DATABASE_URL });
  failed += await runNode(path.join(__dirname, 'rate-limiter.test.js'), { TEST_DATABASE_URL: DATABASE_URL });
  failed += await runNode(path.join(__dirname, 'startup.test.js'), { TEST_DATABASE_URL: DATABASE_URL });
  failed += await runNode(path.join(__dirname, 'fx.test.js'), { TEST_DATABASE_URL: DATABASE_URL });
  failed += await runNode(path.join(__dirname, 'oauth.test.js'), { TEST_DATABASE_URL: DATABASE_URL });

  await resetDatabase();
  // Authenticator secrets of the test accounts, shared by the audits of this run (see helpers/session.js).
  process.env.MFA_TEST_FILE = path.join(os.tmpdir(), 'bquee-mfa-' + process.pid + '.json');
  fs.writeFileSync(process.env.MFA_TEST_FILE, '{}');
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bquee-uploads-'));
  // Each audit gets freshly started server(s) on the same database, with the shared rate-limit
  // counts cleared first, so limits start from zero. The concurrency audit uses two servers.
  // The long audits send hundreds of requests a minute from one address, so their servers get a high
  // per-address allowance; the concurrency audit tests the real limit (600 a minute).
  const many = { API_REQUESTS_PER_MINUTE: '100000' };
  const audits = [
    ['api-audit.js', 1, many],
    ['security-audit.js', 1, many],
    ['account-requests-audit.js', 1, many],
    ['session-audit.js', 1, { ...many, TRUST_PROXY: '1' }],
    ['concurrency-audit.js', 2, { TRUST_PROXY: '1' }],
  ];
  let port = PORT;
  for (const [audit, count, extraEnv = {}] of audits) {
    await clearRateLimits();
    const servers = [];
    const bases = [];
    for (let i = 0; i < count; i++) {
      port += 1;
      servers.push(
        spawn(process.execPath, [path.join(ROOT, 'server.js')], {
          env: {
            ...process.env,
            ...extraEnv,
            PORT: String(port),
            DATABASE_URL,
            UPLOADS_DIR: uploadsDir,
            ADMIN_USERNAME: 'admin',
            ADMIN_PASSWORD: 'Admin@12345-bq',
            // Every test server shares one key, like production servers must.
            APP_SECRET: 'test-key-for-all-servers-Qm7Vx2Lp9Rz4',
          },
          stdio: ['ignore', 'ignore', 'inherit'],
        }),
      );
      bases.push(`http://localhost:${port}`);
    }
    try {
      for (const b of bases) await waitForServer(b + '/api/health');
      failed += await runNode(path.join(__dirname, audit), {
        BASE: bases[0],
        BASE2: bases[1] || '',
        TEST_DATABASE_URL: DATABASE_URL,
      });
    } finally {
      servers.forEach((srv) => srv.kill());
    }
  }
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  fs.rmSync(process.env.MFA_TEST_FILE, { force: true });
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
