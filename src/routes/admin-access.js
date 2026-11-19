'use strict';

/**
 * Who may use the super admin APIs. The super admin can do everything; BQuee team members
 * (platform staff) can always see the business list and only do what the super admin ticked.
 *   const { admin, superAdmin, can, PERMISSIONS } = adminAccess(auth);
 *   const user = await admin(req, 'salons.edit', 'edit businesses');   // 401/403 otherwise
 */

const { forbidden } = require('../http/errors');
const { parseList } = require('../services/auth');

const PERMISSIONS = [
  'salons.create',
  'salons.edit',
  'salons.toggle',
  'salons.delete',
  'revenue.view',
  'defaults.manage',
];

module.exports = function adminAccess(auth) {
  const can = (user, permission) => user.role === 'superadmin' || parseList(user.permissions).includes(permission);
  async function admin(req, permission, what = 'do that') {
    const user = await auth.requireUser(req, 'superadmin', 'platform_staff');
    if (permission && !can(user, permission))
      throw forbidden(`You don’t have permission to ${what}. Ask the super admin.`);
    return user;
  }
  const superAdmin = (req) => auth.requireUser(req, 'superadmin');
  return { PERMISSIONS, can, admin, superAdmin };
};
