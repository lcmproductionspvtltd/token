'use strict';

/**
 * Notifications of the signed-in owner, staff member or BQuee team member (customers: see customer.js).
 * The apps and dashboards ask "anything after #id?" every half a minute or so; see services/notify.js
 * for why that stays cheap.
 */

module.exports = function notificationRoutes(router, { auth, notify }) {
  router.get('/api/notifications', async ({ req, query }) => {
    const user = await auth.requireUser(req, 'superadmin', 'platform_staff', 'owner', 'staff');
    return notify.feed({ userId: user.id }, query && query.after);
  });

  router.post('/api/notifications/read', async ({ req, body }) => {
    const user = await auth.requireUser(req, 'superadmin', 'platform_staff', 'owner', 'staff');
    return notify.markRead({ userId: user.id }, body.upTo);
  });
};
