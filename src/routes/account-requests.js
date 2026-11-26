'use strict';

/**
 * Account deletion / deactivation requests.
 *   Signed-in owners, staff and BQuee team members:  /api/account-request  (GET mine, POST new, POST :id/cancel)
 *   Customers (customer app):                         /api/customer/account-request  (in routes/customer.js)
 *   Super admin:                                      /api/admin/account-requests     (list, decide, reactivate)
 */

module.exports = function accountRequestRoutes(router, { db, auth, accountRequests, limiter }) {
  async function requester(req) {
    const user = await auth.requireUser(req, 'owner', 'staff', 'platform_staff');
    const {
      rows: [row],
    } = await db.query(
      `SELECT u.password_hash, s.name AS business, st.mobile
         FROM users u LEFT JOIN salons s ON s.id = u.salon_id LEFT JOIN staff st ON st.id = u.staff_id
        WHERE u.id = $1`,
      [user.id],
    );
    return {
      role: user.role,
      userId: user.id,
      salonId: user.salon_id || null,
      name: user.name,
      email: user.email || '',
      mobile: (row && row.mobile) || '',
      business: (row && row.business) || '',
      passwordHash: row ? row.password_hash : '',
    };
  }
  const superAdmin = (req) => auth.requireUser(req, 'superadmin');

  router.get('/api/account-request', async ({ req }) => accountRequests.mine(await requester(req)));
  router.post('/api/account-request', async ({ req, body, ip }) => {
    await limiter.check('account-request', ip, 20, 60 * 60_000); // each try checks the password
    return accountRequests.create(await requester(req), body);
  });
  router.post('/api/account-request/:id/cancel', async ({ req, params }) =>
    accountRequests.cancel(await requester(req), params.id),
  );

  router.get('/api/admin/account-requests', async ({ req, query }) => {
    await superAdmin(req);
    return accountRequests.list(query && query.status);
  });
  router.post('/api/admin/account-requests/:id/decide', async ({ req, params, body }) =>
    accountRequests.decide(await superAdmin(req), params.id, body),
  );
  router.post('/api/admin/account-requests/:id/reactivate', async ({ req, params }) => {
    await superAdmin(req);
    return accountRequests.reactivate(params.id);
  });
};
