'use strict';

/**
 * "Continue with Google / Apple" (src/services/oauth.js, src/routes/oauth.js) against a local stand-in
 * for Google and Apple that signs its answers with test keys – no real accounts needed.
 *   - website: start → Google → back with a ticket tied to this browser's cookie → sign up → sign in
 *   - app: the same with PKCE (only the app that started it can use the ticket)
 *   - Apple: its form-post answer, and the ES256 client secret it requires
 *   - refused: wrong nonce, forged signature, replayed state, staff/admin emails, used tickets
 */

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');
const { pkce } = require('../src/services/oauth');
const { createPool } = require('../src/db/postgres');

const DATABASE_URL = process.env.TEST_DATABASE_URL;
// Fresh names each run (this test runs before the database is wiped for the audits).
const RUN = crypto.randomBytes(3).toString('hex');
let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name + (detail ? ` – ${detail}` : ''));
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}
const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');

// ---- the stand-in provider ----
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }); // an attacker's key
const apple = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const codes = new Map(); // code → { provider, claims, forge }
let appleSecretOk = null;

function idToken(claims, key = rsa.privateKey) {
  const head = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64(claims);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}
function checkAppleSecret(jwt) {
  const [h, p, s] = String(jwt).split('.');
  const ok = crypto.verify(
    'sha256',
    Buffer.from(`${h}.${p}`),
    { key: apple.publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(s, 'base64url'),
  );
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  return ok && claims.iss === 'TEAM123' && claims.sub === 'com.bquee.web' && claims.aud === 'https://appleid.apple.com';
}

const provider = http.createServer((req, res) => {
  const [, prov, what] = req.url.split('?')[0].split('/');
  if (what === 'jwks') return res.end(JSON.stringify({ keys: [jwk] }));
  if (what === 'token') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const f = Object.fromEntries(new URLSearchParams(body));
      if (prov === 'apple') appleSecretOk = checkAppleSecret(f.client_secret);
      const c = codes.get(f.code);
      if (!c) return res.end(JSON.stringify({ error: 'invalid_grant' }));
      codes.delete(f.code);
      res.end(JSON.stringify({ id_token: idToken(c.claims, c.forge ? other.privateKey : rsa.privateKey) }));
    });
    return;
  }
  res.statusCode = 404;
  res.end();
});

let BASE = '';
let FAKE = '';
const get = (url, headers = {}) => fetch(BASE + url, { redirect: 'manual', headers });
async function post(url, body, headers = {}) {
  const r = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const cookieOf = (r) =>
  ((r.headers.getSetCookie ? r.headers.getSetCookie() : []).find((c) => c.startsWith('bq_oauth=')) || '').split(';')[0];

/** Starts a sign-in; returns what the provider would see (state, nonce) and the browser's cookie. */
async function begin(prov, query = 'client=web') {
  const r = await get(`/api/oauth/${prov}/start?${query}`);
  const to = new URL(r.headers.get('location'));
  return {
    status: r.status,
    to,
    state: to.searchParams.get('state'),
    nonce: to.searchParams.get('nonce'),
    cookie: cookieOf(r),
  };
}
/** Google/Apple sends the person back with a code for these claims. */
function codeFor(prov, s, claims, forge = false) {
  const code = crypto.randomBytes(8).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  codes.set(code, {
    forge,
    claims: {
      iss: `${FAKE}/${prov}`,
      aud: prov === 'google' ? 'google-client.test' : 'com.bquee.web',
      exp: now + 600,
      iat: now,
      nonce: s.nonce,
      ...claims,
    },
  });
  return code;
}
const ticketOf = (location) => new URL(location, BASE).searchParams.get('social');

(async () => {
  // Earlier runs on this database may have used up the sign-in limit (60 per 10 minutes).
  const db0 = createPool({ connectionString: DATABASE_URL, max: 1 });
  await db0.query("DELETE FROM rate_limits WHERE key LIKE 'oauth%'").catch(() => {});
  await db0.end();
  await new Promise((ok) => provider.listen(0, ok));
  FAKE = `http://127.0.0.1:${provider.address().port}`;
  const port = 4300 + Math.floor(Math.random() * 500);
  BASE = `http://localhost:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      PATH: process.env.PATH,
      DATABASE_URL,
      PORT: String(port),
      ADMIN_USERNAME: 'admin',
      ADMIN_EMAIL: 'boss@bquee.test',
      ADMIN_PASSWORD: 'Admin@12345-bq',
      APP_SECRET: 'test-key-for-all-servers-Qm7Vx2Lp9Rz4',
      API_REQUESTS_PER_MINUTE: '100000',
      OAUTH_TEST_PROVIDER: FAKE,
      GOOGLE_CLIENT_ID: 'google-client.test',
      GOOGLE_CLIENT_SECRET: 'google-secret.test',
      APPLE_SERVICES_ID: 'com.bquee.web',
      APPLE_TEAM_ID: 'TEAM123',
      APPLE_KEY_ID: 'KEY123',
      APPLE_PRIVATE_KEY: apple.privateKey.export({ format: 'pem', type: 'pkcs8' }).replace(/\n/g, '\\n'),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(BASE + '/api/health')).ok) break;
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 150));
    }

    const site = await (await fetch(BASE + '/api/public/site')).json();
    check(
      'the page offers Google and Apple when they are set up',
      site.social.google === true && site.social.apple === true,
    );

    // ---- website: sign up with Google ----
    const s1 = await begin('google');
    check(
      'start sends the browser to Google with state, nonce and our return address',
      s1.status === 302 &&
        s1.to.origin + s1.to.pathname === `${FAKE}/google/auth` &&
        s1.state &&
        s1.nonce &&
        s1.to.searchParams.get('redirect_uri') === `${BASE}/api/oauth/google/callback` &&
        s1.cookie,
    );
    const back1 = await get(
      `/api/oauth/google/callback?state=${s1.state}&code=${codeFor('google', s1, { sub: `g-111-${RUN}`, email: `Sana.K${RUN}@Gmail.test`, email_verified: true, name: 'Sana K' })}`,
    );
    const t1 = ticketOf(back1.headers.get('location'));
    check(
      'Google sends the person back to /login with a ticket',
      back1.status === 302 && /^\/login\?social=/.test(back1.headers.get('location')) && t1,
    );
    check(
      'another browser (no cookie) can’t use the ticket',
      (await post('/api/oauth/exchange', { ticket: t1 })).status === 401,
    );
    const ex1 = await post('/api/oauth/exchange', { ticket: t1 }, { Cookie: s1.cookie });
    check(
      'no BQuee account yet → sign-up details from Google',
      ex1.status === 200 &&
        ex1.data.signup &&
        ex1.data.signup.email === `sana.k${RUN}@gmail.test` &&
        ex1.data.signup.name === 'Sana K',
      JSON.stringify(ex1.data),
    );
    const types = (await (await get('/api/public/site')).json()).categories || [];
    const typeId = types.length ? types[0].id : '';
    const noType = await post(
      '/api/public/signup',
      { social: t1, businessName: `Sana Salon ${RUN}`, ownerName: 'Sana K', mobile: '9876500321', package: 'Business' },
      { Cookie: s1.cookie },
    );
    check(
      'Google sign-up still fills the form: business type required (when types exist)',
      !types.length || (noType.status === 400 && noType.data.error === 'Choose your business type'),
      JSON.stringify(noType.data),
    );
    const su = await post(
      '/api/public/signup',
      {
        social: t1,
        categoryId: typeId,
        businessName: `Sana Salon ${RUN}`,
        ownerName: 'Sana K',
        mobile: '98765' + String(Date.now()).slice(-5),
        package: 'Business',
        password: 'ignored',
      },
      { Cookie: s1.cookie },
    );
    check(
      'signs up without a username or password, signed straight in',
      su.status === 200 &&
        su.data.token &&
        su.data.user.role === 'owner' &&
        su.data.user.email === `sana.k${RUN}@gmail.test` &&
        su.data.user.username === `sana.k${RUN}`,
      JSON.stringify(su.data).slice(0, 200),
    );
    // ---- a Google/Apple owner sets a password without a "current password" (once) ----
    const auth = { Authorization: 'Bearer ' + su.data.token };
    const put = (url, body) =>
      fetch(BASE + url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
    const me = async () => (await (await get('/api/me', auth)).json()) || {};
    check('a Google sign-up has no password yet', su.data.user.hasPassword === false && (await me()).hasPassword === false);
    const setPw = await put('/api/me/password', { newPassword: 'SanaOwn3r-pass!' });
    check('…and sets one without a current password', setPw.status === 200, JSON.stringify(setPw.data));
    check('…after which it has a password', (await me()).hasPassword === true);
    const again = await put('/api/me/password', { newPassword: 'SanaOwn3r-pass2!' });
    check('…and the next change asks for the current password', again.status === 400);
    check(
      'the same ticket can’t sign up twice',
      (
        await post(
          '/api/public/signup',
          { social: t1, businessName: 'Again', ownerName: 'X', mobile: '9876500322' },
          { Cookie: s1.cookie },
        )
      ).status === 401,
    );

    // ---- website: sign in again with the same Google account ----
    const s2 = await begin('google');
    const back2 = await get(
      `/api/oauth/google/callback?state=${s2.state}&code=${codeFor('google', s2, { sub: `g-111-${RUN}`, email: `sana.k${RUN}@gmail.test`, email_verified: true })}`,
    );
    const ex2 = await post(
      '/api/oauth/exchange',
      { ticket: ticketOf(back2.headers.get('location')) },
      { Cookie: s2.cookie },
    );
    check(
      'the linked Google account signs the owner in',
      ex2.status === 200 && ex2.data.token && ex2.data.user.username === `sana.k${RUN}`,
    );
    const replay = await get(
      `/api/oauth/google/callback?state=${s2.state}&code=${codeFor('google', s2, { sub: `g-111-${RUN}` })}`,
    );
    check('a used state is refused', /social_error=/.test(replay.headers.get('location') || ''));

    // ---- refused answers ----
    const s3 = await begin('google');
    const badNonce = await get(
      `/api/oauth/google/callback?state=${s3.state}&code=${codeFor('google', { nonce: 'other' }, { sub: `g-111-${RUN}`, email: `sana.k${RUN}@gmail.test`, email_verified: true })}`,
    );
    check('a token for another sign-in (nonce) is refused', /social_error=/.test(badNonce.headers.get('location')));
    const s4 = await begin('google');
    const forged = await get(
      `/api/oauth/google/callback?state=${s4.state}&code=${codeFor('google', s4, { sub: `g-111-${RUN}`, email: `sana.k${RUN}@gmail.test`, email_verified: true }, true)}`,
    );
    check('a token not signed by Google is refused', /social_error=/.test(forged.headers.get('location')));
    // The super admin's email (set here: the database may already have a super admin from earlier tests).
    const db = createPool({ connectionString: DATABASE_URL, max: 1 });
    await db.query("UPDATE users SET email = $1 WHERE role = 'superadmin'", [`boss${RUN}@bquee.test`]);
    await db.end();
    const s5 = await begin('google');
    const admin = await get(
      `/api/oauth/google/callback?state=${s5.state}&code=${codeFor('google', s5, { sub: `g-999-${RUN}`, email: `boss${RUN}@bquee.test`, email_verified: true })}`,
    );
    check(
      'the super admin’s email can’t sign in with Google (password + code only)',
      /social_error=.*username/.test(decodeURIComponent(admin.headers.get('location') || '')),
    );
    const s6 = await begin('google');
    const unverified = await get(
      `/api/oauth/google/callback?state=${s6.state}&code=${codeFor('google', s6, { sub: `g-777-${RUN}`, email: `new${RUN}@x.test`, email_verified: false })}`,
    );
    check('an unverified email can’t sign up', /social_error=/.test(unverified.headers.get('location')));

    // ---- BQuee Biz app: PKCE ----
    const verifier = crypto.randomBytes(32).toString('base64url');
    const a1 = await begin('google', `client=app&challenge=${pkce(verifier)}`);
    check('the app’s start has no cookie', a1.status === 302 && !a1.cookie);
    const appBack = await get(
      `/api/oauth/google/callback?state=${a1.state}&code=${codeFor('google', a1, { sub: `g-111-${RUN}`, email: `sana.k${RUN}@gmail.test`, email_verified: true })}`,
    );
    const appLoc = appBack.headers.get('location') || '';
    check('Google sends the app back to bqueebiz://oauth', appLoc.startsWith('bqueebiz://oauth?social='));
    const appTicket = new URL(appLoc.replace('bqueebiz://oauth', 'http://x/')).searchParams.get('social');
    check(
      'another app (wrong verifier) can’t use the ticket',
      (await post('/api/oauth/exchange', { ticket: appTicket, verifier: crypto.randomBytes(32).toString('base64url') }))
        .status === 401,
    );
    const appEx = await post('/api/oauth/exchange', { ticket: appTicket, verifier });
    check(
      'the app that started it is signed in',
      appEx.status === 200 && appEx.data.token && appEx.data.user.role === 'owner',
    );
    check(
      'the app’s start needs a real challenge',
      (await get('/api/oauth/google/start?client=app&challenge=short')).status === 400,
    );

    // ---- Apple (form post, ES256 client secret, name only the first time) ----
    const p1 = await begin('apple');
    check(
      'Apple is asked to post the answer back (form_post)',
      p1.to.searchParams.get('response_mode') === 'form_post',
    );
    const appleBack = await fetch(BASE + '/api/oauth/apple/callback', {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://appleid.apple.com' },
      body: new URLSearchParams({
        state: p1.state,
        code: codeFor('apple', p1, {
          sub: `a-222-${RUN}`,
          email: `relay${RUN}@privaterelay.appleid.test`,
          email_verified: 'true',
        }),
        user: JSON.stringify({ name: { firstName: 'Ravi', lastName: 'M' } }),
      }).toString(),
    });
    check('our client secret for Apple is a valid ES256 key', appleSecretOk === true);
    const appleEx = await post(
      '/api/oauth/exchange',
      { ticket: ticketOf(appleBack.headers.get('location')) },
      { Cookie: p1.cookie },
    );
    check(
      'Apple sign-up details include the name Apple sent once',
      appleEx.status === 200 &&
        appleEx.data.signup &&
        appleEx.data.signup.name === 'Ravi M' &&
        appleEx.data.signup.provider === 'apple',
      JSON.stringify(appleEx.data),
    );
  } finally {
    server.kill();
    provider.close();
  }

  console.log(`Google / Apple sign-in: ${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
})().catch((e) => {
  console.error('Google / Apple sign-in test crashed:', e);
  process.exit(1);
});
