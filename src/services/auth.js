'use strict';

/**
 * Authentication: password hashing (scrypt), sessions, two-step sign-in and role checks.
 * Session tokens are random; only their SHA-256 hash is stored in the database.
 *
 * Sessions reach the server in one of two ways:
 *   website  an HttpOnly cookie that page scripts can't read (audit F-04) + a CSRF cookie/header pair
 *   apps     "Authorization: Bearer <token>" (the token lives in the phone's Keystore/Keychain)
 *
 * Two-step sign-in (authenticator app codes) is required for the super admin, the BQuee team and
 * business owners: after the right password they get a short-lived "challenge" and must enter a
 * code (or set the authenticator up first). See loginStep() / completeMfa().
 */

const crypto = require('crypto');
const { promisify } = require('util');
const { badRequest, unauthorized, forbidden } = require('../http/errors');
const { newId } = require('../utils/ids');
const { today } = require('../utils/time');
const { featuresOf } = require('./features');
const totp = require('./totp');
const secretBox = require('./secret-box');
const { isCommonPassword } = require('./common-passwords');
const { parseCookies, cookie, addCookies } = require('../http/cookies');

const scrypt = promisify(crypto.scrypt);
const MIN_PASSWORD_LENGTH = 8;
const MIN_ADMIN_PASSWORD_LENGTH = 12; // super admin and BQuee team
const ADMIN_ROLES = ['superadmin', 'platform_staff'];
// Two-step sign-in: always required for the accounts that can see every business; business owners
// choose to switch it on (then it is asked at every sign-in). Staff and customers don't use it.
const MFA_REQUIRED = ['superadmin', 'platform_staff'];
const MFA_OPTIONAL = ['owner'];
const MFA_ROLES = [...MFA_REQUIRED, ...MFA_OPTIONAL];
// How long a session lasts before signing in again: shorter for the most powerful accounts.
const SESSION_HOURS = { superadmin: 12, platform_staff: 12, owner: 14 * 24, staff: 30 * 24 };
const CHALLENGE_MINUTES = 10;
const MAX_CODE_TRIES = 5;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, salt, hash] = String(stored || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(String(password || ''), Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Checks a new password. Admin and team passwords need 12+ characters; very common ones are refused. */
function validatePassword(password, { role } = {}) {
  const value = String(password || '');
  const min = ADMIN_ROLES.includes(role) ? MIN_ADMIN_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH;
  if (value.length < min) throw badRequest(`Password must be at least ${min} characters`);
  if (value.length > 200) throw badRequest('Password must be at most 200 characters');
  if (isCommonPassword(value)) throw badRequest('That password is too easy to guess. Please choose another one.');
  return value;
}

const USER_QUERY = `
  SELECT u.id, u.role, u.username, u.email, u.name, u.password_hash, u.salon_id, u.staff_id,
         u.permissions, u.is_active, u.mfa_secret, u.mfa_enabled_at, u.mfa_last_step, u.has_password,
         cardinality(u.mfa_backup_codes) AS mfa_backup_left,
         s.name AS salon_name, s.slug AS salon_slug, s.is_active AS salon_active,
         s.expires_on::text AS salon_expires_on, s.features AS salon_features, st.is_active AS staff_active
    FROM users u
    LEFT JOIN salons s ON s.id = u.salon_id
    LEFT JOIN staff st ON st.id = u.staff_id`;

function toPublicUser(row) {
  return {
    id: row.id,
    role: row.role,
    username: row.username,
    email: row.email || '',
    name: row.name,
    salonId: row.salon_id,
    staffId: row.staff_id,
    salonName: row.salon_name || '',
    salonSlug: row.salon_slug || '',
    // false for owners who signed up with Google/Apple and haven't set a password yet.
    hasPassword: row.has_password !== false,
    // Platform staff permissions ("*" = everything, for the super admin).
    permissions: row.role === 'superadmin' ? ['*'] : row.role === 'platform_staff' ? parseList(row.permissions) : [],
    // Menus and features the super admin allows for this business.
    ...(row.salon_id ? { features: featuresOf(row.salon_features) } : {}),
    mfa: {
      required: MFA_REQUIRED.includes(row.role),
      // An owner can switch it on or off in their menu.
      optional: MFA_OPTIONAL.includes(row.role),
      enabled: !!row.mfa_enabled_at,
      backupCodesLeft: Number(row.mfa_backup_left || 0),
    },
  };
}

/** Ten one-time backup codes like "4f7k-2m9q" (shown once; only their hashes are stored). */
function newBackupCodes() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => {
    const b = crypto.randomBytes(8);
    const s = Array.from(b, (x) => alphabet[x % alphabet.length]).join('');
    return s.slice(0, 4) + '-' + s.slice(4);
  });
}
const backupHash = (code) =>
  sha256(
    'bquee-backup:' +
      String(code || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ''),
  );

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string')
    return value
      .replace(/^\{|\}$/g, '')
      .split(',')
      .filter(Boolean);
  return [];
}

function createAuthService(db, config) {
  /** Salon disabled / plan expired / staff deactivated → no access. */
  function assertCanUseAccount(user) {
    if (user.role === 'superadmin') return;
    // A deactivated login (approved deactivation request, or switched off by an admin) can't be used.
    if (user.is_active === false) throw forbidden('Your account is deactivated. Contact the BQuee admin.');
    if (user.role === 'platform_staff') return;
    if (!user.salon_active) throw forbidden('This business account is disabled. Contact support.');
    if (user.salon_expires_on && user.salon_expires_on < today())
      throw forbidden('Subscription expired. Contact support to renew.');
    if (user.role === 'staff' && !user.staff_active)
      throw forbidden('Your staff account is inactive. Please contact your service owner.');
  }

  /* ---- where the session token comes from ---- */

  /** Is this request on HTTPS (directly, or behind a proxy that says so)? */
  const isSecure = (req) =>
    !!config.production ||
    !!(config.https && config.https.certFile) ||
    (config.trustProxy && String(req.headers['x-forwarded-proto'] || '') === 'https');
  // On HTTPS the cookies get the "__Host-" prefix: the browser then only accepts them from this exact
  // site, over HTTPS, for the whole site – no other subdomain can set or overwrite them.
  const names = (req) =>
    isSecure(req)
      ? { session: '__Host-bq_session', csrf: '__Host-bq_csrf' }
      : { session: 'bq_session', csrf: 'bq_csrf' };

  /** { token, via: 'bearer' | 'cookie' } – apps send a Bearer header, the website a cookie. */
  function credentialsOf(req) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) return { token: header.slice(7).trim(), via: 'bearer' };
    const c = parseCookies(req);
    const token = c['__Host-bq_session'] || c.bq_session || '';
    return { token, via: token ? 'cookie' : '' };
  }
  const tokenFrom = (req) => credentialsOf(req).token;

  /** Does a website request carry the matching CSRF value (cookie = header)? */
  function csrfOk(req) {
    const c = parseCookies(req);
    const expected = c['__Host-bq_csrf'] || c.bq_csrf || '';
    const given = String(req.headers['x-csrf-token'] || '');
    return (
      expected.length >= 20 &&
      given.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    );
  }

  /**
   * Starts a session. Website (header X-BQuee-Client: web): sets the cookies and returns only the
   * user. Apps: returns { token, user }.
   */
  async function issueSession(user, req, res) {
    const web = String(req.headers['x-bquee-client'] || '') === 'web';
    const token = crypto.randomBytes(24).toString('hex');
    const hours = SESSION_HOURS[user.role] || 24;
    await db.query(
      `INSERT INTO sessions (token, user_id, expires_at, client) VALUES ($1, $2, now() + make_interval(hours => $3), $4)`,
      [sha256(token), user.id, hours, web ? 'web' : 'app'],
    );
    if (!web) return { token, user: toPublicUser(user) };
    const n = names(req);
    const secure = isSecure(req);
    addCookies(res, [
      cookie(n.session, token, { maxAge: hours * 3600, secure }),
      cookie(n.csrf, crypto.randomBytes(24).toString('hex'), { maxAge: hours * 3600, secure, httpOnly: false }),
    ]);
    return { user: toPublicUser(user) };
  }

  function clearCookies(req, res) {
    const n = names(req);
    const secure = isSecure(req);
    addCookies(res, [
      cookie(n.session, '', { maxAge: 0, secure }),
      cookie(n.csrf, '', { maxAge: 0, secure, httpOnly: false }),
    ]);
  }

  /* ---- two-step sign-in ---- */

  async function newChallenge(user, purpose) {
    const token = crypto.randomBytes(24).toString('hex');
    const secret = purpose === 'setup' ? totp.newSecret() : null;
    await db.query('DELETE FROM mfa_challenges WHERE user_id = $1', [user.id]);
    await db.query(
      `INSERT INTO mfa_challenges (id, user_id, purpose, secret, expires_at) VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
      [sha256(token), user.id, purpose, secret ? secretBox.seal(secret) : null, CHALLENGE_MINUTES],
    );
    const out = { step: purpose, challenge: token, minutes: CHALLENGE_MINUTES };
    if (secret) Object.assign(out, { secret, uri: totp.setupUri(secret, user.email || user.username) });
    return { mfa: out };
  }

  /** After the right password: a session, or the two-step sign-in step this account needs first. */
  async function loginStep(user, req, res) {
    if (user.mfa_enabled_at && MFA_ROLES.includes(user.role)) return newChallenge(user, 'verify');
    if (MFA_REQUIRED.includes(user.role)) return newChallenge(user, 'setup');
    return issueSession(user, req, res);
  }

  async function sessionUser(req) {
    const token = tokenFrom(req);
    if (!token) return null;
    const { rows } = await db.query(
      `${USER_QUERY} JOIN sessions se ON se.user_id = u.id WHERE se.token = $1 AND se.expires_at > now()`,
      [sha256(token)],
    );
    return rows[0] || null;
  }

  return {
    toPublicUser,

    /**
     * Signs in. With `salonSlug` (a salon's own sign-in page) only that salon's owner and
     * staff may sign in; any other account gets the same "wrong details" error.
     */
    async login(identifier, password, salonSlug, req, res) {
      const login = String(identifier || '')
        .trim()
        .toLowerCase();
      if (!login || !password) throw badRequest('Enter your username or email and password');
      const { rows } = await db.query(`${USER_QUERY} WHERE u.username = $1 OR u.email = $1`, [login]);
      const user = rows[0];
      if (!user || !(await verifyPassword(password, user.password_hash)))
        throw unauthorized('Wrong username/email or password');
      if (salonSlug && user.salon_slug !== String(salonSlug).toLowerCase())
        throw unauthorized('Wrong username/email or password');
      assertCanUseAccount(user);
      return loginStep(user, req, res);
    },

    /** Signs in the owner a Google/Apple sign-in found: same checks and steps as a password sign-in. */
    async loginLinked(userId, req, res) {
      const { rows } = await db.query(`${USER_QUERY} WHERE u.id = $1`, [userId]);
      const user = rows[0];
      if (!user || user.role !== 'owner') throw unauthorized('Please sign in again.');
      assertCanUseAccount(user);
      return loginStep(user, req, res);
    },

    /** Signs in an account that was just created (business sign-up): same steps as a normal sign-in. */
    async loginNewUser(userId, req, res) {
      const { rows } = await db.query(`${USER_QUERY} WHERE u.id = $1`, [userId]);
      return loginStep(rows[0], req, res);
    },

    /**
     * Second step: the code from the authenticator app (or a backup code). For a first-time setup the
     * code proves the app was set up correctly; the answer then also carries the backup codes.
     */
    async completeMfa(challengeToken, code, req, res) {
      const {
        rows: [ch],
      } = await db.query('SELECT * FROM mfa_challenges WHERE id = $1 AND expires_at > now()', [
        sha256(String(challengeToken || '')),
      ]);
      if (!ch) throw unauthorized('This sign-in step has expired. Please sign in again.');
      const { rows } = await db.query(`${USER_QUERY} WHERE u.id = $1`, [ch.user_id]);
      const user = rows[0];
      if (!user) throw unauthorized('Please sign in again.');
      assertCanUseAccount(user);

      const wrong = async () => {
        const {
          rows: [after],
        } = await db.query('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [
          ch.id,
        ]);
        if (after && after.attempts >= MAX_CODE_TRIES) {
          await db.query('DELETE FROM mfa_challenges WHERE id = $1', [ch.id]);
          throw unauthorized('Too many wrong codes. Please sign in again.');
        }
        throw unauthorized('Wrong code. Check the 6-digit code in your authenticator app and try again.');
      };

      if (ch.purpose === 'setup') {
        const secret = secretBox.open(ch.secret);
        const step = totp.verify(secret, code, 0);
        if (!step) return wrong();
        const codes = newBackupCodes();
        await db.query(
          `UPDATE users SET mfa_secret = $2, mfa_enabled_at = now(), mfa_last_step = $3, mfa_backup_codes = $4 WHERE id = $1`,
          [user.id, secretBox.seal(secret), step, codes.map(backupHash)],
        );
        await db.query('DELETE FROM mfa_challenges WHERE id = $1', [ch.id]);
        const fresh = (await db.query(`${USER_QUERY} WHERE u.id = $1`, [user.id])).rows[0];
        return { ...(await issueSession(fresh, req, res)), backupCodes: codes };
      }

      // verify: an authenticator code (each works once) or an unused backup code
      const given = String(code || '').trim();
      if (/^\d{6}$/.test(given.replace(/\s/g, ''))) {
        const step = totp.verify(secretBox.open(user.mfa_secret), given, Number(user.mfa_last_step || 0));
        if (!step) return wrong();
        // Only move forward, so two parallel sign-ins can't both use the same code.
        const { rowCount } = await db.query(
          'UPDATE users SET mfa_last_step = $2 WHERE id = $1 AND mfa_last_step < $2',
          [user.id, step],
        );
        if (!rowCount) return wrong();
      } else {
        const { rowCount } = await db.query(
          'UPDATE users SET mfa_backup_codes = array_remove(mfa_backup_codes, $2) WHERE id = $1 AND $2 = ANY (mfa_backup_codes)',
          [user.id, backupHash(given)],
        );
        if (!rowCount) return wrong();
      }
      await db.query('DELETE FROM mfa_challenges WHERE id = $1', [ch.id]);
      return issueSession(user, req, res);
    },

    /** New backup codes (the old ones stop working). Needs a current authenticator code. */
    async renewBackupCodes(user, code) {
      if (!user.mfa_enabled_at) throw badRequest('Two-step sign-in is not set up yet');
      const step = totp.verify(secretBox.open(user.mfa_secret), code, Number(user.mfa_last_step || 0));
      if (!step) throw badRequest('Wrong code. Check the 6-digit code in your authenticator app.');
      const codes = newBackupCodes();
      await db.query('UPDATE users SET mfa_last_step = $2, mfa_backup_codes = $3 WHERE id = $1', [
        user.id,
        step,
        codes.map(backupHash),
      ]);
      return codes;
    },

    /**
     * Encrypts two-step secrets stored unencrypted (development, or before APP_SECRET was set) and
     * re-encrypts those made with APP_SECRET_PREVIOUS. Run at every start-up; returns how many changed.
     */
    async upgradeSecrets() {
      let changed = 0;
      for (const [table, column] of [
        ['users', 'mfa_secret'],
        ['mfa_challenges', 'secret'],
      ]) {
        const { rows } = await db.query(`SELECT id, ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL`);
        for (const r of rows) {
          if (!secretBox.needsUpgrade(r.v)) continue;
          let sealed;
          try {
            sealed = secretBox.seal(secretBox.open(r.v));
          } catch (err) {
            // Unreadable with both keys: leave it (that person sets up two-step sign-in again); never stop start-up.
            console.error(JSON.stringify({ alert: 'mfa_secret_unreadable', table, id: r.id }));
            continue;
          }
          await db.query(`UPDATE ${table} SET ${column} = $2 WHERE id = $1 AND ${column} = $3`, [r.id, sealed, r.v]);
          changed++;
        }
      }
      return changed;
    },

    /**
     * An owner switches two-step sign-in on from their menu: a new secret (shown as a QR code), saved
     * only once a right code from the authenticator app proves it was added.
     */
    async startMfaSetup(user) {
      if (!MFA_OPTIONAL.includes(user.role)) throw forbidden('Two-step sign-in is always on for this account');
      if (user.mfa_enabled_at) throw badRequest('Two-step sign-in is already on');
      const { mfa } = await newChallenge(user, 'setup');
      return { challenge: mfa.challenge, secret: mfa.secret, uri: mfa.uri, minutes: mfa.minutes };
    },

    async confirmMfaSetup(user, challengeToken, code) {
      const {
        rows: [ch],
      } = await db.query(
        "SELECT * FROM mfa_challenges WHERE id = $1 AND user_id = $2 AND purpose = 'setup' AND expires_at > now()",
        [sha256(String(challengeToken || '')), user.id],
      );
      if (!ch) throw badRequest('This setup has expired. Start again from your menu.');
      const secret = secretBox.open(ch.secret);
      const step = totp.verify(secret, code, 0);
      if (!step) {
        await db.query('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = $1', [ch.id]);
        if (ch.attempts + 1 >= MAX_CODE_TRIES) {
          await db.query('DELETE FROM mfa_challenges WHERE id = $1', [ch.id]);
          throw badRequest('Too many wrong codes. Start the setup again.');
        }
        throw badRequest('Wrong code. Enter the 6-digit code your authenticator app shows for BQuee.');
      }
      const codes = newBackupCodes();
      await db.query(
        `UPDATE users SET mfa_secret = $2, mfa_enabled_at = now(), mfa_last_step = $3, mfa_backup_codes = $4 WHERE id = $1`,
        [user.id, secretBox.seal(secret), step, codes.map(backupHash)],
      );
      await db.query('DELETE FROM mfa_challenges WHERE id = $1', [ch.id]);
      return codes;
    },

    /** An owner switches it off: needs a current code (or a backup code), so a stolen session can't. */
    async disableMfa(user, code) {
      if (!MFA_OPTIONAL.includes(user.role)) throw forbidden('Two-step sign-in can’t be switched off for this account');
      if (!user.mfa_enabled_at) return;
      const given = String(code || '').trim();
      let ok = false;
      if (/^\d{6}$/.test(given.replace(/\s/g, '')))
        ok = !!totp.verify(secretBox.open(user.mfa_secret), given, Number(user.mfa_last_step || 0));
      else if (given) {
        const { rows } = await db.query('SELECT 1 FROM users WHERE id = $1 AND $2 = ANY (mfa_backup_codes)', [
          user.id,
          backupHash(given),
        ]);
        ok = rows.length > 0;
      }
      if (!ok) throw badRequest('Wrong code. Enter the 6-digit code from your authenticator app (or a backup code).');
      await db.query(
        `UPDATE users SET mfa_secret = NULL, mfa_enabled_at = NULL, mfa_last_step = 0, mfa_backup_codes = '{}' WHERE id = $1`,
        [user.id],
      );
      await db.query('DELETE FROM mfa_challenges WHERE user_id = $1', [user.id]);
    },

    /** For a lost phone: two-step sign-in is cleared (required accounts set it up again at the next sign-in). */
    async resetMfa(userId) {
      await db.query(
        `UPDATE users SET mfa_secret = NULL, mfa_enabled_at = NULL, mfa_last_step = 0, mfa_backup_codes = '{}' WHERE id = $1`,
        [userId],
      );
      await db.query('DELETE FROM mfa_challenges WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    },

    csrfOk,
    credentialsOf,

    async logout(req, res) {
      const token = tokenFrom(req);
      if (token) await db.query('DELETE FROM sessions WHERE token = $1', [sha256(token)]);
      if (res) clearCookies(req, res);
    },

    /** Returns the signed-in user or throws 401/403. Pass roles to restrict access. */
    async requireUser(req, ...roles) {
      const user = await sessionUser(req);
      if (!user) throw unauthorized();
      req.actor = `${user.role}:${user.id}`; // for the request log (id only, never names or tokens)
      if (roles.length && !roles.includes(user.role)) throw forbidden();
      assertCanUseAccount(user);
      return user;
    },

    /** Same as requireUser but returns null instead of throwing. */
    async optionalUser(req) {
      try {
        return await this.requireUser(req);
      } catch (err) {
        return null;
      }
    },

    /**
     * Swaps an app session for a new token and ends the old one (same lifetime as a new sign-in).
     * The apps do this after moving their token into the phone's Keystore/Keychain (audit F-01).
     */
    async rotateSession(req) {
      const { token: old, via } = credentialsOf(req);
      if (via !== 'bearer') throw badRequest('Only for the apps');
      const user = await this.requireUser(req);
      const fresh = await issueSession(user, { headers: {} }, null);
      await db.query('DELETE FROM sessions WHERE token = $1', [sha256(old)]);
      return { token: fresh.token };
    },

    /** Signs a user out everywhere – except the session making this request, when `req` is given. */
    async revokeSessions(userId, req) {
      const keep = req ? tokenFrom(req) : '';
      await db.query('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [userId, keep ? sha256(keep) : '']);
      await db.query('DELETE FROM mfa_challenges WHERE user_id = $1', [userId]);
    },

    /** The signed-in devices of a user (newest first), for "Signed-in devices" in the profile. */
    async sessionsOf(userId, req) {
      const current = sha256(tokenFrom(req) || '-');
      const { rows } = await db.query(
        'SELECT token, client, created_at, expires_at FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC',
        [userId],
      );
      return rows.map((r) => ({
        client: r.client,
        since: new Date(r.created_at).getTime(),
        until: new Date(r.expires_at).getTime(),
        current: r.token === current,
      }));
    },

    async purgeExpiredSessions() {
      await db.query('DELETE FROM sessions WHERE expires_at < now()');
    },

    /** Creates the first super admin when the database has none. */
    async ensureSuperAdmin(log = console.log) {
      const { rows } = await db.query("SELECT 1 FROM users WHERE role = 'superadmin' LIMIT 1");
      if (rows.length) return;
      const { username, email } = config.admin;
      let password = config.admin.password;
      const generated = !password;
      if (generated) password = crypto.randomBytes(12).toString('base64url');
      await db.query(
        `INSERT INTO users (id, role, username, email, name, password_hash) VALUES ($1, 'superadmin', $2, $3, 'Super Admin', $4)`,
        [newId(8), username, email || null, await hashPassword(validatePassword(password, { role: 'superadmin' }))],
      );
      log(
        `Created super admin "${username}"` +
          (generated ? ` with password: ${password}  (change it after signing in)` : ' (password from ADMIN_PASSWORD)'),
      );
    },
  };
}

module.exports = { createAuthService, hashPassword, verifyPassword, validatePassword, parseList };
