'use strict';

/**
 * Reports for every role, built from tokens in a date range.
 *
 *   owner – the whole business (filter by branch, staff member, status)
 *   staff – only the services this staff member did
 *   admin – every business on the platform (filter by category, status)
 *
 * Every report can also come back as CSV text (`csv`) for export.
 */

const v = require('../utils/validate');
const { badRequest } = require('../http/errors');
const { today } = require('../utils/time');
const { discountFor, maskMobile } = require('./serializers');

const ITEMS_JSON = `COALESCE((SELECT json_agg(i ORDER BY i.position) FROM token_items i WHERE i.token_id = t.id), '[]') AS items`;
const MAX_DAYS = 366;
const ROW_LIMIT = 300; // rows sent for on-screen tables; CSV always has all rows
const TOKEN_STATUSES = ['waiting', 'serving', 'done', 'cancelled', 'missed'];

const round2 = (n) => Math.round(n * 100) / 100;
const minutes = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 60000 : null);
const avg = (list) => (list.length ? Math.round((list.reduce((s, x) => s + x, 0) / list.length) * 10) / 10 : 0);
const tokenNo = (t) => (t.prefix ? `${t.prefix}-` : '#') + String(t.number).padStart(3, '0');
const timeOf = (ts) => (ts ? new Date(ts).toTimeString().slice(0, 5) : '');

/** From/to dates from the query: default is the last 30 days, at most a year. */
function range(query) {
  const to = v.date(query.to, 'end date') || today();
  const from = v.date(query.from, 'start date') || shiftDate(to, -29);
  if (from > to) throw badRequest('The start date is after the end date');
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days > MAX_DAYS) throw badRequest('Choose a range of one year or less');
  return { from, to, days };
}

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every date in the range, so charts show empty days too. */
function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) out.push(d);
  return out;
}

/** CSV with a header row; quotes every field that needs it. Starts with a BOM so Excel reads ₹ correctly. */
function toCsv(header, rows) {
  const cell = (x) => {
    const s = x === null || x === undefined ? '' : String(x);
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Money and timing facts of one token (items = raw rows from json_agg). */
function tokenFacts(t, staffId = '') {
  const items = t.items || [];
  const done = items.filter((i) => i.status === 'done');
  const subtotal = items.reduce((s, i) => s + Number(i.price), 0);
  const doneSub = done.reduce((s, i) => s + Number(i.price), 0);
  const doneTotal = doneSub - discountFor(t.discount_type, t.discount_value, doneSub);
  // Share of the discount for each completed service, in proportion to its price.
  const factor = doneSub > 0 ? doneTotal / doneSub : 1;
  const starts = items
    .map((i) => i.started_at)
    .filter(Boolean)
    .sort();
  const mine = staffId ? items.filter((i) => i.staff_id === staffId) : items;
  return {
    items,
    mine,
    subtotal,
    total: subtotal - discountFor(t.discount_type, t.discount_value, subtotal),
    doneTotal,
    discount: doneSub - doneTotal,
    factor,
    waitMin: starts.length ? minutes(t.created_at, starts[0]) : null,
  };
}

function createReportService(db) {
  async function loadTokens(where, params) {
    const { rows } = await db.query(
      `SELECT t.*, t.token_date::text AS token_date, b.name AS branch_name, ${ITEMS_JSON}
         FROM tokens t JOIN branches b ON b.id = t.branch_id
        WHERE ${where}
        ORDER BY t.token_date, t.created_at`,
      params,
    );
    return rows;
  }

  /* ---------- business (owner) ---------- */

  async function owner(salonId, query, { mask = false } = {}) {
    const r = range(query);
    const branchId = v.text(query.branchId, 40);
    const staffId = v.text(query.staffId, 40);
    const status = TOKEN_STATUSES.includes(query.status) ? query.status : '';

    const where = ['t.salon_id = $1', 't.token_date BETWEEN $2 AND $3'];
    const params = [salonId, r.from, r.to];
    if (branchId) where.push(`t.branch_id = $${params.push(branchId)}`);
    if (status) where.push(`t.status = $${params.push(status)}`);
    if (staffId)
      where.push(
        `EXISTS (SELECT 1 FROM token_items x WHERE x.token_id = t.id AND x.staff_id = $${params.push(staffId)})`,
      );

    const [
      list,
      { rows: branches },
      { rows: staff },
      {
        rows: [salon],
      },
    ] = await Promise.all([
      loadTokens(where.join(' AND '), params),
      db.query('SELECT id, name FROM branches WHERE salon_id = $1 ORDER BY created_at', [salonId]),
      db.query('SELECT id, name FROM staff WHERE salon_id = $1 ORDER BY name', [salonId]),
      db.query('SELECT name, currency FROM salons WHERE id = $1', [salonId]),
    ]);

    const days = new Map(
      eachDay(r.from, r.to).map((d) => [d, { date: d, tokens: 0, done: 0, cancelled: 0, revenue: 0 }]),
    );
    const byStaff = new Map();
    const byService = new Map();
    const byBranch = new Map();
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: 0 }));
    const customers = new Set();
    const waits = [];
    const serviceTimes = [];
    const s = { tokens: 0, done: 0, cancelled: 0, missed: 0, open: 0, revenue: 0, discount: 0, servicesDone: 0 };
    const rows = [];

    for (const t of list) {
      const f = tokenFacts(t, staffId);
      // With a staff filter, only that person's services count towards money and services.
      const counted = staffId ? f.mine : f.items;
      const doneItems = counted.filter((i) => i.status === 'done');
      const revenue = round2(doneItems.reduce((sum, i) => sum + Number(i.price) * f.factor, 0));

      s.tokens += 1;
      if (t.status === 'done') s.done += 1;
      else if (t.status === 'cancelled') s.cancelled += 1;
      else if (t.status === 'missed') s.missed += 1;
      else s.open += 1;
      s.revenue += revenue;
      if (!staffId) s.discount += f.discount;
      s.servicesDone += doneItems.length;
      customers.add(t.customer_mobile);
      if (f.waitMin !== null) waits.push(f.waitMin);

      const day = days.get(t.token_date);
      if (day) {
        day.tokens += 1;
        if (t.status === 'done') day.done += 1;
        if (t.status === 'cancelled') day.cancelled += 1;
        day.revenue = round2(day.revenue + revenue);
      }
      hours[new Date(t.created_at).getHours()].tokens += 1;

      const br = byBranch.get(t.branch_id) || { id: t.branch_id, name: t.branch_name, tokens: 0, done: 0, revenue: 0 };
      br.tokens += 1;
      if (t.status === 'done') br.done += 1;
      br.revenue = round2(br.revenue + revenue);
      byBranch.set(t.branch_id, br);

      for (const i of counted) {
        const key = i.staff_id || `name:${i.staff_name}`;
        const st = byStaff.get(key) || { id: i.staff_id || '', name: i.staff_name, services: 0, revenue: 0, times: [] };
        const sv = byService.get(i.service_id || i.service_name) || {
          id: i.service_id || '',
          name: i.service_name,
          count: 0,
          revenue: 0,
        };
        if (i.status === 'done') {
          const price = Number(i.price) * f.factor;
          st.services += 1;
          st.revenue = round2(st.revenue + price);
          sv.count += 1;
          sv.revenue = round2(sv.revenue + price);
          const m = minutes(i.started_at, i.ended_at);
          if (m !== null && m >= 0) {
            st.times.push(m);
            serviceTimes.push(m);
          }
        }
        byStaff.set(key, st);
        byService.set(i.service_id || i.service_name, sv);
      }

      rows.push({
        id: t.id,
        date: t.token_date,
        time: timeOf(t.created_at),
        token: tokenNo(t),
        customer: t.customer_name,
        mobile: mask ? maskMobile(t.customer_mobile) : t.customer_mobile,
        branch: t.branch_name,
        services: counted.map((i) => i.service_name).join(', '),
        staff: [...new Set(counted.map((i) => i.staff_name))].join(', '),
        status: t.status,
        offer: t.offer_title || '',
        total: round2(staffId ? counted.reduce((sum, i) => sum + Number(i.price) * f.factor, 0) : f.total),
        paid: revenue,
        finished: timeOf(t.finished_at),
      });
    }

    const report = {
      kind: 'owner',
      business: salon ? salon.name : '',
      currency: salon ? salon.currency : '₹',
      range: r,
      filters: { branchId, staffId, status },
      options: { branches, staff, statuses: TOKEN_STATUSES },
      summary: {
        ...s,
        revenue: round2(s.revenue),
        discount: round2(s.discount),
        customers: customers.size,
        avgWaitMin: avg(waits),
        avgServiceMin: avg(serviceTimes),
        avgTicket: s.done ? round2(s.revenue / s.done) : 0,
      },
      byDay: [...days.values()],
      byStaff: [...byStaff.values()]
        .map(({ times, ...x }) => ({ ...x, avgServiceMin: avg(times) }))
        .sort((a, b) => b.revenue - a.revenue || b.services - a.services),
      byService: [...byService.values()]
        .filter((x) => x.count)
        .sort((a, b) => b.revenue - a.revenue || b.count - a.count),
      byBranch: [...byBranch.values()].sort((a, b) => b.revenue - a.revenue),
      byHour: hours.filter((h) => h.tokens),
      rows: rows.slice(-ROW_LIMIT).reverse(),
      rowCount: rows.length,
    };
    if (query.export) {
      report.csv = toCsv(
        [
          'Date',
          'Time',
          'Token',
          'Customer',
          'Mobile',
          'Branch',
          'Services',
          'Staff',
          'Status',
          'Offer',
          'Total',
          'Paid (completed)',
          'Finished',
        ],
        rows.map((x) => [
          x.date,
          x.time,
          x.token,
          x.customer,
          x.mobile,
          x.branch,
          x.services,
          x.staff,
          x.status,
          x.offer,
          x.total,
          x.paid,
          x.finished,
        ]),
      );
      report.fileName = `report-${r.from}-to-${r.to}.csv`;
    }
    return report;
  }

  /* ---------- one staff member ---------- */

  async function staff(staffId, salonId, query) {
    const r = range(query);
    const status = ['waiting', 'in_progress', 'done', 'missed'].includes(query.status) ? query.status : '';
    const list = await loadTokens(
      `t.salon_id = $1 AND t.token_date BETWEEN $2 AND $3
       AND EXISTS (SELECT 1 FROM token_items x WHERE x.token_id = t.id AND x.staff_id = $4)`,
      [salonId, r.from, r.to, staffId],
    );
    const {
      rows: [me],
    } = await db.query('SELECT s.name, sa.currency FROM staff s JOIN salons sa ON sa.id = s.salon_id WHERE s.id = $1', [
      staffId,
    ]);

    const days = new Map(eachDay(r.from, r.to).map((d) => [d, { date: d, services: 0, revenue: 0 }]));
    const byService = new Map();
    const customers = new Set();
    const times = [];
    const s = { services: 0, done: 0, missed: 0, open: 0, revenue: 0 };
    const rows = [];

    for (const t of list) {
      const f = tokenFacts(t, staffId);
      for (const i of f.mine) {
        if (status && i.status !== status) continue;
        const earned = i.status === 'done' ? round2(Number(i.price) * f.factor) : 0;
        s.services += 1;
        if (i.status === 'done') s.done += 1;
        else if (i.status === 'missed') s.missed += 1;
        else s.open += 1;
        s.revenue += earned;
        customers.add(t.customer_mobile);
        const m = minutes(i.started_at, i.ended_at);
        if (i.status === 'done' && m !== null && m >= 0) times.push(m);

        const day = days.get(t.token_date);
        if (day && i.status === 'done') {
          day.services += 1;
          day.revenue = round2(day.revenue + earned);
        }
        const sv = byService.get(i.service_id || i.service_name) || { name: i.service_name, count: 0, revenue: 0 };
        if (i.status === 'done') {
          sv.count += 1;
          sv.revenue = round2(sv.revenue + earned);
        }
        byService.set(i.service_id || i.service_name, sv);

        rows.push({
          id: t.id,
          date: t.token_date,
          token: tokenNo(t),
          customer: t.customer_name,
          branch: t.branch_name,
          service: i.service_name,
          status: i.status,
          started: timeOf(i.started_at),
          ended: timeOf(i.ended_at),
          minutes: m !== null && m >= 0 ? Math.round(m) : '',
          price: Number(i.price),
          earned,
        });
      }
    }

    const report = {
      kind: 'staff',
      staff: me ? me.name : '',
      currency: me ? me.currency : '₹',
      range: r,
      filters: { status },
      options: { statuses: ['waiting', 'in_progress', 'done', 'missed'] },
      summary: { ...s, revenue: round2(s.revenue), customers: customers.size, avgServiceMin: avg(times) },
      byDay: [...days.values()],
      byService: [...byService.values()].filter((x) => x.count).sort((a, b) => b.count - a.count),
      rows: rows.slice(-ROW_LIMIT).reverse(),
      rowCount: rows.length,
    };
    if (query.export) {
      report.csv = toCsv(
        [
          'Date',
          'Token',
          'Customer',
          'Branch',
          'Service',
          'Status',
          'Started',
          'Ended',
          'Minutes',
          'Price',
          'Earned (completed)',
        ],
        rows.map((x) => [
          x.date,
          x.token,
          x.customer,
          x.branch,
          x.service,
          x.status,
          x.started,
          x.ended,
          x.minutes,
          x.price,
          x.earned,
        ]),
      );
      report.fileName = `my-report-${r.from}-to-${r.to}.csv`;
    }
    return report;
  }

  /* ---------- platform (super admin and team) ---------- */

  async function admin(query, { showMoney }) {
    const r = range(query);
    const categoryId = v.text(query.categoryId, 40);
    const status = ['active', 'expired', 'disabled'].includes(query.status) ? query.status : '';
    const date = today();

    const params = [r.from, r.to];
    const where = [];
    if (categoryId === 'none') where.push('s.category_id IS NULL');
    else if (categoryId) where.push(`s.category_id = $${params.push(categoryId)}`);

    const [{ rows: salons }, { rows: daily }, { rows: categories }] = await Promise.all([
      db.query(
        `SELECT s.id, s.name, s.plan_name, s.plan_amount, s.currency, s.is_active, s.created_at,
                s.expires_on::text AS expires_on, s.owner_name, s.owner_mobile, c.name AS category,
                COUNT(t.id)::int AS tokens,
                COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done,
                COUNT(t.id) FILTER (WHERE t.status = 'cancelled')::int AS cancelled,
                COUNT(DISTINCT t.customer_mobile)::int AS customers,
                (SELECT count(*) FROM branches b WHERE b.salon_id = s.id)::int AS branches,
                (SELECT count(*) FROM staff st WHERE st.salon_id = s.id)::int AS staff
           FROM salons s
           LEFT JOIN business_categories c ON c.id = s.category_id
           LEFT JOIN tokens t ON t.salon_id = s.id AND t.token_date BETWEEN $1 AND $2
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          GROUP BY s.id, c.name
          ORDER BY tokens DESC, s.name`,
        params,
      ),
      db.query(
        `SELECT t.token_date::text AS date, t.salon_id, COUNT(*)::int AS tokens,
                COUNT(*) FILTER (WHERE t.status = 'done')::int AS done
           FROM tokens t WHERE t.token_date BETWEEN $1 AND $2
          GROUP BY t.token_date, t.salon_id`,
        [r.from, r.to],
      ),
      db.query('SELECT id, name FROM business_categories ORDER BY name'),
    ]);

    const stateOf = (s) => (!s.is_active ? 'disabled' : s.expires_on && s.expires_on < date ? 'expired' : 'active');
    const picked = salons.filter((s) => !status || stateOf(s) === status);
    const ids = new Set(picked.map((s) => s.id));
    const days = new Map(eachDay(r.from, r.to).map((d) => [d, { date: d, tokens: 0, done: 0, newBusinesses: 0 }]));
    for (const d of daily) {
      if (!ids.has(d.salon_id)) continue;
      const day = days.get(d.date);
      if (day) {
        day.tokens += d.tokens;
        day.done += d.done;
      }
    }
    const isoDay = (ts) => {
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    for (const s of picked) {
      const day = days.get(isoDay(s.created_at));
      if (day) day.newBusinesses += 1;
    }

    const byCategory = new Map();
    for (const s of picked) {
      const key = s.category || 'General';
      const c = byCategory.get(key) || { name: key, businesses: 0, tokens: 0, revenue: 0 };
      c.businesses += 1;
      c.tokens += s.tokens;
      c.revenue = round2(c.revenue + Number(s.plan_amount));
      byCategory.set(key, c);
    }

    const rows = picked.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category || 'General',
      status: stateOf(s),
      owner: s.owner_name,
      mobile: s.owner_mobile,
      plan: s.plan_name,
      amount: showMoney ? Number(s.plan_amount) : null,
      expires: s.expires_on || '',
      joined: isoDay(s.created_at),
      branches: s.branches,
      staff: s.staff,
      tokens: s.tokens,
      done: s.done,
      cancelled: s.cancelled,
      customers: s.customers,
    }));

    const report = {
      kind: 'admin',
      range: r,
      filters: { categoryId, status },
      options: { categories, statuses: ['active', 'expired', 'disabled'] },
      summary: {
        businesses: rows.length,
        active: rows.filter((x) => x.status === 'active').length,
        expired: rows.filter((x) => x.status === 'expired').length,
        disabled: rows.filter((x) => x.status === 'disabled').length,
        newBusinesses: rows.filter((x) => x.joined >= r.from && x.joined <= r.to).length,
        tokens: rows.reduce((n, x) => n + x.tokens, 0),
        done: rows.reduce((n, x) => n + x.done, 0),
        customers: rows.reduce((n, x) => n + x.customers, 0),
        revenue: showMoney ? round2(rows.reduce((n, x) => n + x.amount, 0)) : null,
      },
      byDay: [...days.values()],
      byCategory: [...byCategory.values()]
        .map((c) => ({ ...c, revenue: showMoney ? c.revenue : null }))
        .sort((a, b) => b.businesses - a.businesses),
      rows,
      rowCount: rows.length,
    };
    if (query.export) {
      const header = ['Business', 'Category', 'Status', 'Owner', 'Owner mobile', 'Plan'];
      if (showMoney) header.push('Plan amount');
      header.push('Expires', 'Joined', 'Branches', 'Staff', 'Tokens', 'Completed', 'Cancelled', 'Customers');
      report.csv = toCsv(
        header,
        rows.map((x) => {
          const line = [x.name, x.category, x.status, x.owner, x.mobile, x.plan];
          if (showMoney) line.push(x.amount);
          line.push(x.expires, x.joined, x.branches, x.staff, x.tokens, x.done, x.cancelled, x.customers);
          return line;
        }),
      );
      report.fileName = `businesses-report-${r.from}-to-${r.to}.csv`;
    }
    return report;
  }

  return { owner, staff, admin };
}

module.exports = { createReportService, range };
