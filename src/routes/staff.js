'use strict';

/** Staff panel and QR-scan actions on tokens (used by staff and owners). */

const serialize = require('../services/serializers');
const { featuresOf } = require('../services/features');
const { staffLoad, staffBusy } = require('../services/queue');

module.exports = function staffRoutes(router, { db, auth, tokens }) {
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
