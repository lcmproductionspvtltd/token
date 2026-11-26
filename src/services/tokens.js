'use strict';

/**
 * Tokens: booking (now, or an appointment at a chosen time), loading with their service items, staff
 * actions (start / finish) and the expiry of tokens nobody used (after the business's hours, default 24).
 */

const { badRequest, forbidden, notFound, HttpError } = require('../http/errors');
const { newId } = require('../utils/ids');
const { today } = require('../utils/time');
const queue = require('./queue');
const serialize = require('./serializers');
const { featuresOf } = require('./features');
const { tokenLabel } = require('./notify');
// Open (waiting or in service) tokens one mobile number may hold at one branch.
const MAX_OPEN_PER_MOBILE = 3;
// Appointments can be booked from a few minutes ahead up to this many days ahead.
const APPOINTMENT_MIN_MINUTES = 5;
const APPOINTMENT_MAX_DAYS = 90;
const { APPOINTMENT_LEAD_MINUTES } = serialize;

/**
 * SQL: a token that is in the live queue now – open, not past its expiry, and (for an appointment)
 * within APPOINTMENT_LEAD_MINUTES of its time. Tokens stay live across the day change until they expire.
 */
const LIVE = `t.status IN ('waiting', 'serving')
  AND (t.expires_at IS NULL OR t.expires_at > now())
  AND (t.appointment_at IS NULL OR t.status = 'serving' OR t.appointment_at <= now() + make_interval(mins => ${APPOINTMENT_LEAD_MINUTES}))`;
/** SQL: open (waiting or being served) and not expired – live or an upcoming appointment. */
const OPEN = `t.status IN ('waiting', 'serving') AND (t.expires_at IS NULL OR t.expires_at > now())`;

/** True when the super admin hides customer contact details from this signed-in owner/staff. */
const masksContacts = (user) => !!user && !!user.salon_id && featuresOf(user.salon_features).maskContacts;

const TOKEN_ITEMS_JSON = `
  COALESCE((SELECT json_agg(i ORDER BY i.position) FROM token_items i WHERE i.token_id = t.id), '[]') AS items`;

function createTokenService(db, notify = null) {
  /**
   * Unused tokens expire: once a token's expiry time has passed (booking or appointment time + the
   * business's hours), services nobody started become "missed" (shown as Expired) and services left
   * running are closed at their planned end time. Tokens from before expiry existed: 24 hours.
   */
  async function expireStaleTokens() {
    const due = `t.status IN ('waiting', 'serving') AND COALESCE(t.expires_at, t.created_at + interval '24 hours') <= now()`;
    await db.transaction(async (tx) => {
      await tx.query(
        `UPDATE token_items i
            SET status   = CASE WHEN i.status = 'waiting' THEN 'missed' ELSE 'done' END,
                ended_at = CASE WHEN i.status = 'in_progress' THEN i.started_at + make_interval(mins => i.duration_min) ELSE i.ended_at END
           FROM tokens t
          WHERE t.id = i.token_id AND ${due} AND i.status IN ('waiting', 'in_progress')`,
      );
      await tx.query(
        `UPDATE tokens t
            SET status = CASE WHEN EXISTS (SELECT 1 FROM token_items i WHERE i.token_id = t.id AND i.status = 'done')
                              THEN 'done' ELSE 'missed' END,
                finished_at = now()
          WHERE ${due}`,
      );
    });
  }

  /** Loads tokens (with items) matching a WHERE clause, oldest first. */
  async function findTokens(where, params, client = db) {
    const { rows } = await client.query(
      `SELECT t.*, t.token_date::text AS token_date, ${TOKEN_ITEMS_JSON}
         FROM tokens t WHERE ${where} ORDER BY t.created_at`,
      params,
    );
    // json_agg returns raw JSON: timestamps arrive as strings, numeric as numbers.
    return rows;
  }

  /** The live queue of a branch (waiting/serving tokens, any day, not expired), in API shape (wait estimates). */
  async function openTokens(branchId, client = db) {
    const rows = await findTokens(`t.branch_id = $1 AND ${LIVE}`, [branchId], client);
    return rows.map((row) => serialize.token(row));
  }

  /** Open tokens of several branches with one query: Map branchId → tokens (audit section 5, no N+1). */
  async function openTokensOf(branchIds, client = db) {
    const byBranch = new Map(branchIds.map((id) => [id, []]));
    if (!branchIds.length) return byBranch;
    const rows = await findTokens(`t.branch_id = ANY($1) AND ${LIVE}`, [branchIds], client);
    for (const row of rows) {
      const t = serialize.token(row);
      if (byBranch.has(t.branchId)) byBranch.get(t.branchId).push(t);
    }
    return byBranch;
  }

  /** Adds `wait` and `ahead` to API tokens of one branch. */
  async function withWaits(apiTokens) {
    const cache = new Map();
    for (const token of apiTokens) {
      if (!cache.has(token.branchId)) cache.set(token.branchId, await openTokens(token.branchId));
      Object.assign(token, queue.estimateWait(token, cache.get(token.branchId)));
    }
    return apiTokens;
  }

  /**
   * Customer booking. Returns the new token id.
   * `byStaff` = { staffId, name }: a staff member made the token by hand for a walk-in – every service
   * is theirs (even while they show as offline) and only services they do can be chosen.
   * `appointmentAt` (optional, ISO time or epoch ms): the customer chose a time – the token is for that
   * day, waits under "Upcoming appointments" and joins the queue shortly before it.
   */
  async function book({ branchId, customer, items, offerId, customerId = null, byStaff = null, appointmentAt = null }) {
    const appointment = appointmentTime(appointmentAt, byStaff);
    let made = null; // what to tell people once the booking is saved
    const id = await db.transaction(async (tx) => {
      const {
        rows: [branch],
      } = await tx.query(
        `SELECT b.*, s.is_active AS salon_active, s.expires_on::text AS salon_expires_on
           FROM branches b JOIN salons s ON s.id = b.salon_id
          WHERE b.id = $1 OR b.slug = lower($1) ORDER BY (b.id = $1) DESC LIMIT 1`,
        [String(branchId || '')],
      );
      if (!branch) throw notFound('Branch not found');
      branchId = branch.id; // the booking page may have sent the name link (/b/lotussalon)
      const salonOpen = branch.salon_active && (!branch.salon_expires_on || branch.salon_expires_on >= today());
      if (!salonOpen || !branch.is_active) throw forbidden('Booking is closed right now');
      if (!items.length) throw badRequest('Choose at least one service');
      // One phone number can hold at most a few open tokens at a branch, so nobody can fill a queue
      // with fake bookings (staff-made walk-in tokens are not limited).
      const digits = String((customer && customer.mobile) || '').replace(/\D/g, '');
      if (!byStaff && digits) {
        const {
          rows: [mine],
        } = await tx.query(
          `SELECT count(*)::int AS n FROM tokens t
            WHERE t.branch_id = $1 AND ${OPEN}
              AND regexp_replace(t.customer_mobile, '\\D', '', 'g') = $2`,
          [branch.id, digits],
        );
        if (mine.n >= MAX_OPEN_PER_MOBILE)
          throw new HttpError(
            429,
            `This mobile number already has ${mine.n} tokens waiting here. Wait until one is finished, or ask the business.`,
          );
      }

      const open = await openTokens(branch.id, tx);
      const planned = new Map(); // staffId → minutes already assigned in this booking
      const chosen = [];
      const seen = new Set();

      for (const request of items.slice(0, 20)) {
        const {
          rows: [svc],
        } = await tx.query(
          `SELECT s.*, COALESCE((SELECT p.price FROM service_branch_prices p WHERE p.service_id = s.id AND p.branch_id = $3), s.price) AS branch_price FROM services s
            WHERE s.id = $1 AND s.salon_id = $2 AND s.is_active
              AND (NOT EXISTS (SELECT 1 FROM service_branches sb WHERE sb.service_id = s.id)
                   OR EXISTS (SELECT 1 FROM service_branches sb WHERE sb.service_id = s.id AND sb.branch_id = $3))`,
          [request.serviceId, branch.salon_id, branch.id],
        );
        if (!svc) throw badRequest('Invalid service selected');
        svc.price = svc.branch_price; // this branch's price
        if (seen.has(svc.id)) continue;
        seen.add(svc.id);

        // Now: only staff who are online. An appointment: any of the branch's staff (they may be off now).
        const { rows: eligible } = await tx.query(
          `SELECT st.id, st.name FROM staff st JOIN staff_services ss ON ss.staff_id = st.id
            WHERE st.branch_id = $1 AND st.is_active AND ss.service_id = $2
              AND (st.is_online OR st.id = $3 OR $4) ORDER BY st.name`,
          [branch.id, svc.id, byStaff ? byStaff.staffId : '', !!appointment],
        );
        if (byStaff && !eligible.some((s) => s.id === byStaff.staffId))
          throw badRequest(`${svc.name} isn’t one of your services – ask the owner to add it to you`);
        if (!eligible.length) throw badRequest(`No staff member is available for ${svc.name} right now`);

        let staff;
        if (byStaff) {
          staff = eligible.find((s) => s.id === byStaff.staffId);
        } else if (request.staffId && request.staffId !== 'any') {
          staff = eligible.find((s) => s.id === request.staffId);
          if (!staff) throw badRequest(`Your chosen staff member isn’t available for ${svc.name} right now`);
        } else {
          // "Any stylist": whoever will be free first.
          const loadOf = (s) => queue.staffLoad(s.id, open) + (planned.get(s.id) || 0);
          staff = eligible.reduce((best, s) => (loadOf(s) < loadOf(best) ? s : best));
        }
        planned.set(staff.id, (planned.get(staff.id) || 0) + svc.duration_min);
        chosen.push({ svc, staff });
      }

      // Offer the customer booked with: must be this business's, switched on and not expired.
      let offer = null;
      if (offerId) {
        const { rows } = await tx.query(
          `SELECT * FROM offers WHERE id = $1 AND salon_id = $2 AND is_active AND (valid_until IS NULL OR valid_until >= $3::date)`,
          [offerId, branch.salon_id, today()],
        );
        if (!rows[0]) throw badRequest('That offer has ended. Remove it to book without it.');
        offer = rows[0];
      }

      // The token's day: the appointment's (UTC) day, or today. Its number comes from that day's count.
      const date = appointment ? appointment.toISOString().slice(0, 10) : today();
      const {
        rows: [salonRules],
      } = await tx.query('SELECT token_expiry_hours FROM salons WHERE id = $1', [branch.salon_id]);
      const expiryHours = (salonRules && salonRules.token_expiry_hours) || 24;
      const {
        rows: [counter],
      } = await tx.query(
        `INSERT INTO token_counters (branch_id, token_date, last_number) VALUES ($1, $2, 1)
         ON CONFLICT (branch_id, token_date) DO UPDATE SET last_number = token_counters.last_number + 1
         RETURNING last_number, cycle`,
        [branch.id, date],
      );

      const id = newId(6);
      await tx.query(
        `INSERT INTO tokens (id, salon_id, branch_id, token_date, number, prefix, customer_name, customer_mobile, customer_email, cycle,
                             offer_id, offer_title, offer_code, discount_type, discount_value, customer_id,
                             appointment_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                 $17::timestamptz, COALESCE($17::timestamptz, now()) + make_interval(hours => $18))`,
        [
          id,
          branch.salon_id,
          branch.id,
          date,
          counter.last_number,
          branch.token_prefix,
          customer.name,
          customer.mobile,
          customer.email,
          counter.cycle,
          offer ? offer.id : null,
          offer ? offer.title : '',
          offer ? offer.promo_code : '',
          offer ? offer.discount_type : 'none',
          offer ? offer.discount_value : 0,
          customerId,
          appointment ? appointment.toISOString() : null,
          expiryHours,
        ],
      );
      for (const [position, { svc, staff }] of chosen.entries()) {
        await tx.query(
          `INSERT INTO token_items (token_id, position, service_id, service_name, staff_id, staff_name, duration_min, price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, position, svc.id, svc.name, staff.id, staff.name, svc.duration_min, svc.price],
        );
      }
      made = {
        salonId: branch.salon_id,
        label: tokenLabel({ prefix: branch.token_prefix, number: counter.last_number }),
        chosen,
        appointment,
      };
      return id;
    });
    if (notify && made) await tellBooked(made, customer, byStaff);
    return id;
  }

  /** "New token" for the owner and for each staff member who has a service on it (not the one who made it). */
  async function tellBooked({ salonId, label, chosen, appointment }, customer, byStaff) {
    const services = chosen.map(({ svc, staff }) => `${svc.name} (${staff.name})`).join(', ');
    const how = byStaff ? `Added by ${byStaff.name}` : appointment ? 'Appointment booked' : 'Booked';
    await notify.owners(salonId, {
      kind: 'token',
      title: appointment ? `New appointment token ${label}` : `New token ${label}`,
      body: `${how} for ${customer.name}: ${services}`,
      link: '/owner?tab=tokens',
    });
    const others = chosen.map((c) => c.staff.id).filter((sid) => !byStaff || sid !== byStaff.staffId);
    await notify.staff(others, {
      kind: 'token',
      title: `New customer in your queue: ${label}`,
      body: `${customer.name} – ${chosen
        .filter((c) => others.includes(c.staff.id))
        .map((c) => c.svc.name)
        .join(', ')}`,
      link: '/staff',
    });
  }

  /**
   * Full token view: token + salon + branch + staff photos + live wait.
   * Contact details are shown only to the salon's own owner/staff.
   */
  async function view(tokenId, viewer) {
    await expireStaleTokens();
    const [row] = await findTokens('t.id = $1', [tokenId]);
    if (!row) throw notFound('Token not found');
    const canSeeContact =
      viewer && viewer.role !== 'superadmin' && viewer.salon_id === row.salon_id && !masksContacts(viewer);
    const token = serialize.token(row, { mask: !canSeeContact });

    const [
      {
        rows: [salon],
      },
      {
        rows: [branch],
      },
      { rows: photos },
    ] = await Promise.all([
      db.query('SELECT * FROM salons WHERE id = $1', [row.salon_id]),
      db.query('SELECT * FROM branches WHERE id = $1', [row.branch_id]),
      db.query(`SELECT id, photo_url FROM staff WHERE id = ANY($1::text[]) AND photo_url <> ''`, [
        token.items.map((i) => i.staffId).filter(Boolean),
      ]),
    ]);
    const staffPhotos = Object.fromEntries(photos.map((p) => [p.id, p.photo_url]));
    const { wait, ahead } = queue.estimateWait(token, await openTokens(row.branch_id));

    return {
      token,
      salon: salon ? serialize.salonPublic(salon) : {},
      branch: branch ? serialize.branch(branch) : {},
      staffPhotos,
      wait,
      ahead,
    };
  }

  /** The services one action works on: the chosen one, all of the person's (whole token) or their next one. */
  function pick(item, whole, mine, status) {
    if (item) return item.status === status ? [item] : [];
    if (whole) return mine.filter((i) => i.status === status);
    const next = mine.find((i) => i.status === status);
    return next ? [next] : [];
  }

  /**
   * Staff / owner action on a token (buttons, or a QR scan).
   *   start  – start the next waiting service (or the one at `index`)
   *   finish – finish the running service (or the one at `index`)
   *   next   – one-scan toggle: finish if running, otherwise start
   *   cancel – owner only
   * When the business starts tokens "whole" (Settings), start / finish / next without an `index` act on
   * all of the person's services on the token at once: a staff member's own, or every service for the owner.
   */
  async function act(user, tokenId, action, index) {
    await expireStaleTokens();
    let after = null; // who to tell once it is saved
    const message = await db.transaction(async (tx) => {
      const {
        rows: [token],
      } = await tx.query('SELECT * FROM tokens WHERE id = $1 FOR UPDATE', [tokenId]);
      if (!token || token.salon_id !== user.salon_id) throw notFound('This token does not belong to your business');
      if (token.status === 'cancelled') throw badRequest('This token was cancelled');
      if (token.status === 'missed') throw badRequest('This token has expired – it wasn’t used in time');

      const { rows: items } = await tx.query('SELECT * FROM token_items WHERE token_id = $1 ORDER BY position', [
        tokenId,
      ]);
      const mine = user.role === 'staff' ? items.filter((i) => i.staff_id === user.staff_id) : items;
      if (!mine.length) throw forbidden('No service on this token is assigned to you');

      const picked = index != null && index !== '';
      let item = picked ? items[Number(index)] : null;
      if (picked && !item) throw notFound('That service is not on this token');
      if (item && !mine.includes(item)) throw forbidden('This service is assigned to another staff');
      const {
        rows: [salon],
      } = await tx.query('SELECT token_flow FROM salons WHERE id = $1', [token.salon_id]);
      const whole = !item && salon && salon.token_flow === 'whole';

      let step = action;
      if (step === 'next') {
        const pool = item ? [item] : mine;
        if (pool.some((i) => i.status === 'in_progress')) step = 'finish';
        else if (pool.some((i) => i.status === 'waiting')) step = 'start';
        else throw badRequest('All your services on this token are already finished');
      }

      const names = (list) => (list.length === 1 ? list[0].service_name : `${list.length} services`);
      let text;
      if (step === 'start') {
        const list = pick(item, whole, mine, 'waiting');
        if (!list.length) throw badRequest('Nothing waiting to start');
        const ids = list.map((i) => i.id);
        await tx.query(`UPDATE token_items SET status = 'in_progress', started_at = now() WHERE id = ANY($1::bigint[])`, [
          ids,
        ]);
        // Starting a token means the staff are at work: make sure they show as online.
        const staffIds = [...new Set(list.map((i) => i.staff_id).filter(Boolean))];
        if (staffIds.length) await tx.query('UPDATE staff SET is_online = true WHERE id = ANY($1::text[])', [staffIds]);
        for (const i of list) i.status = 'in_progress';
        text = `Started ${names(list)}`;
        after = { kind: 'start', token, item: list[0], items: list };
      } else if (step === 'finish') {
        const list = pick(item, whole, mine, 'in_progress');
        if (!list.length) throw badRequest('Service has not started yet');
        await tx.query(`UPDATE token_items SET status = 'done', ended_at = now() WHERE id = ANY($1::bigint[])`, [
          list.map((i) => i.id),
        ]);
        for (const i of list) i.status = 'done';
        text = `Finished ${names(list)}`;
      } else if (step === 'cancel') {
        if (user.role !== 'owner') throw forbidden('Only the service owner can cancel tokens');
        await tx.query(`UPDATE tokens SET status = 'cancelled', finished_at = now() WHERE id = $1`, [tokenId]);
        after = { kind: 'cancel', token, items };
        return 'Token cancelled';
      } else {
        throw notFound('Unknown action');
      }

      const status = queue.statusFromItems(items);
      await tx.query(
        `UPDATE tokens SET status = $2, finished_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END WHERE id = $1`,
        [tokenId, status],
      );
      return text;
    });
    if (notify && after) await tellActed(after);
    return { ...(await view(tokenId, user)), message };
  }

  /** "It's your turn" for the customer; "cancelled" for the customer and the staff on the token. */
  async function tellActed({ kind, token, item, items }) {
    const label = tokenLabel(token);
    if (kind === 'start') {
      const what =
        items && items.length > 1
          ? items.map((i) => i.service_name).join(', ') + ' are'
          : `${item.service_name}${item.staff_name ? ' with ' + item.staff_name : ''} is`;
      await notify.customer(token.customer_id, {
        kind: 'turn',
        title: `It’s your turn – ${label}`,
        body: `${what} starting now.`,
        link: '/t/' + token.id,
      });
    } else if (kind === 'cancel') {
      await notify.customer(token.customer_id, {
        kind: 'cancel',
        title: `Token ${label} was cancelled`,
        body: 'The business cancelled this token. Book again any time.',
        link: '/t/' + token.id,
      });
      await notify.staff(
        items
          .filter((i) => i.status === 'waiting')
          .map((i) => i.staff_id)
          .filter(Boolean),
        { kind: 'cancel', title: `Token ${label} was cancelled`, body: token.customer_name, link: '/staff' },
      );
    }
  }

  /* ---------- extra services added by staff during the visit ---------- */

  const BRANCH_SERVICE_FILTER = `
    s.salon_id = $1 AND s.is_active
    AND (NOT EXISTS (SELECT 1 FROM service_branches sb WHERE sb.service_id = s.id)
         OR EXISTS (SELECT 1 FROM service_branches sb WHERE sb.service_id = s.id AND sb.branch_id = $2))`;

  /** Locks a token of the user's salon that can still change (not cancelled, not expired). */
  async function lockEditableToken(tx, user, tokenId) {
    const {
      rows: [token],
    } = await tx.query('SELECT *, token_date::text AS token_date FROM tokens WHERE id = $1 FOR UPDATE', [tokenId]);
    if (!token || token.salon_id !== user.salon_id) throw notFound('This token does not belong to your business');
    if (token.status === 'cancelled') throw badRequest('This token was cancelled');
    if (token.status === 'missed') throw badRequest('This token has expired – services can’t be changed');
    if (user.role === 'staff') {
      const {
        rows: [me],
      } = await tx.query('SELECT branch_id FROM staff WHERE id = $1', [user.staff_id]);
      if (!me || me.branch_id !== token.branch_id) throw forbidden('This token is for another branch');
    }
    return token;
  }

  async function saveStatus(tx, tokenId) {
    const { rows: items } = await tx.query('SELECT status FROM token_items WHERE token_id = $1', [tokenId]);
    const status = queue.statusFromItems(items);
    await tx.query(
      `UPDATE tokens SET status = $2, finished_at = CASE WHEN $2 = 'done' THEN COALESCE(finished_at, now()) ELSE NULL END
        WHERE id = $1`,
      [tokenId, status],
    );
  }

  /** Services that can be added to a token, each with the staff who do it and their queue now. */
  async function serviceOptions(user, tokenId) {
    const {
      rows: [token],
    } = await db.query('SELECT * FROM tokens WHERE id = $1', [tokenId]);
    if (!token || token.salon_id !== user.salon_id) throw notFound('This token does not belong to your business');
    const [{ rows: services }, { rows: links }, open] = await Promise.all([
      db.query(
        `SELECT s.*, COALESCE((SELECT p.price FROM service_branch_prices p WHERE p.service_id = s.id AND p.branch_id = $2), s.price) AS branch_price FROM services s WHERE ${BRANCH_SERVICE_FILTER} ORDER BY s.category, s.name`,
        [token.salon_id, token.branch_id],
      ),
      db.query(
        `SELECT ss.service_id, st.id, st.name, st.photo_url, st.is_online FROM staff st JOIN staff_services ss ON ss.staff_id = st.id
          WHERE st.branch_id = $1 AND st.is_active ORDER BY st.name`,
        [token.branch_id],
      ),
      openTokens(token.branch_id),
    ]);
    return {
      me: user.staff_id || null,
      services: services
        .map((svc) => ({
          id: svc.id,
          name: svc.name,
          category: svc.category,
          duration: svc.duration_min,
          price: Number(svc.branch_price),
          staff: links
            .filter((l) => l.service_id === svc.id)
            .map((l) => ({
              id: l.id,
              name: l.name,
              photo: l.photo_url,
              online: l.is_online,
              busy: queue.staffBusy(l.id, open),
              load: Math.ceil(queue.staffLoad(l.id, open)),
            })),
        }))
        .filter((svc) => svc.staff.some((x) => x.online)),
    };
  }

  /** Staff adds a service the customer asked for during the visit. Waits of everyone after update live. */
  async function addService(user, tokenId, { serviceId, staffId }) {
    await expireStaleTokens();
    const message = await db.transaction(async (tx) => {
      const token = await lockEditableToken(tx, user, tokenId);
      const {
        rows: [svc],
      } = await tx.query(
        `SELECT s.*, COALESCE((SELECT p.price FROM service_branch_prices p WHERE p.service_id = s.id AND p.branch_id = $2), s.price) AS branch_price FROM services s WHERE s.id = $3 AND ${BRANCH_SERVICE_FILTER}`,
        [token.salon_id, token.branch_id, serviceId],
      );
      if (!svc) throw badRequest('Choose a service');
      svc.price = svc.branch_price; // this branch's price
      const { rows: eligible } = await tx.query(
        `SELECT st.id, st.name FROM staff st JOIN staff_services ss ON ss.staff_id = st.id
          WHERE st.branch_id = $1 AND st.is_active AND st.is_online AND ss.service_id = $2 ORDER BY st.name`,
        [token.branch_id, svc.id],
      );
      if (!eligible.length) throw badRequest(`No staff member is online for ${svc.name} right now`);

      let staff;
      if (staffId && staffId !== 'any') {
        staff = eligible.find((x) => x.id === staffId);
        if (!staff) throw badRequest(`That staff member is offline or does not do ${svc.name}`);
      } else {
        const open = await openTokens(token.branch_id, tx);
        staff = eligible.reduce((best, x) => (queue.staffLoad(x.id, open) < queue.staffLoad(best.id, open) ? x : best));
      }

      const {
        rows: [{ count, next }],
      } = await tx.query(
        'SELECT count(*)::int AS count, COALESCE(max(position), -1) + 1 AS next FROM token_items WHERE token_id = $1',
        [tokenId],
      );
      if (count >= 20) throw badRequest('A token can have at most 20 services');
      await tx.query(
        `INSERT INTO token_items (token_id, position, service_id, service_name, staff_id, staff_name, duration_min, price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tokenId, next, svc.id, svc.name, staff.id, staff.name, svc.duration_min, svc.price],
      );
      await saveStatus(tx, tokenId);
      return `Added ${svc.name} with ${staff.name}`;
    });
    return { ...(await view(tokenId, user)), message };
  }

  /** Removes a service that hasn't started (e.g. added by mistake). The token keeps at least one. */
  async function removeService(user, tokenId, index) {
    const message = await db.transaction(async (tx) => {
      await lockEditableToken(tx, user, tokenId);
      const { rows: items } = await tx.query('SELECT * FROM token_items WHERE token_id = $1 ORDER BY position', [
        tokenId,
      ]);
      const item = items[Number(index)];
      if (!item) throw notFound('Service not found on this token');
      if (item.status !== 'waiting') throw badRequest('Only services that haven’t started can be removed');
      if (items.length < 2) throw badRequest('A token needs at least one service – cancel the token instead');
      if (user.role === 'staff' && item.staff_id !== user.staff_id)
        throw forbidden('Ask the staff member it’s assigned to, or the owner, to remove it');
      await tx.query('DELETE FROM token_items WHERE id = $1', [item.id]);
      await saveStatus(tx, tokenId);
      return `Removed ${item.service_name}`;
    });
    return { ...(await view(tokenId, user)), message };
  }

  /**
   * Tokens of a salon for one day (owner list), optionally one branch – every status, Expired included
   * (only the owner sees those). Today's list also has tokens from earlier days that are still open
   * (they stay until they expire). A future day lists its appointment tokens.
   */
  async function listForSalon(salonId, date, branchId = '', { mask = false } = {}) {
    await expireStaleTokens();
    const day = `(t.token_date = $2 OR ($2 = $3 AND t.token_date < $2 AND ${OPEN}))`;
    const rows = branchId
      ? await findTokens(`t.salon_id = $1 AND ${day} AND t.branch_id = $4`, [salonId, date, today(), branchId])
      : await findTokens(`t.salon_id = $1 AND ${day}`, [salonId, date, today()]);
    return withWaits(rows.map((row) => serialize.token(row, { mask })));
  }

  /**
   * A staff member's tokens: today's and any still-open earlier ones that include a service of theirs.
   * Staff never see cancelled or expired tokens (the owner does, under Expired).
   */
  async function listForStaff(staffId, { mask = false } = {}) {
    await expireStaleTokens();
    const rows = await findTokens(
      `(t.token_date = $2 OR (t.token_date < $2 AND ${OPEN})) AND t.status NOT IN ('cancelled', 'missed')
       AND EXISTS (SELECT 1 FROM token_items i WHERE i.token_id = t.id AND i.staff_id = $1)`,
      [staffId, today()],
    );
    return withWaits(rows.map((row) => serialize.token(row, { mask })));
  }

  /**
   * Owner: cancels every token still waiting in their business (any day, appointments too) that was
   * booked with this mobile number (fake or repeated bookings). Returns how many were cancelled.
   */
  async function cancelByMobile(user, mobile) {
    const digits = String(mobile || '').replace(/\D/g, '');
    if (digits.length < 6) throw badRequest('Enter the mobile number');
    const { rows } = await db.query(
      `SELECT t.id FROM tokens t
        WHERE t.salon_id = $1 AND t.status = 'waiting' AND (t.expires_at IS NULL OR t.expires_at > now())
          AND regexp_replace(t.customer_mobile, '\\D', '', 'g') = $2`,
      [user.salon_id, digits],
    );
    for (const r of rows) await act(user, r.id, 'cancel');
    return rows.length;
  }

  /**
   * The appointment time asked for (or null): a few minutes ahead at the earliest, at most
   * APPOINTMENT_MAX_DAYS ahead. Walk-in tokens made by staff are always "now".
   */
  function appointmentTime(value, byStaff) {
    if (value === null || value === undefined || value === '' || byStaff) return null;
    const when = new Date(typeof value === 'number' ? value : String(value));
    if (Number.isNaN(when.getTime())) throw badRequest('Choose a valid appointment date and time');
    const now = Date.now();
    if (when.getTime() < now + APPOINTMENT_MIN_MINUTES * 60_000)
      throw badRequest('Choose an appointment time a little later – or book a token for now');
    if (when.getTime() > now + APPOINTMENT_MAX_DAYS * 86_400_000)
      throw badRequest(`Appointments can be booked up to ${APPOINTMENT_MAX_DAYS} days ahead`);
    when.setUTCSeconds(0, 0);
    return when;
  }

  return {
    cancelByMobile,
    expireStaleTokens,
    findTokens,
    withWaits,
    openTokens,
    openTokensOf,
    book,
    view,
    act,
    serviceOptions,
    addService,
    removeService,
    listForSalon,
    listForStaff,
    masksContacts,
  };
}

module.exports = { createTokenService };
