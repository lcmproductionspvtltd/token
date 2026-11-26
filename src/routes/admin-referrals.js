'use strict';

/** Super admin and team → referral links (who onboarded which business). */

const v = require('../utils/validate');
const { badRequest, notFound } = require('../http/errors');
const { newId } = require('../utils/ids');
const adminAccess = require('./admin-access');

module.exports = function adminReferralRoutes(router, { db, auth }) {
  const { admin } = adminAccess(auth);

  /*
   * Referral links: the super admin and each team member can make several links, each with a
   * label (e.g. "Facebook ads"). Businesses that sign up through one are recorded as onboarded
   * by that person, with the link's label.
   */
  const linkOut = (l) => ({
    id: l.id,
    code: l.code,
    label: l.label,
    active: l.is_active,
    path: '/?ref=' + l.code,
    referred: l.referred || 0,
    last30: l.last30 || 0,
    createdAt: new Date(l.created_at).getTime(),
    ownerId: l.user_id,
    ownerName: l.owner_name || '',
    ownerRole: l.owner_role || '',
  });
  const LINK_QUERY = `
    SELECT l.*, u.name AS owner_name, u.role AS owner_role,
           (SELECT count(*) FROM salons s WHERE s.referral_link_id = l.id)::int AS referred,
           (SELECT count(*) FROM salons s WHERE s.referral_link_id = l.id AND s.created_at > now() - interval '30 days')::int AS last30
      FROM referral_links l JOIN users u ON u.id = l.user_id`;

  async function newLink(userId, label) {
    for (;;) {
      const code = newId(3).toLowerCase();
      const { rowCount } = await db.query(
        'INSERT INTO referral_links (id, user_id, code, label) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING',
        [newId(5), userId, code, label],
      );
      if (rowCount) return code;
    }
  }

  router.get('/api/admin/referral-links', async ({ req }) => {
    const user = await admin(req);
    const isSuper = user.role === 'superadmin';
    // Everyone starts with one link so there is always something to share.
    const { rows: has } = await db.query('SELECT 1 FROM referral_links WHERE user_id = $1 LIMIT 1', [user.id]);
    if (!has.length) await newLink(user.id, 'My link');
    const { rows } = await db.query(
      `${LINK_QUERY} ${isSuper ? '' : 'WHERE l.user_id = $1'} ORDER BY l.created_at`,
      isSuper ? [] : [user.id],
    );
    const links = rows.map(linkOut);
    const out = { links: links.filter((l) => l.ownerId === user.id) };
    if (isSuper) {
      out.others = links.filter((l) => l.ownerId !== user.id);
      const { rows: people } = await db.query(
        `SELECT u.id, u.name, u.role,
                (SELECT count(*) FROM salons s WHERE s.onboarded_by = u.id AND s.onboard_source = 'referral')::int AS referred,
                (SELECT count(*) FROM salons s WHERE s.onboarded_by = u.id AND s.onboard_source = 'admin')::int AS created
           FROM users u WHERE u.role IN ('superadmin', 'platform_staff') ORDER BY u.role DESC, u.name`,
      );
      out.people = people;
    }
    return out;
  });

  router.post('/api/admin/referral-links', async ({ req, body }) => {
    const user = await admin(req);
    const label = v.required(v.text(body.label, 60), 'Label');
    const { rows } = await db.query('SELECT count(*)::int AS n FROM referral_links WHERE user_id = $1', [user.id]);
    if (rows[0].n >= 50) throw badRequest('You already have 50 links. Switch off old ones or rename them instead.');
    const code = await newLink(user.id, label);
    const { rows: made } = await db.query(`${LINK_QUERY} WHERE l.code = $1`, [code]);
    return linkOut(made[0]);
  });

  // Rename or switch a link on/off (your own; the super admin can change anyone's).
  router.put('/api/admin/referral-links/:id', async ({ req, params, body }) => {
    const user = await admin(req);
    const { rows } = await db.query('SELECT * FROM referral_links WHERE id = $1', [params.id]);
    const link = rows[0];
    if (!link || (link.user_id !== user.id && user.role !== 'superadmin')) throw notFound('Link not found');
    const label = body.label === undefined ? link.label : v.required(v.text(body.label, 60), 'Label');
    const active = body.active === undefined ? link.is_active : body.active !== false;
    await db.query('UPDATE referral_links SET label = $2, is_active = $3 WHERE id = $1', [link.id, label, active]);
    // Businesses keep the label they signed up with; renaming updates them too so lists stay tidy.
    if (label !== link.label)
      await db.query('UPDATE salons SET referral_label = $2 WHERE referral_link_id = $1', [link.id, label]);
    const { rows: out } = await db.query(`${LINK_QUERY} WHERE l.id = $1`, [link.id]);
    return linkOut(out[0]);
  });
};
