'use strict';

/** Super admin (and team with "defaults.manage") → default services, business categories and service groups. */

const { LIMITS } = require('../services/uploads');
const v = require('../utils/validate');
const { badRequest, notFound } = require('../http/errors');
const { newId } = require('../utils/ids');
const { categoryOut, checkCategory: categoryExists } = require('../services/categories');
const adminAccess = require('./admin-access');

module.exports = function adminCatalogRoutes(router, { db, auth, uploads }) {
  const { admin } = adminAccess(auth);
  const checkCategory = (id) => categoryExists(db, id);

  /* ---------- default services (templates salon owners can load) ---------- */

  const defaultService = (r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    duration: r.duration_min,
    price: Number(r.price),
    image: r.image_url,
    categoryId: r.category_id || '',
  });

  router.get('/api/admin/default-services', async ({ req }) => {
    await admin(req);
    const { rows } = await db.query('SELECT * FROM default_services ORDER BY category, name');
    return { services: rows.map(defaultService) };
  });

  async function saveDefault(body, existing) {
    const fields = [
      v.required(v.text(body.name, 80), 'Service name'),
      v.text(body.category, 40),
      v.text(body.description, 200),
      v.integer(body.duration, 1, 600, 15),
      v.money(body.price),
      await uploads.replace(body.image, existing ? existing.image_url : '', LIMITS.item),
      v.text(body.categoryId, 40) || null,
    ];
    await checkCategory(fields[6]);
    // The group must be one of the groups for that business category (or a general group).
    const unchanged = existing && fields[1] === existing.category && fields[6] === existing.category_id;
    if (fields[1] && !unchanged) {
      const { rows } = await db.query(
        `SELECT name FROM service_groups WHERE lower(name) = lower($1) AND (category_id IS NULL OR category_id IS NOT DISTINCT FROM $2)`,
        [fields[1], fields[6]],
      );
      if (!rows.length) throw badRequest('Choose a group from the list – or add it under Business categories first');
      fields[1] = rows[0].name;
    }
    if (existing) {
      await db.query(
        'UPDATE default_services SET name = $2, category = $3, description = $4, duration_min = $5, price = $6, image_url = $7, category_id = $8 WHERE id = $1',
        [existing.id, ...fields],
      );
      return { id: existing.id };
    }
    const id = newId(6);
    await db.query(
      'INSERT INTO default_services (id, name, category, description, duration_min, price, image_url, category_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, ...fields],
    );
    return { id };
  }

  const findDefault = async (id) => {
    const { rows } = await db.query('SELECT * FROM default_services WHERE id = $1', [id]);
    if (!rows[0]) throw notFound('Default service not found');
    return rows[0];
  };

  router.post('/api/admin/default-services', async ({ req, body }) => {
    await admin(req, 'defaults.manage', 'change default services');
    return saveDefault(body, null);
  });

  router.put('/api/admin/default-services/:id', async ({ req, params, body }) => {
    await admin(req, 'defaults.manage', 'change default services');
    return saveDefault(body, await findDefault(params.id));
  });

  router.delete('/api/admin/default-services/:id', async ({ req, params }) => {
    await admin(req, 'defaults.manage', 'change default services');
    const row = await findDefault(params.id);
    await db.query('DELETE FROM default_services WHERE id = $1', [row.id]);
    await uploads.remove(row.image_url); // salons that loaded it have their own copy
    return { ok: true };
  });

  /* ---------- business categories ---------- */

  const COLOR = /^#[0-9a-f]{6}$/i;
  const ICONS = [
    'store',
    'sparkle',
    'user',
    'gear',
    'tag',
    'heart',
    'bolt',
    'home',
    'globe',
    'list',
    'users',
    'calendar',
    'gift',
    'chart',
    'phone',
    'clock',
  ];
  router.get('/api/admin/categories', async ({ req }) => {
    await admin(req);
    const { rows } = await db.query(
      `SELECT c.*, (SELECT count(*) FROM salons s WHERE s.category_id = c.id)::int AS businesses,
              (SELECT count(*) FROM default_services d WHERE d.category_id = c.id)::int AS services
         FROM business_categories c ORDER BY c.name`,
    );
    const { rows: groups } = await db.query(
      `SELECT g.*, (SELECT count(*) FROM default_services d
                     WHERE lower(d.category) = lower(g.name) AND d.category_id IS NOT DISTINCT FROM g.category_id)::int AS services
         FROM service_groups g ORDER BY lower(g.name)`,
    );
    const groupOut = (g) => ({ id: g.id, name: g.name, services: g.services });
    return {
      categories: rows.map((c) => ({
        ...categoryOut(c),
        groups: groups.filter((g) => g.category_id === c.id).map(groupOut),
      })),
      generalGroups: groups.filter((g) => !g.category_id).map(groupOut),
      icons: ICONS,
    };
  });

  async function saveCategory(body, id) {
    const name = v.required(v.text(body.name, 50), 'Category name');
    const icon = ICONS.includes(body.icon) ? body.icon : 'store';
    const color = COLOR.test(body.color || '') ? body.color : '#7b2c9e';
    const { rows } = await db.query(
      'SELECT 1 FROM business_categories WHERE lower(name) = lower($1) AND id IS DISTINCT FROM $2',
      [name, id],
    );
    if (rows.length) throw badRequest('A category with that name already exists');
    if (id) {
      const { rowCount } = await db.query(
        'UPDATE business_categories SET name = $2, icon = $3, color = $4 WHERE id = $1',
        [id, name, icon, color],
      );
      if (!rowCount) throw notFound('Category not found');
      return { id };
    }
    const newCat = 'cat-' + newId(6);
    await db.query('INSERT INTO business_categories (id, name, icon, color) VALUES ($1, $2, $3, $4)', [
      newCat,
      name,
      icon,
      color,
    ]);
    return { id: newCat };
  }

  router.post('/api/admin/categories', async ({ req, body }) => {
    await admin(req, 'defaults.manage', 'change business categories');
    return saveCategory(body, null);
  });

  router.put('/api/admin/categories/:id', async ({ req, params, body }) => {
    await admin(req, 'defaults.manage', 'change business categories');
    return saveCategory(body, params.id);
  });

  router.delete('/api/admin/categories/:id', async ({ req, params }) => {
    await admin(req, 'defaults.manage', 'change business categories');
    // Businesses and default services in it are kept; they become "no category" / "all businesses".
    const { rowCount } = await db.query('DELETE FROM business_categories WHERE id = $1', [params.id]);
    if (!rowCount) throw notFound('Category not found');
    return { ok: true };
  });

  /* ---------- service groups (sub-categories of a business category) ---------- */

  async function findGroup(id) {
    const { rows } = await db.query('SELECT * FROM service_groups WHERE id = $1', [id]);
    if (!rows[0]) throw notFound('Group not found');
    return rows[0];
  }
  async function assertGroupFree(name, categoryId, exceptId) {
    const { rows } = await db.query(
      `SELECT 1 FROM service_groups WHERE lower(name) = lower($1) AND category_id IS NOT DISTINCT FROM $2 AND id IS DISTINCT FROM $3`,
      [name, categoryId, exceptId],
    );
    if (rows.length) throw badRequest('That group already exists in this category');
  }

  router.post('/api/admin/service-groups', async ({ req, body }) => {
    await admin(req, 'defaults.manage', 'change service groups');
    const name = v.required(v.text(body.name, 40), 'Group name');
    const categoryId = v.text(body.categoryId, 40) || null;
    await checkCategory(categoryId);
    await assertGroupFree(name, categoryId, null);
    const id = 'grp-' + newId(8);
    await db.query('INSERT INTO service_groups (id, category_id, name) VALUES ($1, $2, $3)', [id, categoryId, name]);
    return { id };
  });

  router.put('/api/admin/service-groups/:id', async ({ req, params, body }) => {
    await admin(req, 'defaults.manage', 'change service groups');
    const group = await findGroup(params.id);
    const name = v.required(v.text(body.name, 40), 'Group name');
    await assertGroupFree(name, group.category_id, group.id);
    await db.transaction(async (tx) => {
      await tx.query('UPDATE service_groups SET name = $2 WHERE id = $1', [group.id, name]);
      // Default services in this group follow the new name (salon copies are not touched).
      await tx.query(
        'UPDATE default_services SET category = $3 WHERE lower(category) = lower($1) AND category_id IS NOT DISTINCT FROM $2',
        [group.name, group.category_id, name],
      );
    });
    return { ok: true };
  });

  router.delete('/api/admin/service-groups/:id', async ({ req, params }) => {
    await admin(req, 'defaults.manage', 'change service groups');
    const group = await findGroup(params.id);
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM service_groups WHERE id = $1', [group.id]);
      await tx.query(
        `UPDATE default_services SET category = '' WHERE lower(category) = lower($1) AND category_id IS NOT DISTINCT FROM $2`,
        [group.name, group.category_id],
      );
    });
    return { ok: true };
  });
};
