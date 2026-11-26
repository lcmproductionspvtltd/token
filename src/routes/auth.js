'use strict';

/** Sign in (with two-step sign-in where required) / out, and the signed-in user's own profile, password and devices. */

const crypto = require('crypto');
const v = require('../utils/validate');
const { badRequest, HttpError } = require('../http/errors');
const { hashPassword, verifyPassword, validatePassword } = require('../services/auth');
const { assertLoginAvailable } = require('../services/accounts');
const { canEmailCode } = require('../http/client-features');

const ACCOUNT_TRIES = 10; // wrong passwords per account…
const ACCOUNT_WINDOW = 15 * 60_000; // …in 15 minutes
/** "a•••@gmail.com" – enough to recognise the mailbox, not enough to learn it. */
const maskEmail = (email) => {
  const [name, domain] = String(email || '').split('@');
  return name && domain ? name.slice(0, 1) + '•••@' + domain : 'your email';
};

module.exports = function authRoutes(router, { db, auth, limiter, emailCodes, log = console }) {
  /** At most 3 sign-in code emails per account in 15 minutes, so nobody can flood an inbox. */
  const canEmail = async (user) => {
    try {
      await limiter.check('login-code-mail', user.id, 3, ACCOUNT_WINDOW);
      return true;
    } catch (err) {
      return false;
    }
  };
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
    // Too many wrong passwords on this account (someone may be guessing it, or trying to lock its owner
    // out): the real person can still get in with the right password PLUS a code we email them. The
    // answer is the same whether the password was right or wrong, so it gives a guesser nothing.
    // Only for website/app versions that can show that step (they say so in X-BQuee-Features).
    if (
      emailCodes.ready &&
      canEmailCode(req) &&
      (await limiter.count('login-account', account, ACCOUNT_WINDOW)) >= ACCOUNT_TRIES
    ) {
      const user = await auth.checkPassword(body.login || body.username, body.password, body.salon);
      let ticket = crypto.randomBytes(16).toString('hex');
      if (!user) await limiter.add('login-account', account, ACCOUNT_WINDOW, Date.now()); // still counts
      if (user && user.email && (await canEmail(user)))
        ticket = await emailCodes.send('login', user.email, user.id, { background: true, log });
      return {
        emailCode: {
          ticket,
          minutes: emailCodes.MINUTES,
          message:
            'There were too many wrong passwords on this account. If the password you entered is right, ' +
            'we’ve emailed a 6-digit sign-in code to the account’s email.',
        },
      };
    }
    return limiter.attempt('login-account', account, ACCOUNT_TRIES, ACCOUNT_WINDOW, () =>
      auth.login(body.login || body.username, body.password, body.salon, req, res, {
        emailStep: emailCodes.ready && canEmailCode(req) ? signInCode : null,
      }),
    );
  });

  /**
   * Business owners: after the right password, a 6-digit code by email (every sign-in, while email codes
   * are on and the website/app can show the step). If the email can't be sent, sign-in carries on
   * without it rather than locking every owner out (the failure is logged).
   */
  async function signInCode(user) {
    if (!(await canEmail(user))) throw new HttpError(429, 'Too many sign-in codes. Wait a few minutes and try again.');
    try {
      const ticket = await emailCodes.send('login', user.email, user.id, { wording: 'signin' });
      return {
        emailCode: {
          ticket,
          minutes: emailCodes.MINUTES,
          message: `We’ve emailed a 6-digit sign-in code to ${maskEmail(user.email)}.`,
        },
      };
    } catch (err) {
      log.error(JSON.stringify({ alert: 'email_failed', purpose: 'signin', error: String(err.message).slice(0, 200) }));
      return null;
    }
  }

  // The emailed sign-in code (every owner sign-in, or after too many wrong passwords). Two-step sign-in
  // still follows if it's on.
  router.post('/api/login/email-code', async ({ req, res, body, ip }) => {
    await limiter.check('mfa', ip, 30, 10 * 60_000);
    const row = await emailCodes.check(body.ticket, 'login', body.code);
    const result = await auth.loginById(row.subject_id, req, res);
    const {
      rows: [u],
    } = await db.query('SELECT username, email FROM users WHERE id = $1', [row.subject_id]);
    if (u) {
      await limiter.reset('login-account', u.username);
      if (u.email) await limiter.reset('login-account', u.email.toLowerCase());
    }
    return result;
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
    // A new email has to be confirmed again (only a confirmed email can be joined to Google/Apple).
    const sameEmail = (user.email || '').toLowerCase() === email;
    await db.query(
      `UPDATE users SET name = $2, email = $3, username = $4,
              email_verified_at = CASE WHEN $5 THEN email_verified_at ELSE NULL END WHERE id = $1`,
      [user.id, name, email || null, username, sameEmail],
    );
    return auth.toPublicUser({
      ...user,
      name,
      email,
      username,
      email_verified_at: sameEmail ? user.email_verified_at : null,
    });
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
