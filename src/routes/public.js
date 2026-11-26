'use strict';

/** Customer pages – no sign-in. A branch QR code opens /b/:branch (its name link, or its id on older posters). */

const v = require('../utils/validate');
const { badRequest, notFound } = require('../http/errors');
const { today } = require('../utils/time');
const queue = require('../services/queue');
const serialize = require('../services/serializers');
const { featuresOf } = require('../services/features');
const { createSiteService } = require('../services/site');

module.exports = function publicRoutes(router, { db, auth, tokens, catalog, limiter }) {
  const site = createSiteService(db);
  const salonIsOpen = (s) => s.is_active && (!s.expires_on || s.expires_on >= today());

  async function findSalon(where, value) {
    const {
      rows: [salon],
    } = await db.query(`SELECT *, expires_on::text AS expires_on FROM salons WHERE ${where}`, [value]);
    return salon || null;
  }

  /** A branch by its id or its name link (/b/lotussalon). The id wins if both could match. */
  async function findBranch(key) {
    const k = String(key || '').slice(0, 80);
    const {
      rows: [branch],
    } = await db.query('SELECT * FROM branches WHERE id = $1 OR slug = lower($1) ORDER BY (id = $1) DESC LIMIT 1', [k]);
    return branch || null;
  }

  const offeredAt = (service, branchId) => !service.branchIds.length || service.branchIds.includes(branchId);
  /** The service as one branch sells it: that branch's own price when it has one. */
  const atBranch = (service, branchId) =>
    service.branchPrices && service.branchPrices[branchId] != null
      ? { ...service, price: service.branchPrices[branchId] }
      : service;

  function appLinksFor(salon, app) {
    if (!featuresOf(salon.features).appButtons || !app || !(app.playUrl || app.appStoreUrl)) return null;
    return { play: app.playUrl || '', appStore: app.appStoreUrl || '' };
  }

  /** Landing page data for one or more branches of a salon. */
  async function landing(salon, branches) {
    const branchIds = branches.map((b) => b.id);
    const [staff, services, offers, testimonials, content] = await Promise.all([
      catalog.staff(salon.id, { activeOnly: true, branchIds }),
      catalog.services(salon.id, { activeOnly: true }),
      catalog.offers(salon.id, { liveOnly: true }),
      catalog.testimonials(salon.id, { activeOnly: true }),
      site.get(),
    ]);
    const open = salonIsOpen(salon);

    const openByBranch = await tokens.openTokensOf(branchIds); // one query for all branches
    const branchCards = [];
    for (const b of branches) {
      const team = staff.filter((s) => s.branchId === b.id);
      const online = team.filter((s) => s.online);
      const openTokens = openByBranch.get(b.id) || [];
      const bookable = open && b.is_active && online.length > 0;
      branchCards.push({
        ...serialize.branch(b),
        staffCount: online.length,
        busyCount: online.filter((s) => queue.staffBusy(s.id, openTokens)).length,
        waiting: openTokens.filter((t) => t.status === 'waiting').length,
        wait: bookable ? Math.ceil(Math.min(...online.map((s) => queue.staffLoad(s.id, openTokens)))) : null,
      });
    }

    return {
      salon: serialize.salonProfile(salon),
      open,
      branches: branchCards,
      services: services
        .filter((svc) =>
          branchIds.some(
            (id) => offeredAt(svc, id) && staff.some((s) => s.branchId === id && s.serviceIds.includes(svc.id)),
          ),
        )
        // One branch: show its own prices. Several branches: the normal price (branchPrices lists the others).
        .map((svc) => (branchIds.length === 1 ? atBranch(svc, branchIds[0]) : svc)),
      offers,
      testimonials,
      team: staff.map(({ id, name, title, photo, branchId }) => ({ id, name, title, photo, branchId })),
      // "Get the BQuee app" buttons: links set by the super admin, unless switched off for this business.
      appLinks: appLinksFor(salon, content.customerApp),
    };
  }

  router.get('/api/public/salon/:slug', async ({ params }) => {
    const salon = (await findSalon('slug = $1', params.slug)) || (await findSalon('id = $1', params.slug));
    if (!salon) throw notFound('Business not found');
    const { rows: branches } = await db.query(
      'SELECT * FROM branches WHERE salon_id = $1 AND is_active ORDER BY created_at',
      [salon.id],
    );
    return landing(salon, branches);
  });

  /** What a branch QR code opens: the landing page for that one branch. */
  router.get('/api/public/landing/:branchId', async ({ params }) => {
    const branch = await findBranch(params.branchId);
    if (!branch) throw notFound('This QR code is no longer valid');
    const salon = await findSalon('id = $1', branch.salon_id);
    return { ...(await landing(salon, [branch])), branchId: branch.id };
  });

  /** Booking form data: services and staff of one branch with live waits. */
  /** Install manifest for one branch, so the installed app carries the salon's name and opens its page. */
  router.get('/api/public/manifest/:id', async ({ params }) => {
    const branch = await findBranch(params.id);
    if (!branch) throw notFound('Branch not found');
    const salon = await findSalon('id = $1', branch.salon_id);
    const color = /^#[0-9a-f]{6}$/i.test(salon.brand_color || '') ? salon.brand_color : '#7b2c9e';
    const name = String(salon.name || 'BQuee');
    const start = '/b/' + (branch.slug || branch.id);
    return {
      id: start,
      name: name + ' – Book a token',
      short_name: name.length > 12 ? name.split(/\s+/)[0].slice(0, 12) : name,
      description: 'Book a token at ' + name + ' and see your waiting time live.',
      start_url: start + '?source=app',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: color,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
  });

  router.get('/api/public/branch/:id', async ({ params }) => {
    const branch = await findBranch(params.id);
    if (!branch) throw notFound('Branch not found');
    const salon = await findSalon('id = $1', branch.salon_id);
    const [services, staff, openTokens, counter, offers] = await Promise.all([
      catalog.services(salon.id, { activeOnly: true }),
      catalog.staff(salon.id, { activeOnly: true, branchIds: [branch.id] }),
      tokens.openTokens(branch.id),
      db.query('SELECT last_number FROM token_counters WHERE branch_id = $1 AND token_date = $2', [branch.id, today()]),
      catalog.offers(salon.id, { liveOnly: true }),
    ]);
    return {
      // Live offers, so a customer who tapped "Book" on an offer can book with it.
      offers,
      // The number the next booking will get (shown in the booking preview; confirmed on booking).
      nextNumber: (counter.rows[0] ? counter.rows[0].last_number : 0) + 1,
      salon: { ...serialize.salonPublic(salon), cover: salon.cover_url },
      branch: serialize.branch(branch),
      open: salonIsOpen(salon) && branch.is_active,
      services: services.filter((svc) => offeredAt(svc, branch.id)).map((svc) => atBranch(svc, branch.id)),
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        title: s.title,
        photo: s.photo,
        serviceIds: s.serviceIds,
        online: s.online,
        busy: queue.staffBusy(s.id, openTokens),
        wait: Math.ceil(queue.staffLoad(s.id, openTokens)),
      })),
    };
  });

  /*
   * Public queue information – token NUMBERS only. No names, phone numbers or services are
   * ever returned here; the full token is only visible to whoever has its private link.
   */
  const label = (t) => (t.prefix ? t.prefix + '-' : '#') + String(t.number).padStart(3, '0');

  // Live board: which numbers are being served and which are waiting (with their estimate).
  router.get('/api/public/branch/:id/queue', async ({ params }) => {
    const branch = await findBranch(params.id);
    if (!branch) throw notFound('Branch not found');
    await tokens.expireStaleTokens();
    const open = await tokens.openTokens(branch.id);
    const waiting = open
      .filter((t) => t.status === 'waiting')
      .map((t) => ({ label: label(t), wait: queue.estimateWait(t, open).wait }));
    return {
      serving: open.filter((t) => t.status === 'serving').map((t) => ({ label: label(t) })),
      // At most 300 numbers are listed; waitingCount is the real total and `more` says how many
      // aren't listed, so the board can show "+ N more" (audit section 5).
      waiting: waiting.slice(0, 300),
      waitingCount: waiting.length,
      more: Math.max(0, waiting.length - 300),
      updatedAt: Date.now(),
    };
  });

  // "Check your token": today's token by its number → status, estimated wait and people ahead.
  router.get('/api/public/branch/:id/lookup', async ({ params, query, ip }) => {
    await limiter.check('lookup', ip, 60, 10 * 60_000);
    const branch = await findBranch(params.id);
    if (!branch) throw notFound('Branch not found');
    const digits = String((query && query.number) || '').replace(/[^0-9]/g, '');
    const number = Number(digits);
    if (!digits || !Number.isInteger(number) || number < 1 || number > 100000)
      throw badRequest('Enter your token number, for example ' + label({ prefix: branch.token_prefix, number: 7 }));
    await tokens.expireStaleTokens();
    const {
      rows: [row],
    } = await db.query(
      // After a reset the same number can exist twice today: the newest one is the customer's.
      'SELECT id, status FROM tokens WHERE branch_id = $1 AND token_date = $2 AND number = $3 ORDER BY cycle DESC LIMIT 1',
      [branch.id, today(), number],
    );
    if (!row) throw notFound(`No token ${label({ prefix: branch.token_prefix, number })} today at this branch`);
    const open = await tokens.openTokens(branch.id);
    const mine = open.find((t) => t.id === row.id);
    const est = mine ? queue.estimateWait(mine, open) : { wait: 0, ahead: 0 };
    return {
      label: label({ prefix: branch.token_prefix, number }),
      status: row.status,
      wait: est.wait,
      ahead: est.ahead,
    };
  });

  router.post('/api/public/book', async ({ body, ip }) => {
    await limiter.check('book', ip, 30, 10 * 60_000);
    const customer = {
      name: v.required(v.text(body.name, 60), 'Name'),
      mobile: v.mobile(body.mobile),
      email: v.email(body.email),
    };
    const items = (Array.isArray(body.items) ? body.items : []).map((i) => ({
      serviceId: v.text(i && i.serviceId, 40),
      staffId: v.text(i && i.staffId, 40),
    }));
    // Against fake bookings: at most 10 bookings an hour per mobile number (any branch), and a few open
    // tokens per number at one branch (tokens.book). No limit per branch: that would let an attacker
    // stop a busy branch's real customers from booking. Owners can cancel all of a number's tokens.
    await limiter.check('book-mobile', customer.mobile.replace(/\D/g, ''), 10, 60 * 60_000);
    const id = await tokens.book({
      branchId: v.text(body.branchId, 40),
      customer,
      items,
      offerId: v.text(body.offerId, 40),
      appointmentAt: body.appointmentAt, // optional: the chosen date and time (checked in tokens.book)
    });
    return { id };
  });

  router.get('/api/public/token/:id', async ({ req, params }) => tokens.view(params.id, await auth.optionalUser(req)));
};
