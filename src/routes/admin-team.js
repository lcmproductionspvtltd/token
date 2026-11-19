'use strict';

/** Super admin → the BQuee team (platform staff): add, edit, permissions, remove; resetting two-step sign-in. */

const v = require('../utils/validate');
const { forbidden, notFound } = require('../http/errors');
const { newId } = require('../utils/ids');
const { hashPassword, validatePassword, parseList } = require('../services/auth');
const { assertLoginAvailable } = require('../services/accounts');
const adminAccess = require('./admin-access');

module.exports = function adminTeamRoutes(router, { db, auth }) {
  const { PERMISSIONS, can, admin, superAdmin } = adminAccess(auth);

  /* ---------- platform staff (super admin's own team) ---------- */

  const teamMember = (u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email || '',
    permissions: parseList(u.permissions),
    active: u.is_active,
    mfa: !!u.mfa_enabled_at, // two-step sign-in set up
    createdAt: new Date(u.created_at).getTime(),
  });

  function readPermissions(body) {
    const list = Array.isArray(body.permissions) ? body.permissions : [];
    return [...new Set(list.filter((p) => PERMISSIONS.includes(p)))];
  }

  router.get('/api/admin/team', async ({ req }) => {
    await superAdmin(req);
    const { rows } = await db.query(`SELECT * FROM users WHERE role = 'platform_staff' ORDER BY created_at`);
    return { team: rows.map(teamMember), permissions: PERMISSIONS };
  });

  router.post('/api/admin/team', async ({ req, body }) => {
    await superAdmin(req);
    const name = v.required(v.text(body.name, 60), 'Name');
    const username = v.required(v.username(body.username), 'Username');
    const email = v.email(body.email);
    const password = validatePassword(String(body.password || ''), { role: 'platform_staff' });
    await assertLoginAvailable(db, username);
    if (email) await assertLoginAvailable(db, email);
    const id = newId(8);
    await db.query(
      `INSERT INTO users (id, role, username, email, name, password_hash, permissions, is_active)
       VALUES ($1, 'platform_staff', $2, $3, $4, $5, $6, $7)`,
      [id, username, email || null, name, await hashPassword(password), readPermissions(body), body.active !== false],
    );
    return { id };
  });

  router.put('/api/admin/team/:id', async ({ req, params, body }) => {
    await superAdmin(req);
    const {
      rows: [member],
    } = await db.query(`SELECT * FROM users WHERE id = $1 AND role = 'platform_staff'`, [params.id]);
    if (!member) throw notFound('Team member not found');
    const name = body.name !== undefined ? v.required(v.text(body.name, 60), 'Name') : member.name;
    const username = body.username !== undefined ? v.required(v.username(body.username), 'Username') : member.username;
    const email = body.email !== undefined ? v.email(body.email) : member.email || '';
    await assertLoginAvailable(db, username, member.id);
    if (email) await assertLoginAvailable(db, email, member.id);
    const permissions = body.permissions !== undefined ? readPermissions(body) : parseList(member.permissions);
    const active = body.active !== undefined ? body.active === true || body.active === 'true' : member.is_active;
    await db.transaction(async (tx) => {
      await tx.query(
        'UPDATE users SET name = $2, username = $3, email = $4, permissions = $5, is_active = $6 WHERE id = $1',
        [member.id, name, username, email || null, permissions, active],
      );
      if (body.password) {
        await tx.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
          member.id,
          await hashPassword(validatePassword(String(body.password), { role: 'platform_staff' })),
        ]);
      }
      // Disabled or new password → sign them out everywhere.
      if (!active || body.password) await tx.query('DELETE FROM sessions WHERE user_id = $1', [member.id]);
    });
    return { ok: true };
  });

  /*
   * Lost phone: two-step sign-in is reset and the person sets it up again at their next sign-in
   * (they are signed out everywhere). The super admin can do this for team members and owners;
   * team members with "edit businesses" for owners. A super admin's own reset is done on the
   * server: `node scripts/reset-admin.js` (see docs/OPERATIONS.md).
   */
  router.post('/api/admin/users/:id/mfa-reset', async ({ req, params }) => {
    const me = await admin(req);
    const {
      rows: [target],
    } = await db.query('SELECT id, role FROM users WHERE id = $1', [params.id]);
    if (!target || !['platform_staff', 'owner'].includes(target.role)) throw notFound('Account not found');
    if (target.role === 'platform_staff' && me.role !== 'superadmin')
      throw forbidden('Only the super admin can do this');
    if (target.role === 'owner' && !can(me, 'salons.edit'))
      throw forbidden('You don’t have permission to edit businesses. Ask the super admin.');
    await auth.resetMfa(target.id);
    return { ok: true };
  });

  router.delete('/api/admin/team/:id', async ({ req, params }) => {
    await superAdmin(req);
    const { rowCount } = await db.query(`DELETE FROM users WHERE id = $1 AND role = 'platform_staff'`, [params.id]);
    if (!rowCount) throw notFound('Team member not found');
    return { ok: true };
  });
};
