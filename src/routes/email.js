'use strict';

/**
 * Email codes (src/services/email-codes.js) for business accounts and customers:
 *   - a code to prove the email at sign-up              POST /api/email-code
 *   - "confirm my email" for a signed-in user            POST /api/me/email/send, /api/me/email/verify
 *   - forgot password                                    POST /api/password/forgot, /api/password/reset
 *   - signing in after too many wrong passwords          POST /api/login/email-code (see routes/auth.js)
 *
 * "Forgot password" answers the same whether or not an account has that email (and sends in the
 * background), so it can't be used to find out who has an account.
 */

const crypto = require('crypto');
const v = require('../utils/validate');
const { badRequest } = require('../http/errors');
const { hashPassword, validatePassword } = require('../services/auth');
const { assertLoginAvailable } = require('../services/accounts');
const { assertAddress } = require('../services/mailer');

const WINDOW_HOUR = 60 * 60_000;

module.exports = function emailRoutes(router, { db, auth, limiter, emailCodes, log = console }) {
  /** A valid email we can send to (lower case), or a clear error. */
  const address = (value) => {
    const email = v.email(value);
    if (!email) throw badRequest('Enter your email');
    try {
      assertAddress(email);
    } catch (err) {
      throw badRequest('Enter a valid email address');
    }
    return email;
  };
  const limits = async (ip, email) => {
    await limiter.check('email-code', ip, 10, WINDOW_HOUR);
    await limiter.check('email-code-to', email, 5, WINDOW_HOUR);
  };
  const fakeTicket = () => crypto.randomBytes(16).toString('hex').slice(0, 32);

  /* ---- sign-up: prove the email before the account is made ---- */
  router.post('/api/email-code', async ({ body, ip }) => {
    if (!emailCodes.ready) throw badRequest('Email codes aren’t available yet.');
    const purpose = body.purpose === 'customer-signup' ? 'customer-signup' : 'signup';
    const email = address(body.email);
    await limits(ip, email);
    if (purpose === 'signup') await assertLoginAvailable(db, email);
    else {
      const { rows } = await db.query('SELECT 1 FROM customers WHERE email = $1', [email]);
      if (rows.length) throw badRequest('An account with this email already exists. Sign in instead.');
    }
    const ticket = await emailCodes.send(purpose, email);
    return { ticket, minutes: emailCodes.MINUTES };
  });

  /* ---- confirm the email of a signed-in business account ---- */
  router.post('/api/me/email/send', async ({ req, ip }) => {
    const user = await auth.requireUser(req);
    if (!user.email) throw badRequest('Add your email in your profile first');
    if (user.email_verified_at) return { verified: true };
    await limits(ip, user.email);
    const ticket = await emailCodes.send('verify', user.email, user.id);
    return { ticket, minutes: emailCodes.MINUTES };
  });
  router.post('/api/me/email/verify', async ({ req, body, ip }) => {
    await limiter.check('email-code-check', ip, 30, 10 * 60_000);
    const user = await auth.requireUser(req);
    const row = await emailCodes.check(body.ticket, 'verify', body.code, { email: user.email || '' });
    if (row.subject_id !== user.id) throw badRequest('This code has expired. Ask for a new one.');
    await db.query('UPDATE users SET email_verified_at = now() WHERE id = $1 AND lower(email) = $2', [
      user.id,
      row.email,
    ]);
    return { verified: true };
  });

  /* ---- forgot password ---- */
  router.post('/api/password/forgot', async ({ body, ip }) => {
    const customer = body.account === 'customer';
    const email = address(body.email);
    await limits(ip, email);
    if (!emailCodes.ready) throw badRequest('Password reset by email isn’t available yet. Please contact BQuee support.');
    const {
      rows: [who],
    } = customer
      ? await db.query('SELECT id FROM customers WHERE email = $1 AND is_active', [email])
      : await db.query('SELECT id FROM users WHERE lower(email) = $1 AND is_active IS NOT FALSE', [email]);
    if (!who) return { ticket: fakeTicket(), minutes: emailCodes.MINUTES };
    // Sent in the background so the answer takes the same time whether or not the account exists.
    const ticket = await emailCodes.send(customer ? 'customer-reset' : 'reset', email, who.id, {
      background: true,
      log,
    });
    return { ticket, minutes: emailCodes.MINUTES };
  });

  router.post('/api/password/reset', async ({ body, ip }) => {
    await limiter.check('email-code-check', ip, 30, 10 * 60_000);
    const customer = body.account === 'customer';
    // Check the new password first, so a too-easy one doesn't use up the code.
    const row = await emailCodes.check(body.ticket, customer ? 'customer-reset' : 'reset', body.code, {
      use: false,
    });
    if (customer) {
      const hash = await hashPassword(validatePassword(body.password));
      await emailCodes.check(body.ticket, 'customer-reset', body.code);
      await db.query(
        'UPDATE customers SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1',
        [row.subject_id, hash],
      );
      // Signed out everywhere: someone else may have known the old password.
      await db.query('DELETE FROM customer_sessions WHERE customer_id = $1', [row.subject_id]);
      await limiter.reset('customer-login-account', row.email);
      return { ok: true };
    }
    const {
      rows: [user],
    } = await db.query('SELECT id, role, username, email FROM users WHERE id = $1', [row.subject_id]);
    if (!user) throw badRequest('This code has expired. Ask for a new one.');
    const hash = await hashPassword(validatePassword(body.password, { role: user.role }));
    await emailCodes.check(body.ticket, 'reset', body.code);
    await db.query(
      `UPDATE users SET password_hash = $2, password_changed_at = now(), has_password = true,
              email_verified_at = CASE WHEN lower(email) = $3 THEN COALESCE(email_verified_at, now()) ELSE email_verified_at END
        WHERE id = $1`,
      [user.id, hash, row.email],
    );
    await auth.revokeSessions(user.id, null);
    await limiter.reset('login-account', user.username);
    await limiter.reset('login-account', String(user.email || '').toLowerCase());
    return { ok: true };
  });
};
