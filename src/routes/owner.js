'use strict';

const { LIMITS } = require('../services/uploads');

/** Salon owner dashboard: salon profile, branches, services, staff, offers, testimonials, tokens. */

const v = require('../utils/validate');
const { badRequest, forbidden, notFound } = require('../http/errors');
const { featuresOf, MENU_LABELS } = require('../services/features');
const { newId } = require('../utils/ids');
const { today } = require('../utils/time');
const { hashPassword, validatePassword } = require('../services/auth');
const { assertLoginAvailable } = require('../services/accounts');
const queue = require('../services/queue');
const serialize = require('../services/serializers');

/** Unused-token expiry from the owner: whole hours, 1 to 720 (30 days). */
function expiryHours(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 720) throw badRequest('Unused tokens expire after 1 to 720 hours');
  return n;
}

module.exports = function ownerRoutes(router, { db, auth, tokens, catalog, uploads }) {
  const owner = (req) => auth.requireUser(req, 'owner');

  /** Owner whose business has [menu] switched on by the super admin (otherwise 403). */
  async function ownerWith(req, menu) {
    const user = await owner(req);
    if (!featuresOf(user.salon_features).menus[menu])
      throw forbidden(`${MENU_LABELS[menu]} is switched off for your business. Contact BQuee to turn it on.`);
    return user;
  }

  /** Loads one row of `table` that belongs to the owner's salon, or throws 404. */
  async function ownRow(table, id, salonId) {
    const {
      rows: [row],
    } = await db.query(`SELECT * FROM ${table} WHERE id = $1 AND salon_id = $2`, [id, salonId]);
    if (!row) throw notFound();
    return row;
  }

  /** Keeps only ids that belong to the salon. */
  async function ownIds(table, ids, salonId) {
    if (!ids.length) return [];
    const { rows } = await db.query(`SELECT id FROM ${table} WHERE salon_id = $1 AND id = ANY($2::text[])`, [
      salonId,
      ids,
    ]);
    return rows.map((r) => r.id);
  }

  /* ---------- dashboard ---------- */

  router.get('/api/owner/data', async ({ req }) => {
    const user = await owner(req);
    const salonId = user.salon_id;
    const features = featuresOf(user.salon_features);
    const [
      {
        rows: [salon],
      },
      { rows: branches },
      services,
      staff,
      offers,
      testimonials,
      todayTokens,
      { rows: counters },
      { rows: groupRows },
    ] = await Promise.all([
      db.query('SELECT *, expires_on::text AS expires_on FROM salons WHERE id = $1', [salonId]),
      db.query('SELECT * FROM branches WHERE salon_id = $1 ORDER BY created_at', [salonId]),
      catalog.services(salonId),
      catalog.staff(salonId),
      catalog.offers(salonId),
      catalog.testimonials(salonId),
      tokens.listForSalon(salonId, today(), '', { mask: features.maskContacts }),
      db.query(
        `SELECT c.branch_id, c.last_number, c.cycle, c.reset_at FROM token_counters c
         JOIN branches b ON b.id = c.branch_id WHERE b.salon_id = $1 AND c.token_date = $2`,
        [salonId, today()],
      ),
      db.query(
        `SELECT name FROM service_groups
          WHERE category_id IS NULL OR category_id = (SELECT category_id FROM salons WHERE id = $1)
          ORDER BY lower(name)`,
        [salonId],
      ),
    ]);

    const openByBranch = {};
    for (const b of branches)
      openByBranch[b.id] = todayTokens.filter((t) => t.branchId === b.id && queue.OPEN_STATUSES.includes(t.status));
    const countStatus = (status) => todayTokens.filter((t) => t.status === status).length;
    const revenue = todayTokens.filter((t) => t.status !== 'cancelled').reduce((sum, t) => sum + t.doneTotal, 0);

    // Support tickets with replies from the BQuee team the owner hasn't read yet.
    const {
      rows: [support],
    } = await db.query(
      `SELECT count(*)::int AS n FROM support_tickets t WHERE t.salon_id = $1
          AND EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id = t.id AND m.from_team AND m.created_at > t.owner_seen_at)`,
      [salonId],
    );
    return {
      features,
      supportUnread: support.n,
      salon: { ...serialize.salonProfile(salon), plan: salon.plan_name, expiresAt: salon.expires_on || '' },
      branches: branches.map(serialize.branch),
      services,
      staff: staff.map((s) => ({
        ...s,
        load: Math.ceil(queue.staffLoad(s.id, openByBranch[s.branchId] || [])),
        busy: queue.staffBusy(s.id, openByBranch[s.branchId] || []),
      })),
      offers,
      testimonials,
      stats: {
        total: todayTokens.length,
        waiting: countStatus('waiting'),
        serving: countStatus('serving'),
        done: countStatus('done'),
        cancelled: countStatus('cancelled'),
        revenue,
      },
      tokens: todayTokens,
      // Group suggestions for services (from the super admin's groups for this business type).
      serviceGroups: [...new Set(groupRows.map((g) => g.name))],
      // Token numbering per branch today: last number given, next one, and when it was last reset.
      numbers: Object.fromEntries(
        branches.map((b) => {
          const c = counters.find((x) => x.branch_id === b.id);
          return [
            b.id,
            {
              last: c ? c.last_number : 0,
              next: (c ? c.last_number : 0) + 1,
              resetAt: c && c.reset_at ? new Date(c.reset_at).getTime() : null,
              open: (openByBranch[b.id] || []).length,
            },
          ];
        }),
      ),
    };
  });

  /** Restart a branch's token numbers at 001 now (they also restart by themselves every day). */
  router.post('/api/owner/branches/:id/reset-numbers', async ({ req, params }) => {
    const user = await ownerWith(req, 'branches');
    await ownRow('branches', params.id, user.salon_id);
    await db.query(
      `INSERT INTO token_counters (branch_id, token_date, last_number, cycle, reset_at) VALUES ($1, $2, 0, 1, now())
       ON CONFLICT (branch_id, token_date)
       DO UPDATE SET last_number = 0, cycle = token_counters.cycle + 1, reset_at = now()`,
      [params.id, today()],
    );
    return { ok: true };
  });

  // Cancel all waiting tokens (appointments too) booked with one mobile number (fake or repeated bookings).
  router.post('/api/owner/tokens/cancel-number', async ({ req, body }) => {
    const user = await ownerWith(req, 'tokens');
    const cancelled = await tokens.cancelByMobile(user, v.text(body.mobile, 30));
    return {
      cancelled,
      message: cancelled
        ? `Cancelled ${cancelled} waiting token${cancelled === 1 ? '' : 's'} from this number`
        : 'No waiting tokens from this number',
    };
  });

  router.get('/api/owner/tokens', async ({ req, query }) => {
    const user = await ownerWith(req, 'tokens');
    return tokens.listForSalon(user.salon_id, v.date(query.date) || today(), v.text(query.branchId, 40), {
      mask: featuresOf(user.salon_features).maskContacts,
    });
  });

  /* ---------- salon profile ---------- */

  router.put('/api/owner/salon', async ({ req, body }) => {
    const user = await ownerWith(req, 'settings');
    const salon = await db.query('SELECT * FROM salons WHERE id = $1', [user.salon_id]).then((r) => r.rows[0]);
    const pick = (key, column, max = 200) => (body[key] !== undefined ? v.text(body[key], max) : salon[column]);
    // Links the owner types are shown on the public page: only plain web addresses / handles are
    // accepted – never javascript:, data: or other schemes (audit section 7).
    const link = (key, column, max) => {
      const value = pick(key, column, max) || '';
      if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value))
        throw badRequest('Use a normal web address (https://…) for ' + key);
      return value;
    };

    let slug = salon.slug;
    if (body.slug !== undefined && v.slugify(body.slug) !== salon.slug) {
      slug = v.slugify(body.slug);
      const { rows } = await db.query('SELECT 1 FROM salons WHERE slug = $1 AND id <> $2', [slug, salon.id]);
      if (rows.length) throw badRequest('That page link is already taken');
    }

    const updated = {
      name: body.name !== undefined ? v.required(v.text(body.name, 80), 'Business name') : salon.name,
      slug,
      tagline: pick('tagline', 'tagline'),
      about: pick('about', 'about', 400),
      hours: pick('hours', 'hours'),
      phone: pick('phone', 'phone', 20),
      whatsapp: pick('whatsapp', 'whatsapp', 20),
      instagram: link('instagram', 'instagram', 80),
      email: pick('email', 'email', 120),
      address: pick('address', 'address'),
      facebook: link('facebook', 'facebook', 200),
      youtube: link('youtube', 'youtube', 200),
      x_handle: link('x', 'x_handle', 200),
      website: link('website', 'website', 200),
      map_url: link('mapUrl', 'map_url', 500),
      currency: pick('currency', 'currency', 6) || '₹',
      brand_color: v.hexColor(body.color, salon.brand_color),
      logo_url: await uploads.replace(body.logo, salon.logo_url, LIMITS.logo),
      cover_url: await uploads.replace(body.cover, salon.cover_url, LIMITS.cover),
      token_flow:
        body.tokenFlow === undefined ? salon.token_flow : body.tokenFlow === 'whole' ? 'whole' : 'per_service',
      // Hours after which a token nobody used becomes Expired (1 hour to 30 days).
      token_expiry_hours: body.tokenExpiryHours === undefined ? salon.token_expiry_hours : expiryHours(body.tokenExpiryHours),
    };
    const columns = Object.keys(updated);
    await db.query(
      `UPDATE salons SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [salon.id, ...columns.map((c) => updated[c])],
    );
    return serialize.salonPublic({ ...salon, ...updated });
  });

  /* ---------- branches ---------- */

  const branchFields = (body) => [
    v.required(v.text(body.name, 80), 'Branch name'),
    v
      .text(body.prefix, 3)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ''),
    v.text(body.address),
    v.text(body.phone, 20),
    v.flag(body.active),
  ];

  router.post('/api/owner/branches', async ({ req, body }) => {
    const user = await ownerWith(req, 'branches');
    const id = newId(5);
    await db.query(
      'INSERT INTO branches (id, salon_id, name, token_prefix, address, phone, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, user.salon_id, ...branchFields(body)],
    );
    return { id };
  });

  router.put('/api/owner/branches/:id', async ({ req, params, body }) => {
    const user = await ownerWith(req, 'branches');
    await ownRow('branches', params.id, user.salon_id);
    await db.query(
      'UPDATE branches SET name = $2, token_prefix = $3, address = $4, phone = $5, is_active = $6 WHERE id = $1',
      [params.id, ...branchFields(body)],
    );
    return { id: params.id };
  });

  router.delete('/api/owner/branches/:id', async ({ req, params }) => {
    const user = await ownerWith(req, 'branches');
    await ownRow('branches', params.id, user.salon_id);
    const {
      rows: [counts],
    } = await db.query(
      `SELECT (SELECT count(*) FROM staff WHERE branch_id = $1)::int AS staff,
              (SELECT count(*) FROM branches WHERE salon_id = $2)::int AS branches`,
      [params.id, user.salon_id],
    );
    if (counts.staff) throw badRequest('Move or delete the staff of this branch first');
    if (counts.branches <= 1) throw badRequest('You need at least one branch');
    await db.query('DELETE FROM branches WHERE id = $1', [params.id]);
    return { ok: true };
  });

  /* ---------- services ---------- */

  async function saveService(user, body, existing) {
    const fields = {
      name: v.required(v.text(body.name, 80), 'Service name'),
      category: v.text(body.category, 40),
      description: v.text(body.description, 200),
      duration_min: v.integer(body.duration, 1, 600, 15),
      price: v.money(body.price),
      image_url: await uploads.replace(body.image, existing ? existing.image_url : '', LIMITS.item),
      is_active: v.flag(body.active),
    };
    const branchIds = await ownIds('branches', v.idList(body.branchIds), user.salon_id);
    // Different prices per branch; blank or same as the normal price = use the normal price.
    const rawPrices = body.branchPrices && typeof body.branchPrices === 'object' ? body.branchPrices : {};
    const priceBranches = await ownIds(
      'branches',
      Object.keys(rawPrices)
        .slice(0, 200)
        .filter((b) => rawPrices[b] !== '' && rawPrices[b] !== null && rawPrices[b] !== undefined),
      user.salon_id,
    );
    const branchPrices = priceBranches
      .filter((b) => !branchIds.length || branchIds.includes(b))
      .map((b) => [b, v.money(rawPrices[b])])
      .filter(([, p]) => p !== fields.price);
    const id = existing ? existing.id : newId(5);

    await db.transaction(async (tx) => {
      if (existing) {
        await tx.query(
          `UPDATE services SET name = $2, category = $3, description = $4, duration_min = $5, price = $6, image_url = $7, is_active = $8 WHERE id = $1`,
          [id, ...Object.values(fields)],
        );
        await tx.query('DELETE FROM service_branches WHERE service_id = $1', [id]);
      } else {
        await tx.query(
          `INSERT INTO services (id, salon_id, name, category, description, duration_min, price, image_url, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, user.salon_id, ...Object.values(fields)],
        );
      }
      for (const branchId of branchIds)
        await tx.query('INSERT INTO service_branches (service_id, branch_id) VALUES ($1, $2)', [id, branchId]);
      await tx.query('DELETE FROM service_branch_prices WHERE service_id = $1', [id]);
      for (const [branchId, price] of branchPrices)
        await tx.query('INSERT INTO service_branch_prices (service_id, branch_id, price) VALUES ($1, $2, $3)', [
          id,
          branchId,
          price,
        ]);
    });
    return { id };
  }

  /* Default services from the super admin: list them, and copy chosen ones into this salon. */
  router.get('/api/owner/default-services', async ({ req }) => {
    const user = await ownerWith(req, 'services');
    const [{ rows }, { rows: mine }] = await Promise.all([
      // This business's category, plus defaults meant for every business.
      db.query(
        `SELECT d.* FROM default_services d
          WHERE d.category_id IS NULL OR d.category_id = (SELECT category_id FROM salons WHERE id = $1)
          ORDER BY (d.category_id IS NULL), d.category, d.name`,
        [user.salon_id],
      ),
      db.query('SELECT lower(name) AS name FROM services WHERE salon_id = $1', [user.salon_id]),
    ]);
    const have = new Set(mine.map((r) => r.name));
    const {
      rows: [cat],
    } = await db.query(
      'SELECT c.name FROM business_categories c JOIN salons s ON s.category_id = c.id WHERE s.id = $1',
      [user.salon_id],
    );
    return {
      category: cat ? cat.name : '',
      services: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        duration: r.duration_min,
        price: Number(r.price),
        image: r.image_url,
        forAll: !r.category_id,
        added: have.has(r.name.toLowerCase()),
      })),
    };
  });

  router.post('/api/owner/default-services/load', async ({ req, body }) => {
    const user = await ownerWith(req, 'services');
    const ids = v.idList(body.ids);
    if (!ids.length) throw badRequest('Choose at least one service');
    const [{ rows: picks }, { rows: mine }, { rows: staff }] = await Promise.all([
      db.query(
        `SELECT * FROM default_services WHERE id = ANY($1)
            AND (category_id IS NULL OR category_id = (SELECT category_id FROM salons WHERE id = $2))
          ORDER BY category, name`,
        [ids, user.salon_id],
      ),
      db.query('SELECT lower(name) AS name FROM services WHERE salon_id = $1', [user.salon_id]),
      db.query('SELECT id FROM staff WHERE salon_id = $1', [user.salon_id]),
    ]);
    const have = new Set(mine.map((r) => r.name));
    const fresh = picks.filter((p) => !have.has(p.name.toLowerCase())); // never add a duplicate name
    const images = await Promise.all(fresh.map((p) => uploads.copy(p.image_url)));
    await db.transaction(async (tx) => {
      for (const [i, p] of fresh.entries()) {
        const id = newId(5);
        await tx.query(
          `INSERT INTO services (id, salon_id, name, category, description, duration_min, price, image_url, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [id, user.salon_id, p.name, p.category, p.description, p.duration_min, p.price, images[i]],
        );
        if (body.assignAll !== false)
          for (const st of staff)
            await tx.query('INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)', [st.id, id]);
      }
    });
    return { added: fresh.length, skipped: picks.length - fresh.length };
  });

  router.post('/api/owner/services', async ({ req, body }) =>
    saveService(await ownerWith(req, 'services'), body, null),
  );

  router.put('/api/owner/services/:id', async ({ req, params, body }) => {
    const user = await ownerWith(req, 'services');
    return saveService(user, body, await ownRow('services', params.id, user.salon_id));
  });

  router.delete('/api/owner/services/:id', async ({ req, params }) => {
    const user = await ownerWith(req, 'services');
    const service = await ownRow('services', params.id, user.salon_id);
    await db.query('DELETE FROM services WHERE id = $1', [service.id]);
    await uploads.remove(service.image_url);
    return { ok: true };
  });

  /* ---------- staff (and their logins) ---------- */
  // Owners switch staff on and off; they don't delete them. A staff member is only deleted when
  // they ask for it themselves and the super admin approves (routes/account-requests.js).

  /** Refuses to switch off someone who still has customers waiting today (nobody else could serve them). */
  async function assertNobodyWaiting(staff) {
    const {
      rows: [open],
    } = await db.query(
      `SELECT count(DISTINCT t.id)::int AS n FROM token_items i JOIN tokens t ON t.id = i.token_id
        WHERE i.staff_id = $1 AND i.status IN ('waiting', 'in_progress') AND t.status IN ('waiting', 'serving')
          AND (t.expires_at IS NULL OR t.expires_at > now())`,
      [staff.id],
    );
    if (open.n)
      throw badRequest(
        `${staff.name} still has ${open.n} customer${open.n === 1 ? '' : 's'} waiting today. Finish or cancel ${open.n === 1 ? 'that token' : 'those tokens'} first, then switch ${staff.name} off.`,
      );
  }

  async function saveStaff(user, body, existing) {
    const [branchId] = await ownIds('branches', [v.text(body.branchId, 40)].filter(Boolean), user.salon_id);
    if (!branchId) throw badRequest('Choose a branch');
    const serviceIds = await ownIds('services', v.idList(body.serviceIds), user.salon_id);
    const fields = {
      name: v.required(v.text(body.name, 60), 'Staff name'),
      title: v.text(body.title, 60),
      mobile: v.text(body.mobile, 20),
      photo_url: await uploads.replace(body.photo, existing ? existing.photo_url : '', LIMITS.photo),
      branch_id: branchId,
      is_active: v.flag(body.active),
    };
    const id = existing ? existing.id : newId(5);
    if (existing && existing.is_active && !fields.is_active) await assertNobodyWaiting(existing);

    const {
      rows: [login],
    } = await db.query('SELECT * FROM users WHERE staff_id = $1', [id]);
    const email = body.email !== undefined ? v.email(body.email) : (login && login.email) || '';
    // Email-only login: the email doubles as the username.
    const username = v.username(body.username) || (login && login.username) || email;
    const password = body.password ? validatePassword(body.password) : '';
    if (username) {
      await assertLoginAvailable(db, username, login && login.id);
      await assertLoginAvailable(db, email, login && login.id);
      if (!login && !password) throw badRequest('Set a password for this staff login');
    }
    const passwordHash = password ? await hashPassword(password) : null;

    await db.transaction(async (tx) => {
      if (existing) {
        await tx.query(
          'UPDATE staff SET name = $2, title = $3, mobile = $4, photo_url = $5, branch_id = $6, is_active = $7 WHERE id = $1',
          [id, ...Object.values(fields)],
        );
        await tx.query('DELETE FROM staff_services WHERE staff_id = $1', [id]);
      } else {
        await tx.query(
          'INSERT INTO staff (id, salon_id, name, title, mobile, photo_url, branch_id, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [id, user.salon_id, ...Object.values(fields)],
        );
      }
      for (const serviceId of serviceIds)
        await tx.query('INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)', [id, serviceId]);

      if (login && username) {
        await tx.query(
          `UPDATE users SET username = $2, email = $3, name = $4, password_hash = COALESCE($5, password_hash), email_verified_at = CASE WHEN lower(coalesce(email, '')) = lower(coalesce($3::text, '')) THEN email_verified_at END WHERE id = $1`,
          [login.id, username, email || null, fields.name, passwordHash],
        );
        // A new password signs the staff member out on every device.
        if (passwordHash) await tx.query('DELETE FROM sessions WHERE user_id = $1', [login.id]);
      } else if (username) {
        await tx.query(
          `INSERT INTO users (id, role, username, email, name, password_hash, salon_id, staff_id)
           VALUES ($1, 'staff', $2, $3, $4, $5, $6, $7)`,
          [newId(8), username, email || null, fields.name, passwordHash, user.salon_id, id],
        );
      }
      if (login && passwordHash) await tx.query('DELETE FROM sessions WHERE user_id = $1', [login.id]);
    });
    return { id };
  }

  router.post('/api/owner/staff', async ({ req, body }) => saveStaff(await ownerWith(req, 'staff'), body, null));

  router.put('/api/owner/staff/:id', async ({ req, params, body }) => {
    const user = await ownerWith(req, 'staff');
    return saveStaff(user, body, await ownRow('staff', params.id, user.salon_id));
  });

  /** Switch a staff member on (can sign in, gets bookings) or off (can't sign in, hidden from booking). */
  router.put('/api/owner/staff/:id/active', async ({ req, params, body }) => {
    const user = await ownerWith(req, 'staff');
    const staff = await ownRow('staff', params.id, user.salon_id);
    const active = body.active === true || body.active === 'true';
    if (staff.is_active && !active) await assertNobodyWaiting(staff);
    await db.query('UPDATE staff SET is_active = $2 WHERE id = $1', [staff.id, active]);
    return { active };
  });

  router.put('/api/owner/staff/:id/status', async ({ req, params, body }) => {
    const user = await ownerWith(req, 'staff');
    const staff = await ownRow('staff', params.id, user.salon_id);
    const online = body.online === true || body.online === 'true';
    await db.query('UPDATE staff SET is_online = $2 WHERE id = $1', [staff.id, online]);
    return { online };
  });

  /* ---------- offers ---------- */

  async function saveOffer(user, body, existing) {
    const values = [
      v.required(v.text(body.title, 80), 'Offer title'),
      v.text(body.badge, 20),
      v.text(body.description, 240),
      v.text(body.code, 20).toUpperCase(),
      v.date(body.validTill),
      v.integer(body.theme, 0, 5, 0),
      await uploads.replace(body.image, existing ? existing.image_url : '', LIMITS.item),
      v.flag(body.active),
      ['percent', 'flat'].includes(body.discountType) ? body.discountType : 'none',
      body.discountType === 'percent' ? Math.min(v.money(body.discountValue), 100) : v.money(body.discountValue),
    ];
    if (values[8] !== 'none' && !(values[9] > 0))
      throw badRequest('Enter the discount amount, or choose “No discount”');
    if (values[8] === 'none') values[9] = 0;
    if (existing) {
      await db.query(
        `UPDATE offers SET title = $2, badge = $3, description = $4, promo_code = $5, valid_until = $6, theme = $7, image_url = $8, is_active = $9,
                discount_type = $10, discount_value = $11 WHERE id = $1`,
        [existing.id, ...values],
      );
      return { id: existing.id };
    }
    const id = newId(5);
    await db.query(
      `INSERT INTO offers (id, salon_id, title, badge, description, promo_code, valid_until, theme, image_url, is_active, discount_type, discount_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, user.salon_id, ...values],
    );
    return { id };
  }

  router.post('/api/owner/offers', async ({ req, body }) => saveOffer(await ownerWith(req, 'offers'), body, null));

  router.put('/api/owner/offers/:id', async ({ req, params, body }) => {
    const user = await ownerWith(req, 'offers');
    return saveOffer(user, body, await ownRow('offers', params.id, user.salon_id));
  });

  router.delete('/api/owner/offers/:id', async ({ req, params }) => {
    const user = await ownerWith(req, 'offers');
    const offer = await ownRow('offers', params.id, user.salon_id);
    await db.query('DELETE FROM offers WHERE id = $1', [offer.id]);
    await uploads.remove(offer.image_url);
    return { ok: true };
  });

  /* ---------- testimonials ---------- */

  async function saveTestimonial(user, body, existing) {
    const values = [
      v.required(v.text(body.name, 60), 'Client name'),
      v.text(body.label, 60),
      v.required(v.text(body.text, 400), 'Testimonial text'),
      v.integer(body.rating, 1, 5, 5),
      await uploads.replace(body.photo, existing ? existing.photo_url : '', LIMITS.photo),
      v.flag(body.active),
    ];
    if (existing) {
      await db.query(
        'UPDATE testimonials SET client_name = $2, label = $3, quote = $4, rating = $5, photo_url = $6, is_active = $7 WHERE id = $1',
        [existing.id, ...values],
      );
      return { id: existing.id };
    }
    const id = newId(5);
    await db.query(
      `INSERT INTO testimonials (id, salon_id, client_name, label, quote, rating, photo_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, user.salon_id, ...values],
    );
    return { id };
  }

  router.post('/api/owner/testimonials', async ({ req, body }) =>
    saveTestimonial(await ownerWith(req, 'reviews'), body, null),
  );

  router.put('/api/owner/testimonials/:id', async ({ req, params, body }) => {
    const user = await ownerWith(req, 'reviews');
    return saveTestimonial(user, body, await ownRow('testimonials', params.id, user.salon_id));
  });

  router.delete('/api/owner/testimonials/:id', async ({ req, params }) => {
    const user = await ownerWith(req, 'reviews');
    const review = await ownRow('testimonials', params.id, user.salon_id);
    await db.query('DELETE FROM testimonials WHERE id = $1', [review.id]);
    await uploads.remove(review.photo_url);
    return { ok: true };
  });
};
