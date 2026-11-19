'use strict';

/** Reports for owners, staff and the platform admins (filters in the query string; `export=1` adds CSV). */

const { parseList } = require('../services/auth');
const { createReportService } = require('../services/reports');
const { forbidden } = require('../http/errors');
const { featuresOf } = require('../services/features');

module.exports = function reportRoutes(router, { db, auth }) {
  const reports = createReportService(db);

  router.get('/api/owner/reports', async ({ req, query }) => {
    const user = await auth.requireUser(req, 'owner');
    const f = featuresOf(user.salon_features);
    if (!f.menus.reports) throw forbidden('Reports are switched off for your business. Contact BQuee to turn them on.');
    if (query.export && !f.reportExport) throw forbidden('Excel export is switched off for your business.');
    return reports.owner(user.salon_id, query, { mask: f.maskContacts });
  });

  router.get('/api/staff/reports', async ({ req, query }) => {
    const user = await auth.requireUser(req, 'staff');
    const f = featuresOf(user.salon_features);
    if (!f.staffReports) throw forbidden('Reports are switched off for your business.');
    if (query.export && !f.reportExport) throw forbidden('Excel export is switched off for your business.');
    return reports.staff(user.staff_id, user.salon_id, query);
  });

  router.get('/api/admin/reports', async ({ req, query }) => {
    const user = await auth.requireUser(req, 'superadmin', 'platform_staff');
    const showMoney = user.role === 'superadmin' || parseList(user.permissions).includes('revenue.view');
    return reports.admin(query, { showMoney });
  });
};
