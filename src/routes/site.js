'use strict';

/**
 * The BQuee home page content (public read, super admin edit) and self sign-up
 * for new businesses. Sign-up only ever creates a business owner.
 */

const v = require('../utils/validate');
const { badRequest, forbidden, notFound } = require('../http/errors');
const { newId } = require('../utils/ids');
const { today } = require('../utils/time');
const { hashPassword, validatePassword } = require('../services/auth');
const { assertLoginAvailable } = require('../services/accounts');
const { createSiteService, FEATURE_ICONS } = require('../services/site');
const fx = require('../services/fx');
const legal = require('../content/legal');
const crypto = require('crypto');
const { parseCookies } = require('../http/cookies');

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = function siteRoutes(router, { db, auth, limiter, oauth }) {
  const site = createSiteService(db);
  const superAdmin = (req) => auth.requireUser(req, 'superadmin');

  const categories = async () =>
    (await db.query('SELECT id, name, icon, color FROM business_categories ORDER BY name')).rows;

  router.get('/api/public/site', async ({ query }) => {
    const content = await site.get();
    const { signup, plans, rates: oldRates, currencies: onSale, ...rest } = content;
    // Each package's price in every currency on sale (fixed prices, else US$ with the super admin's
    // rates). The page / app send the device's time zone and region; the answer says which currency
    // that is (US$ when it isn't on sale) – the visitor can still pick another.
    const active = fx.activeCurrencies(content);
    return {
      ...rest,
      plans: plans.map((p) => ({ ...p, prices: fx.pricesFor(p, active) })),
      currencies: active.map(({ code, name, countries }) => ({ code, name, countries })),
      defaultCurrency: fx.DEFAULT_CODE,
      currencyHint: fx.currencyHint({ tz: query.tz, region: query.region }, active),
      // Which "Continue with …" buttons to show (only providers set up on the server).
      social: oauth ? oauth.enabled() : { google: false, apple: false },
      signup: { enabled: signup.enabled, approval: signup.mode === 'approval', trialDays: signup.trialDays },
      categories: await categories(),
    };
  });

  /** Terms and Privacy for the apps, which show them as their own screens (same text as /terms and /privacy). */
  router.get('/api/public/legal/:doc', async ({ params }) => {
    const doc = { terms: legal.terms, privacy: legal.privacy }[params.doc];
    if (!doc) throw notFound('Page not found');
    const { title, updated, intro, sections } = doc;
    return { title, updated, intro, sections, contact: legal.CONTACT };
  });

  router.get('/api/admin/site', async ({ req }) => {
    await superAdmin(req);
    return { content: await site.get(), icons: FEATURE_ICONS, categories: await categories() };
  });

  router.put('/api/admin/site', async ({ req, body }) => {
    await superAdmin(req);
    return { content: await site.save(body) };
  });

  router.delete('/api/admin/site', async ({ req }) => {
    await superAdmin(req);
    return { content: await site.reset() };
  });

  async function uniqueSlug(base) {
    const root = v.slugify(base) || 'business';
    for (let n = 1; ; n += 1) {
      const slug = n === 1 ? root : `${root}-${n}`;
      const { rows } = await db.query('SELECT 1 FROM salons WHERE slug = $1', [slug]);
      if (!rows.length) return slug;
    }
  }

  /** A free username made from an email ("sana.k@gmail.com" → "sana.k", or "sana.k2" when taken). */
  async function freeUsername(email) {
    const root =
      (String(email).split('@')[0] || 'owner')
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 30) || 'owner';
    for (let n = 1; ; n += 1) {
      const name = n === 1 ? root : `${root}${n}`;
      const { rows } = await db.query('SELECT 1 FROM users WHERE username = $1 OR email = $1', [name]);
      if (!rows.length) return name;
    }
  }

  const REF_QUERY = `
    SELECT l.id, l.label, u.id AS user_id, u.name FROM referral_links l JOIN users u ON u.id = l.user_id
     WHERE l.code = $1 AND l.is_active AND u.role IN ('superadmin', 'platform_staff') AND u.is_active IS NOT FALSE`;

  /** Who a referral code belongs to (shown as "Invited by …" on the sign-up form). */
  router.get('/api/public/referral/:code', async ({ params }) => {
    const { rows } = await db.query(REF_QUERY, [v.text(params.code, 20).toLowerCase()]);
    if (!rows[0]) throw notFound('This referral link is no longer valid');
    return { name: rows[0].name };
  });

  /** A new business signs itself up. Always creates a business owner – never staff or admins. */
  router.post('/api/public/signup', async ({ req, res, body, ip }) => {
    await limiter.check('signup', ip, 20, 60 * 60_000);
    const { signup } = await site.get();
    if (!signup.enabled) throw forbidden('Sign-up is closed right now. Please contact us to get started.');
    if (v.text(body.website, 200)) throw forbidden('Sign-up failed'); // hidden field only bots fill in

    // Signing up with Google/Apple: the verified email comes from them, so there is no username or
    // password to choose (the owner signs in with Google/Apple; a password can be set later).
    let social = null;
    if (body.social && oauth) {
      const binding = body.verifier ? oauth.pkce(body.verifier) : parseCookies(req).bq_oauth;
      social = await oauth.ticket(body.social, binding);
      if (social.kind !== 'signup')
        throw badRequest('This Google/Apple account already has a BQuee account – sign in instead.');
    }

    const name = v.required(v.text(body.businessName, 80), 'Business name');
    const ownerName = v.required(v.text(body.ownerName, 80), 'Your name');
    const mobile = v.mobile(body.mobile);
    const email = social ? social.email : v.email(body.email);
    const username = social ? await freeUsername(social.email) : v.required(v.username(body.username), 'Username');
    const password = social ? crypto.randomBytes(24).toString('base64url') : validatePassword(body.password);
    const categoryId = v.text(body.categoryId, 40) || null;
    if (categoryId) {
      const { rows } = await db.query('SELECT 1 FROM business_categories WHERE id = $1', [categoryId]);
      if (!rows.length) throw forbidden('That business type no longer exists. Please pick another.');
    }
    await assertLoginAvailable(db, username);
    await assertLoginAvailable(db, email);

    // Signed up through a team member's referral link / code?
    const refCode = v.text(body.ref, 20).toLowerCase();
    let referrer = null;
    if (refCode) {
      const { rows } = await db.query(REF_QUERY, [refCode]);
      referrer = rows[0] || null;
    }
    const channel = body.channel === 'app' ? 'app' : 'web';

    // When the home page shows pricing, the business picks one of those packages.
    const content = await site.get();
    let pkg = null;
    if (content.sections.plans && content.plans.length) {
      pkg = content.plans.find((p) => p.name === v.text(body.package, 60));
      if (!pkg) throw badRequest('Choose a package');
    }
    const planName = pkg ? pkg.name : signup.planName;
    // The price in the currency the owner saw (their country's), worked out again here – never taken
    // from the browser. The business then uses that currency for its own prices too.
    const active = fx.activeCurrencies(content);
    const onSale = (c) => active.some((x) => x.code === c);
    const asked = String(body.currency || '').toUpperCase();
    const code = onSale(asked) ? asked : pkg && onSale(fx.baseCode(pkg)) ? fx.baseCode(pkg) : 'USD';
    const planAmount = pkg ? fx.amountFor(pkg, code, fx.ratesOf(active)) : 0;
    const currencySymbol = fx.BY_CODE[code].symbol.trim();

    const approval = signup.mode === 'approval';
    const salonId = newId(5);
    const slug = await uniqueSlug(name);
    const passwordHash = await hashPassword(password);
    const ownerId = newId(8);
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO salons (id, slug, name, owner_name, owner_mobile, owner_email, plan_name, plan_amount,
                             expires_on, is_active, currency, category_id, self_signup, service_mode, staff_mode,
                             onboarded_by, onboarded_by_name, onboard_source, onboard_channel,
                             referral_link_id, referral_label, signup_package)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $20, $8, $9, $21, $10, true, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          salonId,
          slug,
          name,
          ownerName,
          mobile,
          email || '',
          planName,
          approval ? null : addDays(today(), signup.trialDays),
          !approval,
          categoryId,
          body.serviceMode === 'single' ? 'single' : 'multiple',
          body.staffMode === 'single' ? 'single' : 'multiple',
          referrer ? referrer.user_id : null,
          referrer ? referrer.name : '',
          referrer ? 'referral' : 'signup',
          channel,
          referrer ? referrer.id : null,
          referrer ? referrer.label : '',
          pkg ? pkg.name : '',
          planAmount,
          currencySymbol,
        ],
      );
      await tx.query(
        `INSERT INTO users (id, role, username, email, name, password_hash, salon_id) VALUES ($1, 'owner', $2, $3, $4, $5, $6)`,
        [ownerId, username, email || null, ownerName, passwordHash, salonId],
      );
      await tx.query('INSERT INTO branches (id, salon_id, name) VALUES ($1, $2, $3)', [
        newId(5),
        salonId,
        v.text(body.branchName, 80) || 'Main Branch',
      ]);
    });

    if (social) {
      await oauth.ticket(body.social, body.verifier ? oauth.pkce(body.verifier) : parseCookies(req).bq_oauth, {
        use: true,
      });
      await oauth.link(social, ownerId);
    }
    if (approval) return { pending: true, business: name };
    const session = social
      ? await auth.loginLinked(ownerId, req, res)
      : await auth.login(username, password, null, req, res);
    return { ...session, business: name, trialDays: signup.trialDays };
  });
};
