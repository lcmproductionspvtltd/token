'use strict';

/** Business categories: the shape sent to the dashboards, and the "does it exist?" check. */

const { badRequest } = require('../http/errors');

const categoryOut = (c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  color: c.color,
  businesses: c.businesses || 0,
  services: c.services || 0,
});

/** Throws 400 if a category id was sent that doesn't exist (empty = no category, fine). */
async function checkCategory(db, id) {
  if (!id) return;
  const { rows } = await db.query('SELECT 1 FROM business_categories WHERE id = $1', [id]);
  if (!rows.length) throw badRequest('That business category no longer exists');
}

module.exports = { categoryOut, checkCategory };
