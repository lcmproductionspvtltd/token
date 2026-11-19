'use strict';

const { LIMITS } = require('../services/uploads');

/**
 * Support tickets: business owners raise a ticket (bug, issue, question…) from their dashboard;
 * the super admin and the BQuee team reply and move it through open → in progress → resolved → closed.
 * Each ticket is a short conversation. Status changes appear in it as notes.
 */

const v = require('../utils/validate');
const { badRequest, notFound } = require('../http/errors');
const { newId } = require('../utils/ids');

const CATEGORIES = ['bug', 'issue', 'question', 'billing', 'feature', 'other'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const ms = (d) => (d ? new Date(d).getTime() : null);

module.exports = function supportRoutes(router, { db, auth, uploads, limiter }) {
  const owner = (req) => auth.requireUser(req, 'owner');
  const team = (req) => auth.requireUser(req, 'superadmin', 'platform_staff');

  const ticketOut = (t, side) => ({
    id: t.id,
    number: t.number,
    salonId: t.salon_id,
    business: t.business_name || '',
    businessLogo: t.business_logo || '',
    businessColor: t.business_color || '',
    raisedBy: t.raised_by || '',
    category: t.category,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    createdAt: ms(t.created_at),
    updatedAt: ms(t.updated_at),
    lastFromTeam: !!t.last_from_team,
    replies: t.replies || 0,
    // New messages from the other side since this side last opened the ticket.
    unread: side === 'owner' ? !!t.owner_unread : !!t.team_unread,
  });

  const LIST = `
    SELECT t.*, s.name AS business_name, s.logo_url AS business_logo, s.brand_color AS business_color,
           u.name AS raised_by,
           (SELECT count(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.status = '')::int - 1 AS replies,
           (SELECT m.from_team FROM support_messages m WHERE m.ticket_id = t.id AND m.status = '' ORDER BY m.id DESC LIMIT 1) AS last_from_team,
           EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id = t.id AND m.from_team AND m.created_at > t.owner_seen_at) AS owner_unread,
           EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id = t.id AND NOT m.from_team
                     AND (t.team_seen_at IS NULL OR m.created_at > t.team_seen_at)) AS team_unread
      FROM support_tickets t
      JOIN salons s ON s.id = t.salon_id
      LEFT JOIN users u ON u.id = t.created_by`;

  async function full(id, side) {
    const { rows } = await db.query(`${LIST} WHERE t.id = $1`, [id]);
    if (!rows[0]) throw notFound('Ticket not found');
    const { rows: msgs } = await db.query('SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY id', [id]);
    // Opening a ticket marks the other side's messages as read.
    await db.query(
      `UPDATE support_tickets SET ${side === 'owner' ? 'owner_seen_at' : 'team_seen_at'} = now() WHERE id = $1`,
      [id],
    );
    return {
      ...ticketOut(rows[0], side),
      unread: false,
      messages: msgs.map((m) => ({
        id: m.id,
        author: m.author_name,
        fromTeam: m.from_team,
        body: m.body,
        image: m.image_url,
        status: m.status,
        createdAt: ms(m.created_at),
      })),
    };
  }

  async function addMessage(ticketId, user, fromTeam, body, image, status = '') {
    const imageUrl = image ? await uploads.replace(image, '', LIMITS.screenshot) : '';
    await db.query(
      `INSERT INTO support_messages (ticket_id, author_id, author_name, from_team, body, image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ticketId, user.id, user.name || user.username, fromTeam, body, imageUrl, status],
    );
  }

  const counts = (rows) => ({
    open: rows.filter((t) => t.status === 'open').length,
    inProgress: rows.filter((t) => t.status === 'in_progress').length,
    resolved: rows.filter((t) => t.status === 'resolved').length,
    closed: rows.filter((t) => t.status === 'closed').length,
  });

  /* ---------- business owner ---------- */

  router.get('/api/owner/tickets', async ({ req }) => {
    const user = await owner(req);
    const { rows } = await db.query(`${LIST} WHERE t.salon_id = $1 ORDER BY t.updated_at DESC LIMIT 500`, [
      user.salon_id,
    ]);
    const tickets = rows.map((t) => ticketOut(t, 'owner'));
    return { tickets, counts: counts(tickets), unread: tickets.filter((t) => t.unread).length, categories: CATEGORIES };
  });

  router.post('/api/owner/tickets', async ({ req, body, ip }) => {
    const user = await owner(req);
    await limiter.check('ticket', ip, 20, 60 * 60_000);
    const category = CATEGORIES.includes(body.category) ? body.category : 'issue';
    const subject = v.required(v.text(body.subject, 120), 'Subject');
    const message = v.required(v.text(body.message, 4000), 'Message');
    const id = newId(5);
    await db.query(
      `INSERT INTO support_tickets (id, number, salon_id, created_by, category, subject)
       VALUES ($1, nextval('support_ticket_numbers'), $2, $3, $4, $5)`,
      [id, user.salon_id, user.id, category, subject],
    );
    await addMessage(id, user, false, message, body.image);
    return full(id, 'owner');
  });

  async function ownTicket(user, id) {
    const { rows } = await db.query('SELECT * FROM support_tickets WHERE id = $1 AND salon_id = $2', [
      id,
      user.salon_id,
    ]);
    if (!rows[0]) throw notFound('Ticket not found');
    return rows[0];
  }

  router.get('/api/owner/tickets/:id', async ({ req, params }) => {
    const user = await owner(req);
    await ownTicket(user, params.id);
    return full(params.id, 'owner');
  });

  // Owner replies. Replying to a resolved or closed ticket opens it again.
  router.post('/api/owner/tickets/:id/reply', async ({ req, params, body }) => {
    const user = await owner(req);
    const t = await ownTicket(user, params.id);
    const message = v.required(v.text(body.message, 4000), 'Message');
    await addMessage(t.id, user, false, message, body.image);
    if (t.status === 'resolved' || t.status === 'closed') await addMessage(t.id, user, false, '', '', 'open');
    await db.query(
      `UPDATE support_tickets SET updated_at = now(), status = CASE WHEN status IN ('resolved', 'closed') THEN 'open' ELSE status END WHERE id = $1`,
      [t.id],
    );
    return full(t.id, 'owner');
  });

  /* ---------- super admin and BQuee team ---------- */

  router.get('/api/admin/tickets', async ({ req }) => {
    await team(req);
    const { rows } = await db.query(`${LIST} ORDER BY t.updated_at DESC LIMIT 2000`);
    const tickets = rows.map((t) => ticketOut(t, 'team'));
    return { tickets, counts: counts(tickets), unread: tickets.filter((t) => t.unread).length, categories: CATEGORIES };
  });

  router.get('/api/admin/tickets/:id', async ({ req, params }) => {
    await team(req);
    return full(params.id, 'team');
  });

  // Team reply and/or status / priority change.
  router.post('/api/admin/tickets/:id/reply', async ({ req, params, body }) => {
    const user = await team(req);
    const { rows } = await db.query('SELECT * FROM support_tickets WHERE id = $1', [params.id]);
    const t = rows[0];
    if (!t) throw notFound('Ticket not found');
    const message = v.text(body.message, 4000);
    const status = body.status === undefined ? t.status : body.status;
    const priority = body.priority === undefined ? t.priority : body.priority;
    if (!STATUSES.includes(status)) throw badRequest('Unknown status');
    if (!PRIORITIES.includes(priority)) throw badRequest('Unknown priority');
    if (!message && !body.image && status === t.status && priority === t.priority)
      throw badRequest('Write a reply or change the status');
    if (message || body.image) await addMessage(t.id, user, true, message, body.image);
    if (status !== t.status) await addMessage(t.id, user, true, '', '', status);
    await db.query('UPDATE support_tickets SET status = $2, priority = $3, updated_at = now() WHERE id = $1', [
      t.id,
      status,
      priority,
    ]);
    return full(t.id, 'team');
  });
};
