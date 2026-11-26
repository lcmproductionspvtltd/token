'use strict';

const { LIMITS } = require('../services/uploads');

/**
 * BQuee customer app: customer accounts (sign up / sign in / profile), finding businesses,
 * booking tokens as the signed-in customer, and the customer's own token history.
 * Customer accounts are separate from owner/staff/admin users and use their own sessions.
 */

const crypto = require('crypto');
const v = require('../utils/validate');
const { badRequest, unauthorized, forbidden, notFound, HttpError } = require('../http/errors');
const { newId } = require('../utils/ids');
const { today } = require('../utils/time');
const { hashPassword, verifyPassword, validatePassword } = require('../services/auth');
const serialize = require('../services/serializers');

const SESSION_DAYS = 90; // customers stay signed in on their phone
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const customerJson = (c) => ({
  id: c.id,
  name: c.name,
  email: c.email || '',
  mobile: c.mobile,
  photo: c.photo_url || '',
  createdAt: c.created_at instanceof Date ? c.created_at.getTime() : c.created_at,
});

module.exports = function customerRoutes(router, { db, auth, tokens, uploads, limiter, accountRequests, notify }) {
  const bearer = (req) => {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  };

  async function requireCustomer(req) {
    const token = bearer(req);
    if (!token) throw unauthorized();
    const {
      rows: [c],
    } = await db.query(
      `SELECT c.* FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
        WHERE s.token = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
    if (!c) throw unauthorized();
    if (!c.is_active) throw forbidden('Your account is disabled. Contact BQuee support.');
    return c;
  }

  async function startSession(customer) {
    const token = crypto.randomBytes(24).toString('hex');
    await db.query(
      'INSERT INTO customer_sessions (token, customer_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))',
      [sha256(token), customer.id, SESSION_DAYS],
    );
    await db.query('UPDATE customers SET last_seen_at = now() WHERE id = $1', [customer.id]);
    return { token, customer: customerJson(customer) };
  }

  // Swaps the session for a new one and ends the old one – the app does this after moving its token
  // into the phone's secure storage, so a copy left in the old plain storage stops working (F-01).
  router.post('/api/customer/session/rotate', async ({ req }) => {
    const old = bearer(req);
    const c = await requireCustomer(req);
    const fresh = await startSession(c);
    await db.query('DELETE FROM customer_sessions WHERE token = $1', [sha256(old)]);
    return { token: fresh.token };
  });

  /** Mobile numbers are compared without spaces, dashes or brackets. */
  const cleanMobile = (m) => v.mobile(m).replace(/[\s\-()]/g, '');

  async function assertFree(mobile, email, exceptId = '') {
    const { rows } = await db.query(
      `SELECT mobile, email FROM customers WHERE id <> $3 AND (mobile = $1 OR ($2 <> '' AND email = $2))`,
      [mobile, email, exceptId],
    );
    if (rows.some((r) => r.mobile === mobile))
      throw new HttpError(409, 'An account with this mobile number already exists. Sign in instead.');
    if (rows.length) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  }

  /* ---------------- account ---------------- */

  router.post('/api/customer/signup', async ({ body, ip }) => {
    await limiter.check('customer-signup', ip, 10, 60 * 60_000);
    const name = v.required(v.text(body.name, 60), 'Name');
    const mobile = cleanMobile(body.mobile);
    const email = v.email(body.email);
    const password = validatePassword(body.password);
    await assertFree(mobile, email);
    const id = newId(10);
    const photo = body.photo ? await uploads.replace(body.photo, '', LIMITS.photo) : '';
    const {
      rows: [c],
    } = await db.query(
      `INSERT INTO customers (id, name, email, mobile, password_hash, photo_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, name, email, mobile, await hashPassword(password), photo],
    );
    return startSession(c);
  });

  router.post('/api/customer/login', async ({ body, ip }) => {
    await limiter.check('customer-login', ip, 20, 10 * 60_000);
    const login = v.text(body.login, 120).toLowerCase();
    if (!login || !body.password) throw badRequest('Enter your mobile number or email, and your password');
    const mobile = login.replace(/[\s\-()]/g, '');
    // Per account too (wrong passwords only).
    return limiter.attempt('customer-login-account', login, 10, 15 * 60_000, async () => {
      const {
        rows: [c],
      } = await db.query('SELECT * FROM customers WHERE email = $1 OR mobile = $2 LIMIT 1', [login, mobile]);
      if (!c || !(await verifyPassword(body.password, c.password_hash)))
        throw unauthorized('Wrong mobile/email or password');
      if (!c.is_active) throw forbidden('Your account is disabled. Contact BQuee support.');
      return startSession(c);
    });
  });

  router.post('/api/customer/logout', async ({ req }) => {
    const token = bearer(req);
    if (token) await db.query('DELETE FROM customer_sessions WHERE token = $1', [sha256(token)]);
    return { ok: true };
  });

  router.get('/api/customer/me', async ({ req }) => customerJson(await requireCustomer(req)));

  // The customer's notifications ("It's your turn…"): same light "anything after #id?" check as staff.
  router.get('/api/customer/notifications', async ({ req, query }) => {
    const c = await requireCustomer(req);
    return notify.feed({ customerId: c.id }, query && query.after);
  });
  router.post('/api/customer/notifications/read', async ({ req, body }) => {
    const c = await requireCustomer(req);
    return notify.markRead({ customerId: c.id }, body.upTo);
  });

  router.put('/api/customer/me', async ({ req, body }) => {
    const c = await requireCustomer(req);
    const name = v.required(v.text(body.name ?? c.name, 60), 'Name');
    const mobile = body.mobile === undefined ? c.mobile : cleanMobile(body.mobile);
    const email = body.email === undefined ? c.email : v.email(body.email);
    await assertFree(mobile, email, c.id);
    let hash = c.password_hash;
    if (body.newPassword) {
      if (!(await verifyPassword(body.currentPassword, c.password_hash)))
        throw badRequest('Your current password is wrong');
      hash = await hashPassword(validatePassword(body.newPassword));
    }
    const photo = await uploads.replace(body.photo, c.photo_url, LIMITS.photo);
    const {
      rows: [u],
    } = await db.query(
      'UPDATE customers SET name = $2, mobile = $3, email = $4, photo_url = $5, password_hash = $6 WHERE id = $1 RETURNING *',
      [c.id, name, mobile, email, photo, hash],
    );
    return customerJson(u);
  });

  /* ---------------- account deletion / deactivation requests ---------------- */

  const customerWho = (c) => ({
    role: 'customer',
    customerId: c.id,
    name: c.name,
    email: c.email || '',
    mobile: c.mobile || '',
    passwordHash: c.password_hash,
  });
  router.get('/api/customer/account-request', async ({ req }) =>
    accountRequests.mine(customerWho(await requireCustomer(req))),
  );
  router.post('/api/customer/account-request', async ({ req, body, ip }) => {
    await limiter.check('account-request', ip, 20, 60 * 60_000); // each try checks the password
    return accountRequests.create(customerWho(await requireCustomer(req)), body);
  });
  router.post('/api/customer/account-request/:id/cancel', async ({ req, params }) =>
    accountRequests.cancel(customerWho(await requireCustomer(req)), params.id),
  );

  /* ---------------- businesses ---------------- */

  router.get('/api/customer/businesses', async ({ req }) => {
    await requireCustomer(req);
    const { rows: salons } = await db.query(
      `SELECT s.*, c.name AS cat_name, c.icon AS cat_icon, c.color AS cat_color
         FROM salons s LEFT JOIN business_categories c ON c.id = s.category_id
        WHERE s.is_active AND (s.expires_on IS NULL OR s.expires_on >= $1::date)
        ORDER BY s.name`,
      [today()],
    );
    const ids = salons.map((s) => s.id);
    const { rows: branches } = ids.length
      ? await db.query(
          `SELECT b.*,
                  (SELECT count(*)::int FROM tokens t WHERE t.branch_id = b.id AND t.token_date = $2 AND t.status = 'waiting') AS waiting,
                  (SELECT count(*)::int FROM staff st WHERE st.branch_id = b.id AND st.is_active AND st.is_online) AS online
             FROM branches b WHERE b.salon_id = ANY($1) AND b.is_active ORDER BY b.created_at`,
          [ids, today()],
        )
      : { rows: [] };
    const { rows: categories } = await db.query('SELECT id, name, icon, color FROM business_categories ORDER BY name');
    return {
      categories,
      businesses: salons
        .map((s) => ({
          ...serialize.salonPublic(s),
          category: s.category_id
            ? { id: s.category_id, name: s.cat_name, icon: s.cat_icon, color: s.cat_color }
            : null,
          branches: branches
            .filter((b) => b.salon_id === s.id)
            .map((b) => ({ ...serialize.branch(b), waiting: b.waiting, open: b.online > 0 })),
        }))
        .filter((s) => s.branches.length),
    };
  });

  /* ---------------- tokens ---------------- */

  router.post('/api/customer/book', async ({ req, body, ip }) => {
    const c = await requireCustomer(req);
    await limiter.check('book', ip, 30, 10 * 60_000);
    const items = (Array.isArray(body.items) ? body.items : []).map((i) => ({
      serviceId: v.text(i && i.serviceId, 40),
      staffId: v.text(i && i.staffId, 40),
    }));
    const id = await tokens.book({
      branchId: v.text(body.branchId, 40),
      customer: { name: c.name, mobile: c.mobile, email: c.email || '' },
      items,
      offerId: v.text(body.offerId, 40),
      customerId: c.id,
    });
    return { id };
  });

  router.get('/api/customer/tokens', async ({ req }) => {
    const c = await requireCustomer(req);
    await tokens.expireStaleTokens();
    const rows = await tokens.findTokens('t.customer_id = $1', [c.id]);
    const list = rows
      .reverse()
      .slice(0, 500)
      .map((r) => serialize.token(r));
    await tokens.withWaits(list.filter((t) => t.status === 'waiting' || t.status === 'serving'));
    const salonIds = [...new Set(list.map((t) => t.salonId))];
    const branchIds = [...new Set(list.map((t) => t.branchId))];
    const [{ rows: salons }, { rows: branches }] = await Promise.all([
      db.query('SELECT * FROM salons WHERE id = ANY($1)', [salonIds]),
      db.query('SELECT * FROM branches WHERE id = ANY($1)', [branchIds]),
    ]);
    const salonOf = new Map(salons.map((s) => [s.id, s]));
    const branchOf = new Map(branches.map((b) => [b.id, b]));
    return {
      tokens: list.map((t) => {
        const s = salonOf.get(t.salonId) || {};
        const b = branchOf.get(t.branchId) || {};
        return {
          ...t,
          label: (t.prefix ? t.prefix + '-' : '#') + String(t.number).padStart(3, '0'),
          business: {
            id: s.id,
            name: s.name || '',
            logo: s.logo_url || '',
            color: s.brand_color || '',
            currency: s.currency || '₹',
          },
          branch: { id: b.id, name: b.name || '', address: b.address || '', active: !!b.is_active },
        };
      }),
    };
  });

  router.get('/api/customer/tokens/:id', async ({ req, params }) => {
    const c = await requireCustomer(req);
    const {
      rows: [own],
    } = await db.query('SELECT 1 FROM tokens WHERE id = $1 AND customer_id = $2', [params.id, c.id]);
    if (!own) throw notFound('Token not found');
    return tokens.view(params.id, null);
  });

  /* ---------------- super admin ---------------- */

  router.get('/api/admin/customers', async ({ req }) => {
    await auth.requireUser(req, 'superadmin', 'platform_staff');
    const { rows } = await db.query(
      `SELECT c.*,
              (SELECT count(*)::int FROM tokens t WHERE t.customer_id = c.id) AS token_count,
              (SELECT max(t.created_at) FROM tokens t WHERE t.customer_id = c.id) AS last_token_at
         FROM customers c ORDER BY c.created_at DESC LIMIT 5000`,
    );
    return {
      customers: rows.map((c) => ({
        ...customerJson(c),
        active: c.is_active,
        tokens: c.token_count,
        lastTokenAt: c.last_token_at ? new Date(c.last_token_at).getTime() : null,
        lastSeenAt: c.last_seen_at ? new Date(c.last_seen_at).getTime() : null,
      })),
    };
  });

  router.put('/api/admin/customers/:id', async ({ req, params, body }) => {
    await auth.requireUser(req, 'superadmin');
    const active = body.active !== false;
    const { rowCount } = await db.query('UPDATE customers SET is_active = $2 WHERE id = $1', [params.id, active]);
    if (!rowCount) throw notFound('Customer not found');
    if (!active) await db.query('DELETE FROM customer_sessions WHERE customer_id = $1', [params.id]);
    return { ok: true };
  });
};
