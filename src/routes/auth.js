'use strict';

/** Sign in (with two-step sign-in where required) / out, and the signed-in user's own profile, password and devices. */

const v = require('../utils/validate');
const { badRequest } = require('../http/errors');
const { hashPassword, verifyPassword, validatePassword } = require('../services/auth');
const { assertLoginAvailable } = require('../services/accounts');

module.exports = function authRoutes(router, { db, auth, limiter }) {
  router.get('/api/health', async () => {
    await db.query('SELECT 1');
    // version: the Git commit running (set GIT_COMMIT when starting) – compare with GitHub after a deploy.
    const version = String(process.env.GIT_COMMIT || 'dev').slice(0, 12);
    return { ok: true, version, time: new Date().toISOString() };
  });

  // Browsers send what the Content-Security-Policy blocked (an injected script, a wrong image…).
  // Logged briefly (a few per minute per address) so attacks and mistakes are noticed.
  router.post('/api/csp-report', async ({ body, ip }) => {
    await limiter.check('csp-report', ip, 5, 60_000);
    const r = (body && (body['csp-report'] || body)) || {};
    console.warn(
      'CSP blocked:',
      JSON.stringify({
        page: String(r['document-uri'] || '').slice(0, 200),
        blocked: String(r['blocked-uri'] || '').slice(0, 200),
        rule: String(r['violated-directive'] || '').slice(0, 80),
      }),
    );
    return { ok: true };
  });

  router.post('/api/login', async ({ req, res, body, ip }) => {
    await limiter.check('login', ip, 20, 10 * 60_000);
    // Also per account (wrong passwords only), so guessing one account's password from many
    // addresses is stopped too.
    const account = String(body.login || body.username || '')
      .trim()
      .toLowerCase();
    return limiter.attempt('login-account', account, 10, 15 * 60_000, () =>
      auth.login(body.login || body.username, body.password, body.salon, req, res),
    );
  });

  // Second step: { challenge, code } – a code from the authenticator app, or a backup code.
  router.post('/api/login/mfa', async ({ req, res, body, ip }) => {
    await limiter.check('mfa', ip, 30, 10 * 60_000);
    return auth.completeMfa(body.challenge, body.code, req, res);
  });

  router.post('/api/logout', async ({ req, res }) => {
    await auth.logout(req, res);
    return { ok: true };
  });

  // Two-step sign-in status, and new backup codes (needs a current code).
  router.get('/api/me/mfa', async ({ req }) => auth.toPublicUser(await auth.requireUser(req)).mfa);
  router.post('/api/me/mfa/backup-codes', async ({ req, body, ip }) => {
    await limiter.check('mfa', ip, 30, 10 * 60_000);
    const user = await auth.requireUser(req);
    return { backupCodes: await auth.renewBackupCodes(user, body.code) };
  });

  // Business owners switch two-step sign-in on (QR code → code from the app) or off (needs a code).
  router.post('/api/me/mfa/setup', async ({ req, ip }) => {
    await limiter.check('mfa', ip, 30, 10 * 60_000);
    return auth.startMfaSetup(await auth.requireUser(req));
  });
  router.post('/api/me/mfa/enable', async ({ req, body, ip }) => {
    await limiter.check('mfa', ip, 30, 10 * 60_000);
    const user = await auth.requireUser(req);
    return { backupCodes: await auth.confirmMfaSetup(user, body.challenge, body.code) };
  });
  router.post('/api/me/mfa/disable', async ({ req, body, ip }) => {
    await limiter.check('mfa', ip, 30, 10 * 60_000);
    await auth.disableMfa(await auth.requireUser(req), body.code);
    return { ok: true };
  });

  router.post('/api/session/rotate', async ({ req }) => auth.rotateSession(req));

  // Signed-in devices, and signing out all the others.
  router.get('/api/me/sessions', async ({ req }) => {
    const user = await auth.requireUser(req);
    return { sessions: await auth.sessionsOf(user.id, req) };
  });
  router.post('/api/me/sessions/revoke-others', async ({ req }) => {
    const user = await auth.requireUser(req);
    await auth.revokeSessions(user.id, req);
    return { ok: true };
  });

  router.get('/api/me', async ({ req }) => auth.toPublicUser(await auth.requireUser(req)));

  router.put('/api/me/profile', async ({ req, body }) => {
    const user = await auth.requireUser(req);
    const name = body.name !== undefined ? v.required(v.text(body.name, 60), 'Name') : user.name;
    const email = body.email !== undefined ? v.email(body.email) : user.email || '';
    let username = user.username;
    if (user.role === 'superadmin' && body.username !== undefined)
      username = v.required(v.username(body.username), 'Username');

    await assertLoginAvailable(db, username, user.id);
    await assertLoginAvailable(db, email, user.id);
    await db.query('UPDATE users SET name = $2, email = $3, username = $4 WHERE id = $1', [
      user.id,
      name,
      email || null,
      username,
    ]);
    return auth.toPublicUser({ ...user, name, email, username });
  });

  router.put('/api/me/password', async ({ req, body, ip }) => {
    await limiter.check('password', ip, 10, 10 * 60_000);
    const user = await auth.requireUser(req);
    // Owners who signed up with Google/Apple never had a password: they set their first one without it.
    if (user.has_password !== false && !(await verifyPassword(body.oldPassword, user.password_hash)))
      throw badRequest('Current password is wrong');
    const hash = await hashPassword(validatePassword(body.newPassword, { role: user.role }));
    await db.query(
      'UPDATE users SET password_hash = $2, password_changed_at = now(), has_password = true WHERE id = $1',
      [user.id, hash],
    );
    // A changed password signs out every other device (someone else may have had it).
    await auth.revokeSessions(user.id, req);
    return { ok: true };
  });
};
