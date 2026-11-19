'use strict';

/**
 * Super admin → businesses: the list, create / edit / delete, enable / disable, menus & features
 * (one business or many). The team, referral links and the catalog (default services, categories,
 * service groups) are in admin-team.js, admin-referrals.js and admin-catalog.js.
 */

const v = require('../utils/validate');
const { badRequest, forbidden, notFound } = require('../http/errors');
const { newId } = require('../utils/ids');
const { today } = require('../utils/time');
const { hashPassword, validatePassword } = require('../services/auth');
const { assertLoginAvailable } = require('../services/accounts');
const serialize = require('../services/serializers');
const { featuresOf, cleanFeatures } = require('../services/features');
const { categoryOut, checkCategory: categoryExists } = require('../services/categories');
const adminAccess = require('./admin-access');

module.exports = function adminRoutes(router, { db, auth, uploads }) {
  const { can, admin } = adminAccess(auth);

  async function uniqueSlug(base, exceptId = null) {
    const root = v.slugify(base);
    for (let n = 1; ; n += 1) {
      const slug = n === 1 ? root : `${root}-${n}`;
      const { rows } = await db.query('SELECT 1 FROM salons WHERE slug = $1 AND id IS DISTINCT FROM $2', [
        slug,
        exceptId,
      ]);
      if (!rows.length) return slug;
    }
  }

  /** Subscription fields shared by create and update. */
  /** One service / one staff member, or many (the default). */
  const mode = (x) => (x === 'single' ? 'single' : 'multiple');

  function planFields(body, current = {}) {
    const keep = (key, fallback) => (body[key] !== undefined ? body[key] : fallback);
    return {
      name: v.required(v.text(keep('name', current.name), 80), 'Business name'),
      owner_name: v.text(keep('ownerName', current.owner_name), 80),
      owner_mobile: v.text(keep('ownerMobile', current.owner_mobile), 20),
      owner_email: v.email(keep('ownerEmail', current.owner_email)),
      plan_name: v.text(keep('plan', current.plan_name), 40),
      plan_amount: v.money(keep('amount', current.plan_amount)),
      expires_on: v.date(keep('expiresAt', current.expires_on), 'expiry date'),
      is_active: body.active !== undefined ? !!body.active : current.is_active !== false,
      currency: v.text(keep('currency', current.currency), 6) || '₹',
      category_id: v.text(keep('categoryId', current.category_id), 40) || null,
      service_mode: mode(keep('serviceMode', current.service_mode)),
      staff_mode: mode(keep('staffMode', current.staff_mode)),
    };
  }

  const checkCategory = (id) => categoryExists(db, id);

  // Menus and features of one business (what its owner and staff can see and do).
  router.put('/api/admin/salons/:id/features', async ({ req, params, body }) => {
    await admin(req, 'salons.edit', 'change a business’s menus and features');
    const {
      rows: [salon],
    } = await db.query('SELECT id, features FROM salons WHERE id = $1', [params.id]);
    if (!salon) throw notFound('Business not found');
    const features = cleanFeatures(body.features, salon.features);
    await db.query('UPDATE salons SET features = $2 WHERE id = $1', [salon.id, JSON.stringify(features)]);
    return { features: featuresOf(features) };
  });

  /*
   * Bulk change for selected businesses: switch them on/off, and/or switch menus and
   * features on/off. Only the settings sent are changed; everything else stays as it is.
   *   { ids: [...], active?: true|false, features?: { maskContacts?: bool, menus?: { reports?: bool } } }
   */
  router.post('/api/admin/salons/bulk', async ({ req, body }) => {
    const user = await admin(req);
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x) => typeof x === 'string' && x))] : [];
    if (!ids.length) throw badRequest('Select at least one business');
    if (ids.length > 1000) throw badRequest('Select at most 1000 businesses at a time');
    const hasActive = typeof body.active === 'boolean';
    const hasFeatures = !!body.features && typeof body.features === 'object' && Object.keys(body.features).length > 0;
    if (!hasActive && !hasFeatures) throw badRequest('Choose what to change');
    if (hasActive && !can(user, 'salons.toggle'))
      throw forbidden('You don’t have permission to enable or disable businesses. Ask the super admin.');
    if (hasFeatures && !can(user, 'salons.edit'))
      throw forbidden('You don’t have permission to change a business’s menus and features. Ask the super admin.');

    const { rows } = await db.query('SELECT id, features FROM salons WHERE id = ANY($1)', [ids]);
    if (rows.length !== ids.length)
      throw notFound('Some of the selected businesses no longer exist. Refresh and try again.');
    await db.transaction(async (tx) => {
      for (const s of rows) {
        if (hasFeatures)
          await tx.query('UPDATE salons SET features = $2 WHERE id = $1', [
            s.id,
            JSON.stringify(cleanFeatures(body.features, s.features)),
          ]);
        if (hasActive) await tx.query('UPDATE salons SET is_active = $2 WHERE id = $1', [s.id, body.active]);
      }
    });
    return { updated: rows.length };
  });

  router.get('/api/admin/data', async ({ req }) => {
    const user = await admin(req);
    const showMoney = can(user, 'revenue.view');
    const date = today();
    const { rows } = await db.query(
      `SELECT s.*, s.expires_on::text AS expires_on, u.username AS owner_username, u.id AS owner_user_id, u.mfa_enabled_at AS owner_mfa_at,
              ob.name AS onboarder_name, ob.role AS onboarder_role,
              (SELECT count(*) FROM branches b WHERE b.salon_id = s.id)::int AS branch_count,
              (SELECT count(*) FROM staff st WHERE st.salon_id = s.id)::int AS staff_count,
              (SELECT count(*) FROM tokens t WHERE t.salon_id = s.id AND t.token_date = $1)::int AS tokens_today,
              (SELECT count(*) FROM tokens t WHERE t.salon_id = s.id)::int AS tokens_total
         FROM salons s
         LEFT JOIN users u ON u.salon_id = s.id AND u.role = 'owner'
         LEFT JOIN users ob ON ob.id = s.onboarded_by
        ORDER BY s.created_at`,
      [date],
    );

    const salons = rows.map((s) => ({
      ...serialize.salonPublic(s),
      active: s.is_active,
      expired: !!s.expires_on && s.expires_on < date,
      plan: s.plan_name,
      amount: showMoney ? Number(s.plan_amount) : null,
      expiresAt: s.expires_on || '',
      createdAt: new Date(s.created_at).getTime(),
      ownerName: s.owner_name,
      ownerMobile: s.owner_mobile,
      ownerEmail: s.owner_email,
      ownerUsername: s.owner_username || '',
      ownerUserId: s.owner_user_id || null,
      ownerMfa: !!s.owner_mfa_at, // two-step sign-in set up
      branches: s.branch_count,
      staff: s.staff_count,
      tokensToday: s.tokens_today,
      tokensTotal: s.tokens_total,
      categoryId: s.category_id || '',
      selfSignup: !!s.self_signup,
      serviceMode: s.service_mode === 'single' ? 'single' : 'multiple',
      staffMode: s.staff_mode === 'single' ? 'single' : 'multiple',
      features: featuresOf(s.features),
      onboard: {
        source: s.onboard_source || (s.self_signup ? 'signup' : 'admin'),
        channel: s.onboard_channel || 'web',
        byId: s.onboarded_by || '',
        byName: s.onboarder_name || s.onboarded_by_name || '',
        byRole: s.onboarder_role || '',
        label: s.referral_label || '',
      },
      signupPackage: s.signup_package || '',
    }));

    const { rows: categories } = await db.query(
      `SELECT c.*, (SELECT count(*) FROM salons s WHERE s.category_id = c.id)::int AS businesses,
              (SELECT count(*) FROM default_services d WHERE d.category_id = c.id)::int AS services
         FROM business_categories c ORDER BY c.name`,
    );
    const {
      rows: [support],
    } = await db.query(`SELECT count(*)::int AS n FROM support_tickets WHERE status IN ('open', 'in_progress')`);
    const {
      rows: [accounts],
    } = await db.query(`SELECT count(*)::int AS n FROM account_requests WHERE status = 'pending'`);
    return {
      salons,
      supportOpen: support.n,
      accountRequestsPending: accounts.n,
      categories: categories.map(categoryOut),
      stats: {
        salons: salons.length,
        active: salons.filter((s) => s.active && !s.expired).length,
        expired: salons.filter((s) => s.expired).length,
        disabled: salons.filter((s) => !s.active).length,
        tokensToday: salons.reduce((sum, s) => sum + s.tokensToday, 0),
        tokensTotal: salons.reduce((sum, s) => sum + s.tokensTotal, 0),
        revenue: showMoney ? salons.reduce((sum, s) => sum + s.amount, 0) : null,
      },
    };
  });

  /** New salon + owner login + first branch. */
  router.post('/api/admin/salons', async ({ req, body }) => {
    const user = await admin(req, 'salons.create', 'create businesses');
    if (!can(user, 'revenue.view')) delete body.amount;
    const fields = planFields(body);
    await checkCategory(fields.category_id);
    const username = v.required(v.username(body.username), 'Owner username');
    const password = validatePassword(body.password);
    await assertLoginAvailable(db, username);
    await assertLoginAvailable(db, fields.owner_email);

    const salonId = newId(5);
    const slug = await uniqueSlug(body.slug || fields.name);
    const passwordHash = await hashPassword(password);

    // Who onboarded it (kept even if that team member is removed later).
    Object.assign(fields, {
      onboarded_by: user.id,
      onboarded_by_name: user.name || user.username,
      onboard_source: 'admin',
      onboard_channel: body.channel === 'app' ? 'app' : 'web',
    });

    await db.transaction(async (tx) => {
      const columns = ['id', 'slug', ...Object.keys(fields)];
      const values = [salonId, slug, ...Object.values(fields)];
      await tx.query(
        `INSERT INTO salons (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
        values,
      );
      await tx.query(
        `INSERT INTO users (id, role, username, email, name, password_hash, salon_id) VALUES ($1, 'owner', $2, $3, $4, $5, $6)`,
        [newId(8), username, fields.owner_email || null, fields.owner_name || fields.name, passwordHash, salonId],
      );
      await tx.query('INSERT INTO branches (id, salon_id, name) VALUES ($1, $2, $3)', [
        newId(5),
        salonId,
        v.text(body.branchName, 80) || 'Main Branch',
      ]);
    });
    return { id: salonId };
  });

  router.put('/api/admin/salons/:id', async ({ req, params, body }) => {
    const user = await admin(req);
    // Only "active" in the body = enable/disable; anything else = editing the salon.
    const keys = Object.keys(body || {});
    if (keys.some((k) => k !== 'active') && !can(user, 'salons.edit'))
      throw forbidden('You don’t have permission to edit businesses. Ask the super admin.');
    if ('active' in body && !can(user, 'salons.toggle')) {
      const { rows } = await db.query('SELECT is_active FROM salons WHERE id = $1', [params.id]);
      if (rows[0] && rows[0].is_active !== (body.active === true || body.active === 'true'))
        throw forbidden('You don’t have permission to enable or disable businesses. Ask the super admin.');
    }
    if (!can(user, 'revenue.view')) delete body.amount;
    const {
      rows: [salon],
    } = await db.query('SELECT *, expires_on::text AS expires_on FROM salons WHERE id = $1', [params.id]);
    if (!salon) throw notFound('Business not found');
    const {
      rows: [ownerUser],
    } = await db.query(`SELECT * FROM users WHERE salon_id = $1 AND role = 'owner'`, [salon.id]);

    const fields = planFields(body, salon);
    await checkCategory(fields.category_id);
    const slug = body.slug ? v.slugify(body.slug) : salon.slug;
    if (slug !== salon.slug) {
      const { rows } = await db.query('SELECT 1 FROM salons WHERE slug = $1 AND id <> $2', [slug, salon.id]);
      if (rows.length) throw badRequest('That page link is already taken');
    }

    let ownerUpdate = null;
    if (ownerUser) {
      const username = body.username ? v.username(body.username) : ownerUser.username;
      const email = body.ownerEmail !== undefined ? fields.owner_email : ownerUser.email || '';
      await assertLoginAvailable(db, username, ownerUser.id);
      await assertLoginAvailable(db, email, ownerUser.id);
      ownerUpdate = {
        username,
        email: email || null,
        name: body.ownerName ? v.text(body.ownerName, 60) : ownerUser.name,
        passwordHash: body.password ? await hashPassword(validatePassword(body.password)) : null,
      };
    }

    await db.transaction(async (tx) => {
      const columns = ['slug', ...Object.keys(fields)];
      await tx.query(`UPDATE salons SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [
        salon.id,
        slug,
        ...Object.values(fields),
      ]);
      if (ownerUpdate) {
        await tx.query(
          'UPDATE users SET username = $2, email = $3, name = $4, password_hash = COALESCE($5, password_hash) WHERE id = $1',
          [ownerUser.id, ownerUpdate.username, ownerUpdate.email, ownerUpdate.name, ownerUpdate.passwordHash],
        );
        if (ownerUpdate.passwordHash) await tx.query('DELETE FROM sessions WHERE user_id = $1', [ownerUser.id]);
      }
    });
    return { ok: true };
  });

  /** Deletes a salon with everything in it (branches, staff, tokens, logins, images). */
  router.delete('/api/admin/salons/:id', async ({ req, params }) => {
    await admin(req, 'salons.delete', 'delete businesses');
    const { rows: images } = await db.query(
      `SELECT logo_url AS url FROM salons WHERE id = $1 UNION ALL SELECT cover_url FROM salons WHERE id = $1
       UNION ALL SELECT image_url FROM services WHERE salon_id = $1 UNION ALL SELECT photo_url FROM staff WHERE salon_id = $1
       UNION ALL SELECT image_url FROM offers WHERE salon_id = $1 UNION ALL SELECT photo_url FROM testimonials WHERE salon_id = $1`,
      [params.id],
    );
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM staff WHERE salon_id = $1', [params.id]); // branches restrict while staff exist
      await tx.query('DELETE FROM salons WHERE id = $1', [params.id]);
    });
    for (const { url } of images) await uploads.remove(url);
    return { ok: true };
  });
};
