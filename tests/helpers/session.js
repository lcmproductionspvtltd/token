/**
 * Signing in from the tests, including two-step sign-in: an account that needs it is set up on its
 * first sign-in with the secret the server offers, and later sign-ins compute a fresh code from it
 * (each code works only once, so a second sign-in in the same 30 seconds uses the next step).
 *   const token = await login(BASE, 'owner', 'Owner@1234-bq');
 */

const totp = require('../../src/services/totp');

const fs = require('fs');

// username → { secret, lastStep, backupCodes }. Kept in a file shared by all test programs of one
// run (tests/run.js sets MFA_TEST_FILE; the browser tests use a fixed file), because each audit is
// a separate program.
const FILE = process.env.MFA_TEST_FILE || require('path').join(require('os').tmpdir(), 'bquee-test-mfa.json');
const accounts = new Map();
function load() {
  if (!FILE || !fs.existsSync(FILE)) return;
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8') || '{}'))) accounts.set(k, v);
}
function save() {
  if (FILE) fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(accounts)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(base, url, body, headers = {}) {
  const r = await fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, headers: r.headers, data: await r.json().catch(() => ({})) };
}

/** A code for this account that hasn't been used yet. */
async function freshCode(username) {
  load();
  const a = accounts.get(username);
  for (;;) {
    const now = totp.stepAt();
    const step = Math.max(now - 1, a.lastStep + 1);
    if (step <= now + 1) {
      a.lastStep = step;
      save();
      return totp.codeAt(a.secret, step);
    }
    await sleep(1000);
  }
}

/** Finishes the two-step sign-in answer `data` (if any); returns the final sign-in answer. */
async function finishMfa(base, username, data, headers = {}) {
  if (!data.mfa) return data;
  load();
  if (data.mfa.step === 'setup') {
    accounts.set(username, { secret: data.mfa.secret, lastStep: 0 });
    save();
  }
  const a = accounts.get(username);
  if (!a) throw new Error(`login ${username}: two-step code needed but the secret is unknown to the test`);
  const r = await post(
    base,
    '/api/login/mfa',
    { challenge: data.mfa.challenge, code: await freshCode(username) },
    headers,
  );
  if (r.status !== 200) throw new Error(`login ${username} (code): ${r.status} ${r.data.error || ''}`);
  if (r.data.backupCodes) {
    accounts.get(username).backupCodes = r.data.backupCodes;
    save();
  }
  return r.data;
}

/** Signs in and returns the session token (apps' way). */
async function login(base, username, password, extra = {}) {
  const r = await post(base, '/api/login', { login: username, password, ...extra });
  if (r.status !== 200) throw new Error(`login ${username}: ${r.status} ${r.data.error || ''}`);
  return (await finishMfa(base, username, r.data)).token;
}

/**
 * Browser version: fills the sign-in form on the open page and completes two-step sign-in
 * (reading the key shown on the setup screen) – for the Playwright tests in tests/ui.
 */
async function uiLogin(page, username, password) {
  await page.fill('input[name=username]', username);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit]');
  const next = await Promise.race([
    page.waitForSelector('.mfa', { timeout: 15000 }).then(() => 'mfa'),
    page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 15000 }).then(() => 'in'),
  ]);
  if (next === 'in') return;
  // Business owners: a code emailed to them (read from MAIL_LOG_FILE, where the test server writes emails).
  if (await page.$('text=Check your email')) {
    const code = await emailedCode();
    if (!code) throw new Error(`ui login ${username}: a sign-in code was emailed but MAIL_LOG_FILE has none`);
    await page.fill('.mfa input', code);
    await page.click('.mfa button[type=submit]');
    const after = await Promise.race([
      page.waitForSelector('.mfa-key, input[name=code]', { timeout: 15000 }).then(() => 'mfa'),
      page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 15000 }).then(() => 'in'),
    ]);
    if (after === 'in') return;
  }
  load();
  const key = await page.$('.mfa-key code');
  if (key) {
    accounts.set(username, { secret: (await key.textContent()).replace(/\s/g, ''), lastStep: 0 });
    save();
  }
  if (!accounts.get(username)) throw new Error(`ui login ${username}: two-step code needed but the secret is unknown`);
  await page.fill('input[name=code]', await freshCode(username));
  await page.click('.mfa button[type=submit]');
  if (key) {
    await page.waitForSelector('.mfa-codes', { timeout: 15000 });
    await page.click('text=I’ve saved them – continue');
  }
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 15000 });
}

/** The newest 6-digit code in the test emails (MAIL_LOG_FILE), waiting a moment for it to arrive. */
async function emailedCode() {
  const file = process.env.MAIL_LOG_FILE;
  for (let i = 0; i < 40 && file; i++) {
    if (fs.existsSync(file)) {
      const last = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).pop();
      const m = last && JSON.parse(last).text.match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

module.exports = { login, post, finishMfa, accounts, uiLogin };
