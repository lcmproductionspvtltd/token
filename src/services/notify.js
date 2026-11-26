'use strict';

/**
 * Notifications for everyone who signs in: business owners, staff, the BQuee team and customers.
 *
 * Kept light on the server on purpose:
 *  - one small row per person, written once when something happens (no queues, no outside service);
 *  - apps and dashboards ask "anything after #123?" now and then. When this server already knows
 *    the answer is "no" (it wrote or read that person's newest id a moment ago), it answers from
 *    memory without touching the database;
 *  - "read" is a single number per person (everything up to that id), not a flag on every row;
 *  - rows older than 60 days are cleared by the hourly clean-up.
 * Sending never breaks the action that caused it: a failed notification is only logged.
 */

const MAX_PAGE = 30;
const FRESH_MS = 20_000; // how long a remembered "newest id" is trusted (other servers may write too)
const MAX_REMEMBERED = 50_000;

const tokenLabel = (t) => (t.prefix ? t.prefix + '-' : '#') + String(t.number).padStart(3, '0');
const clip = (s, n) => {
  const text = String(s == null ? '' : s)
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
};

function createNotifier(db, log = console) {
  const newest = new Map(); // 'u:<id>' | 'c:<id>' → { id, at }

  const keyOf = (who) => (who.userId ? 'u:' + who.userId : 'c:' + who.customerId);
  function remember(key, id) {
    if (newest.size > MAX_REMEMBERED) newest.clear();
    const known = newest.get(key);
    newest.set(key, { id: Math.max(Number(id) || 0, known ? known.id : 0), at: Date.now() });
  }

  /** Writes one notification for each user id the SELECT returns. Never throws. */
  async function toUsersWhere(where, params, note) {
    try {
      const n = params.length;
      const { rows } = await db.query(
        `INSERT INTO notifications (user_id, kind, title, body, link)
         SELECT u.id, $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4} FROM users u WHERE ${where}
         RETURNING id, user_id`,
        [...params, clip(note.kind || 'info', 20), clip(note.title, 120), clip(note.body, 400), clip(note.link, 200)],
      );
      for (const r of rows) remember('u:' + r.user_id, r.id);
      return rows.length;
    } catch (err) {
      log.error('Notification not saved:', err.message);
      return 0;
    }
  }

  const ACTIVE = `COALESCE(u.is_active, true)`;

  return {
    tokenLabel,

    /** The business owner(s) of a business. */
    owners: (salonId, note) => toUsersWhere(`u.role = 'owner' AND u.salon_id = $1 AND ${ACTIVE}`, [salonId], note),

    /** The sign-in accounts of these staff members (staff ids, not user ids). */
    staff: (staffIds, note) =>
      staffIds && staffIds.length
        ? toUsersWhere(
            `u.role = 'staff' AND u.staff_id = ANY($1::text[]) AND ${ACTIVE}`,
            [[...new Set(staffIds)]],
            note,
          )
        : Promise.resolve(0),

    /** The super admin and the BQuee team. */
    team: (note) => toUsersWhere(`u.role IN ('superadmin', 'platform_staff') AND ${ACTIVE}`, [], note),

    /** Only the super admin (things only they handle, like account deletion requests). */
    superadmins: (note) => toUsersWhere(`u.role = 'superadmin' AND ${ACTIVE}`, [], note),

    /** One person by user id. */
    user: (userId, note) => toUsersWhere(`u.id = $1`, [userId], note),

    /** A customer (BQuee app / website account). */
    async customer(customerId, note) {
      if (!customerId) return 0;
      try {
        const { rows } = await db.query(
          `INSERT INTO notifications (customer_id, kind, title, body, link) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            customerId,
            clip(note.kind || 'info', 20),
            clip(note.title, 120),
            clip(note.body, 400),
            clip(note.link, 200),
          ],
        );
        remember('c:' + customerId, rows[0].id);
        return 1;
      } catch (err) {
        log.error('Notification not saved:', err.message);
        return 0;
      }
    },

    /**
     * A person's notifications. `who` = { userId } or { customerId }.
     * With `after` only newer ones come back – usually none, often without asking the database.
     * Answer: { items (newest first), unread, last (newest id), readUpTo }.
     */
    async feed(who, after = 0) {
      const key = keyOf(who);
      after = Math.max(0, Number(after) || 0);
      const known = newest.get(key);
      if (after && known && Date.now() - known.at < FRESH_MS && known.id <= after) return { items: [], same: true };

      const col = who.userId ? 'user_id' : 'customer_id';
      const owner = who.userId ? 'users' : 'customers';
      const id = who.userId || who.customerId;
      const [{ rows }, { rows: meta }] = await Promise.all([
        db.query(
          `SELECT id, kind, title, body, link, created_at FROM notifications
            WHERE ${col} = $1 AND id > $2 ORDER BY id DESC LIMIT ${MAX_PAGE}`,
          [id, after],
        ),
        db.query(
          `SELECT o.notes_read,
                  (SELECT count(*)::int FROM (SELECT 1 FROM notifications n WHERE n.${col} = o.id AND n.id > o.notes_read LIMIT 100) x) AS unread,
                  (SELECT COALESCE(max(n.id), 0) FROM notifications n WHERE n.${col} = o.id) AS last
             FROM ${owner} o WHERE o.id = $1`,
          [id],
        ),
      ]);
      const m = meta[0] || { notes_read: 0, unread: 0, last: 0 };
      remember(key, m.last);
      return {
        items: rows.map((r) => ({
          id: Number(r.id),
          kind: r.kind,
          title: r.title,
          body: r.body,
          link: r.link,
          at: r.created_at,
        })),
        unread: m.unread,
        last: Number(m.last),
        readUpTo: Number(m.notes_read),
      };
    },

    /** Marks everything up to `upTo` (default: everything) as read. */
    async markRead(who, upTo) {
      const table = who.userId ? 'users' : 'customers';
      const col = who.userId ? 'user_id' : 'customer_id';
      const id = who.userId || who.customerId;
      const n = Number(upTo);
      const limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : Number.MAX_SAFE_INTEGER;
      await db.query(
        `UPDATE ${table} o SET notes_read = GREATEST(o.notes_read,
           LEAST($2::bigint, (SELECT COALESCE(max(x.id), 0) FROM notifications x WHERE x.${col} = o.id)))
          WHERE o.id = $1`,
        [id, limit],
      );
      return { ok: true };
    },

    /** Hourly clean-up. */
    prune: (client = db) => client.query(`DELETE FROM notifications WHERE created_at < now() - interval '60 days'`),
  };
}

module.exports = { createNotifier, tokenLabel };
