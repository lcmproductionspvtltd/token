'use strict';

/**
 * Account deletion / deactivation requests.
 * Users raise them from the apps; the super admin approves (which carries out the action) or rejects.
 *
 *   approve deactivate: customer → customers.is_active off · owner → business switched off
 *                       staff / team member → users.is_active off (sign-in blocked)
 *   approve delete:     customer → account + photo removed (businesses keep their token records)
 *                       staff → staff member + login removed · team member → login removed
 *                       owner → the whole business and its data removed
 */

const v = require('../utils/validate');
const { badRequest, notFound, HttpError } = require('../http/errors');
const { newId } = require('../utils/ids');
const { verifyPassword } = require('./auth');
const { today } = require('../utils/time');

const KINDS = ['deactivate', 'delete'];
const REASONS = {
  not_using: 'I don’t use BQuee any more',
  privacy: 'Privacy concerns',
  other_app: 'I use another app',
  business_closed: 'My business has closed',
  left_job: 'I left this business',
  too_expensive: 'Too expensive',
  other: 'Other reason',
};
const ms = (d) => (d ? new Date(d).getTime() : null);

const requestOut = (r) => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  role: r.role,
  name: r.name,
  email: r.email,
  mobile: r.mobile,
  business: r.business_name,
  salonId: r.salon_id,
  reason: r.reason,
  reasonText: REASONS[r.reason] || r.reason,
  details: r.details,
  adminNote: r.admin_note,
  handledBy: r.handled_by_name,
  createdAt: ms(r.created_at),
  handledAt: ms(r.handled_at),
  // Whether the account still exists (it is gone after an approved delete).
  accountExists: !!(r.user_id || r.customer_id),
  accountActive: r.account_active !== false,
});

function createAccountRequestService({ db, uploads }) {
  /** Validates and stores a new request. `who` = { role, userId | customerId, salonId, name, email, mobile, business, passwordHash } */
  async function create(who, body) {
    const kind = KINDS.includes(body.kind) ? body.kind : null;
    if (!kind) throw badRequest('Choose delete or deactivate');
    const reason = Object.hasOwn(REASONS, body.reason) ? body.reason : null;
    if (!reason) throw badRequest('Choose a reason');
    const details = v.text(body.details, 500);
    if (reason === 'other' && !details) throw badRequest('Please tell us the reason');
    if (!body.password || !(await verifyPassword(String(body.password), who.passwordHash)))
      throw badRequest('Your password is wrong');

    const id = newId(8);
    try {
      await db.query(
        `INSERT INTO account_requests (id, kind, role, user_id, customer_id, salon_id, name, email, mobile, business_name, reason, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          kind,
          who.role,
          who.userId || null,
          who.customerId || null,
          who.salonId || null,
          who.name || '',
          who.email || '',
          who.mobile || '',
          who.business || '',
          reason,
          details,
        ],
      );
    } catch (err) {
      if (err.code === '23505')
        throw new HttpError(409, 'You already have a request waiting. Cancel it first to send a new one.');
      throw err;
    }
    return mine(who);
  }

  /** The requester's latest request (or null). */
  async function mine(who) {
    const { rows } = await db.query(
      `SELECT * FROM account_requests WHERE ${who.customerId ? 'customer_id' : 'user_id'} = $1 ORDER BY created_at DESC LIMIT 1`,
      [who.customerId || who.userId],
    );
    return { request: rows[0] ? requestOut(rows[0]) : null, reasons: REASONS };
  }

  /** The requester withdraws a pending request. */
  async function cancel(who, id) {
    const { rowCount } = await db.query(
      `UPDATE account_requests SET status = 'cancelled', handled_at = now()
        WHERE id = $1 AND status = 'pending' AND ${who.customerId ? 'customer_id' : 'user_id'} = $2`,
      [id, who.customerId || who.userId],
    );
    if (!rowCount) throw notFound('No waiting request to cancel');
    return mine(who);
  }

  /** Super admin list, newest first, with each account's current on/off state. */
  async function list(status) {
    const filter = ['pending', 'done', 'rejected', 'cancelled'].includes(status) ? status : null;
    const { rows } = await db.query(
      `SELECT r.*,
              CASE WHEN r.customer_id IS NOT NULL THEN c.is_active
                   WHEN r.role = 'owner' THEN s.is_active
                   ELSE u.is_active END AS account_active
         FROM account_requests r
         LEFT JOIN customers c ON c.id = r.customer_id
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN salons s ON s.id = r.salon_id
        ${filter ? 'WHERE r.status = $1' : ''}
        ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 500`,
      filter ? [filter] : [],
    );
    const {
      rows: [counts],
    } = await db.query(
      `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending, count(*)::int AS total FROM account_requests`,
    );
    return { requests: rows.map(requestOut), counts, reasons: REASONS };
  }

  const pendingCount = async () =>
    (await db.query(`SELECT count(*)::int AS n FROM account_requests WHERE status = 'pending'`)).rows[0].n;

  /** Carries out the request. Runs inside the approve transaction. */
  async function carryOut(tx, r) {
    if (r.role === 'customer') {
      if (!r.customer_id) return;
      if (r.kind === 'deactivate') {
        await tx.query('UPDATE customers SET is_active = false WHERE id = $1', [r.customer_id]);
        await tx.query('DELETE FROM customer_sessions WHERE customer_id = $1', [r.customer_id]);
      } else {
        const { rows } = await tx.query('DELETE FROM customers WHERE id = $1 RETURNING photo_url', [r.customer_id]);
        return rows.map((x) => x.photo_url);
      }
      return [];
    }
    if (r.role === 'owner') {
      if (!r.salon_id) return [];
      if (r.kind === 'deactivate') {
        await tx.query('UPDATE salons SET is_active = false WHERE id = $1', [r.salon_id]);
        await tx.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE salon_id = $1)', [
          r.salon_id,
        ]);
        return [];
      }
      const { rows: images } = await tx.query(
        `SELECT logo_url AS url FROM salons WHERE id = $1 UNION ALL SELECT cover_url FROM salons WHERE id = $1
         UNION ALL SELECT image_url FROM services WHERE salon_id = $1 UNION ALL SELECT photo_url FROM staff WHERE salon_id = $1
         UNION ALL SELECT image_url FROM offers WHERE salon_id = $1 UNION ALL SELECT photo_url FROM testimonials WHERE salon_id = $1`,
        [r.salon_id],
      );
      await tx.query('DELETE FROM staff WHERE salon_id = $1', [r.salon_id]); // branches restrict while staff exist
      await tx.query('DELETE FROM salons WHERE id = $1', [r.salon_id]); // users, tokens… cascade
      return images.map((x) => x.url);
    }
    // staff and BQuee team members
    if (!r.user_id) return [];
    if (r.kind === 'deactivate') {
      await tx.query('UPDATE users SET is_active = false WHERE id = $1', [r.user_id]);
      await tx.query('DELETE FROM sessions WHERE user_id = $1', [r.user_id]);
      return [];
    }
    if (r.role === 'staff') {
      const {
        rows: [open],
      } = await tx.query(
        `SELECT count(DISTINCT t.id)::int AS n FROM token_items i JOIN tokens t ON t.id = i.token_id
          WHERE i.staff_id = (SELECT staff_id FROM users WHERE id = $1) AND i.status IN ('waiting', 'in_progress')
            AND t.status IN ('waiting', 'serving') AND t.token_date = $2`,
        [r.user_id, today()],
      );
      if (open.n)
        throw badRequest(
          `${r.name} still has ${open.n} customer${open.n === 1 ? '' : 's'} waiting today. Approve after they are served, or deactivate instead.`,
        );
      const { rows } = await tx.query(
        'DELETE FROM staff WHERE id = (SELECT staff_id FROM users WHERE id = $1) RETURNING photo_url',
        [r.user_id],
      ); // login + sessions cascade
      await tx.query('DELETE FROM users WHERE id = $1', [r.user_id]);
      return rows.map((x) => x.photo_url);
    }
    await tx.query(`DELETE FROM users WHERE id = $1 AND role = 'platform_staff'`, [r.user_id]);
    return [];
  }

  /** Super admin decision: approve (carry out) or reject, with an optional note to the user. */
  async function decide(admin, id, body) {
    const approve = body.action === 'approve';
    if (!approve && body.action !== 'reject') throw badRequest('Choose approve or reject');
    const note = v.text(body.note, 400);
    if (!approve && !note) throw badRequest('Tell the user why the request is rejected');
    const images = await db.transaction(async (tx) => {
      const {
        rows: [r],
      } = await tx.query('SELECT * FROM account_requests WHERE id = $1 FOR UPDATE', [id]);
      if (!r) throw notFound('Request not found');
      if (r.status !== 'pending') throw badRequest('This request was already handled');
      const removed = approve ? (await carryOut(tx, r)) || [] : [];
      await tx.query(
        `UPDATE account_requests SET status = $2, admin_note = $3, handled_by = $4, handled_by_name = $5, handled_at = now() WHERE id = $1`,
        [id, approve ? 'done' : 'rejected', note, admin.id, admin.name || ''],
      );
      return removed;
    });
    for (const url of images) if (url) await uploads.remove(url);
    return list();
  }

  /** Switches a deactivated account back on (from an approved deactivation). */
  async function reactivate(id) {
    const {
      rows: [r],
    } = await db.query('SELECT * FROM account_requests WHERE id = $1', [id]);
    if (!r) throw notFound('Request not found');
    if (r.kind !== 'deactivate' || r.status !== 'done') throw badRequest('Only an approved deactivation can be undone');
    if (r.role === 'customer' && r.customer_id)
      await db.query('UPDATE customers SET is_active = true WHERE id = $1', [r.customer_id]);
    else if (r.role === 'owner' && r.salon_id)
      await db.query('UPDATE salons SET is_active = true WHERE id = $1', [r.salon_id]);
    else if (r.user_id) await db.query('UPDATE users SET is_active = true WHERE id = $1', [r.user_id]);
    else throw badRequest('This account no longer exists');
    return list();
  }

  return { create, mine, cancel, list, pendingCount, decide, reactivate, REASONS };
}

module.exports = { createAccountRequestService };
