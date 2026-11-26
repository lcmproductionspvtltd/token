'use strict';

/** Staff panel and QR-scan actions on tokens (used by staff and owners). */

const serialize = require('../services/serializers');
const { featuresOf } = require('../services/features');
const { staffLoad, staffBusy } = require('../services/queue');
const v = require('../utils/validate');
const { badRequest } = require('../http/errors');

module.exports = function staffRoutes(router, { db, auth, tokens, limiter }) {
  router.post('/api/token/:id/:action', async ({ req, params, body }) => {
    const user = await auth.requireUser(req, 'staff', 'owner');
    if (params.action === 'add-service') return tokens.addService(user, params.id, body);
    if (params.action === 'remove-service') return tokens.removeService(user, params.id, body.index);
    return tokens.act(user, params.id, params.action, body.index);
  });

  // Services (with staff and their current queue) that can be added to a token.
  router.get('/api/token/:id/services', async ({ req, params }) => {
    const user = await auth.requireUser(req, 'staff', 'owner');
    return tokens.serviceOptions(user, params.id);
  });

  // Staff switch themselves online / offline. Offline staff can't be picked or assigned in bookings.
  router.put('/api/staff/status', async ({ req, body }) => {
    const user = await auth.requireUser(req, 'staff');
    const online = body.online === true || body.online === 'true';
    await db.query('UPDATE staff SET is_online = $2 WHERE id = $1', [user.staff_id, online]);
    return { online };
  });

  /* ---------- a staff member makes a token by hand (walk-in customer at the counter) ---------- */

  /** The services this staff member does at their branch, with this branch's prices. */
  async function myServices(user) {
    const {
      rows: [me],
    } = await db.query('SELECT id, name, branch_id FROM staff WHERE id = $1 AND salon_id = $2', [
      user.staff_id,
      user.salon_id,
    ]);
    const { rows } = await db.query(
      `SELECT s.id, s.name, s.category, s.duration_min,
              COALESCE((SELECT p.price FROM service_branch_prices p WHERE p.service_id = s.id AND p.branch_id = $3), s.price) AS price
         FROM services s JOIN staff_services ss ON ss.service_id = s.id AND ss.staff_id = $2
        WHERE s.salon_id = $1 AND s.is_active
          AND (NOT EXISTS (SELECT 1 FROM service_branches sb WHERE sb.service_id = s.id)
               OR EXISTS (SELECT 1 FROM service_branches sb WHERE sb.service_id = s.id AND sb.branch_id = $3))
        ORDER BY s.category, s.name`,
      [user.salon_id, me.id, me.branch_id],
    );
    return {
      me,
      services: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        duration: r.duration_min,
        price: Number(r.price),
      })),
    };
  }

  router.get('/api/staff/my-services', async ({ req }) => {
    const user = await auth.requireUser(req, 'staff');
    const { me, services } = await myServices(user);
    return { staff: { id: me.id, name: me.name }, services };
  });

  // The new token is always this staff member's own (their name is fixed) and only their services.
  router.post('/api/staff/tokens', async ({ req, body, ip }) => {
    const user = await auth.requireUser(req, 'staff');
    await limiter.check('staff-token', user.id, 120, 60 * 60_000);
    const { me } = await myServices(user);
    const name = v.required(v.text(body.name, 60), 'Customer name');
    const rawMobile = v.text(body.mobile, 20);
    const ids = (Array.isArray(body.serviceIds) ? body.serviceIds : []).map((x) => v.text(x, 40)).filter(Boolean);
    if (!ids.length) throw badRequest('Choose at least one service');
    const id = await tokens.book({
      branchId: me.branch_id,
      customer: { name, mobile: rawMobile ? v.mobile(rawMobile) : '', email: v.email(body.email) },
      items: ids.map((serviceId) => ({ serviceId, staffId: me.id })),
      byStaff: { staffId: me.id, name: me.name },
    });
    return tokens.view(id, user);
  });

  router.get('/api/staff/queue', async ({ req }) => {
    const user = await auth.requireUser(req, 'staff');
    const {
      rows: [staff],
    } = await db.query('SELECT * FROM staff WHERE id = $1', [user.staff_id]);
    const [
      {
        rows: [salon],
      },
      {
        rows: [branch],
      },
      list,
      open,
    ] = await Promise.all([
      db.query('SELECT * FROM salons WHERE id = $1', [user.salon_id]),
      db.query('SELECT * FROM branches WHERE id = $1', [staff.branch_id]),
      tokens.listForStaff(staff.id, { mask: featuresOf(user.salon_features).maskContacts }),
      tokens.openTokens(staff.branch_id),
    ]);

    const myItems = list.flatMap((t) => t.items.filter((i) => i.staffId === staff.id));
    const count = (status) => myItems.filter((i) => i.status === status).length;

    return {
      features: featuresOf(user.salon_features),
      staff: {
        id: staff.id,
        name: staff.name,
        mobile: staff.mobile,
        online: staff.is_online,
        busy: staffBusy(staff.id, open),
      },
      salon: serialize.salonPublic(salon),
      branch: branch ? serialize.branch(branch) : {},
      tokens: list,
      stats: {
        waiting: count('waiting'),
        serving: count('in_progress'),
        done: count('done'),
        load: Math.ceil(staffLoad(staff.id, open)),
      },
    };
  });
};
