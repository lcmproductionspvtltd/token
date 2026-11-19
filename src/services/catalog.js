'use strict';

/** Read helpers for a salon's catalogue: services, staff, offers and testimonials. */

const serialize = require('./serializers');
const { today } = require('../utils/time');

function createCatalogService(db) {
  async function services(salonId, { activeOnly = false } = {}) {
    const { rows } = await db.query(
      `SELECT s.*, COALESCE(array_agg(sb.branch_id) FILTER (WHERE sb.branch_id IS NOT NULL), '{}') AS branch_ids,
              COALESCE((SELECT jsonb_object_agg(p.branch_id, p.price) FROM service_branch_prices p WHERE p.service_id = s.id), '{}') AS branch_prices
         FROM services s LEFT JOIN service_branches sb ON sb.service_id = s.id
        WHERE s.salon_id = $1 ${activeOnly ? 'AND s.is_active' : ''}
        GROUP BY s.id ORDER BY s.category, s.name`,
      [salonId],
    );
    return rows.map((row) => serialize.service(row, row.branch_ids, row.branch_prices));
  }

  /** Staff with their service ids and login (username / email). */
  async function staff(salonId, { activeOnly = false, branchIds = null } = {}) {
    const { rows } = await db.query(
      `SELECT st.*, u.username, u.email AS login_email,
              COALESCE(array_agg(ss.service_id) FILTER (WHERE ss.service_id IS NOT NULL), '{}') AS service_ids
         FROM staff st
         LEFT JOIN staff_services ss ON ss.staff_id = st.id
         LEFT JOIN users u ON u.staff_id = st.id
        WHERE st.salon_id = $1 ${activeOnly ? 'AND st.is_active' : ''}
          ${branchIds ? 'AND st.branch_id = ANY($2::text[])' : ''}
        GROUP BY st.id, u.username, u.email ORDER BY st.name`,
      branchIds ? [salonId, branchIds] : [salonId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title,
      photo: r.photo_url,
      mobile: r.mobile,
      branchId: r.branch_id,
      serviceIds: r.service_ids,
      active: r.is_active,
      online: r.is_online !== false,
      username: r.username || '',
      email: r.login_email || '',
    }));
  }

  async function offers(salonId, { liveOnly = false } = {}) {
    const { rows } = await db.query(
      `SELECT *, valid_until::text AS valid_until FROM offers
        WHERE salon_id = $1 ${liveOnly ? 'AND is_active AND (valid_until IS NULL OR valid_until >= $2::date)' : ''}
        ORDER BY created_at`,
      liveOnly ? [salonId, today()] : [salonId],
    );
    return rows.map(serialize.offer);
  }

  async function testimonials(salonId, { activeOnly = false } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM testimonials WHERE salon_id = $1 ${activeOnly ? 'AND is_active' : ''} ORDER BY created_at DESC`,
      [salonId],
    );
    return rows.map(serialize.testimonial);
  }

  return { services, staff, offers, testimonials };
}

module.exports = { createCatalogService };
