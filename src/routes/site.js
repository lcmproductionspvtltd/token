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

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = function siteRoutes(router, { db, auth, limiter }) {
  const site = createSiteService(db);
  const superAdmin = (req) => auth.requireUser(req, 'superadmin');

  const categories = async () =>
    (await db.query('SELECT id, name, icon, color FROM business_categories ORDER BY name')).rows;

  router.get('/api/public/site', async () => {
    const content = await site.get();
    const { signup, ...rest } = content;
    return {
      ...rest,
      signup: { enabled: signup.enabled, approval: signup.mode === 'approval', trialDays: signup.trialDays },
      categories: await categories(),
    };
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

    const name = v.required(v.text(body.businessName, 80), 'Business name');
    const ownerName = v.required(v.text(body.ownerName, 80), 'Your name');
    const mobile = v.mobile(body.mobile);
    const email = v.email(body.email);
    const username = v.required(v.username(body.username), 'Username');
    const password = validatePassword(body.password);
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
    const planAmount = pkg ? Number(String(pkg.price).replace(/[^0-9.]/g, '')) || 0 : 0;

    const approval = signup.mode === 'approval';
    const salonId = newId(5);
    const slug = await uniqueSlug(name);
    const passwordHash = await hashPassword(password);
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO salons (id, slug, name, owner_name, owner_mobile, owner_email, plan_name, plan_amount,
                             expires_on, is_active, currency, category_id, self_signup, service_mode, staff_mode,
                             onboarded_by, onboarded_by_name, onboard_source, onboard_channel,
                             referral_link_id, referral_label, signup_package)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $20, $8, $9, '₹', $10, true, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
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
        ],
      );
      await tx.query(
        `INSERT INTO users (id, role, username, email, name, password_hash, salon_id) VALUES ($1, 'owner', $2, $3, $4, $5, $6)`,
        [newId(8), username, email || null, ownerName, passwordHash, salonId],
      );
      await tx.query('INSERT INTO branches (id, salon_id, name) VALUES ($1, $2, $3)', [
        newId(5),
        salonId,
        v.text(body.branchName, 80) || 'Main Branch',
      ]);
    });

    if (approval) return { pending: true, business: name };
    // Owners use two-step sign-in, so a new owner goes straight to setting it up.
    const session = await auth.login(username, password, null, req, res);
    return { ...session, business: name, trialDays: signup.trialDays };
  });
};
