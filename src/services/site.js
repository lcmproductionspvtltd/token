'use strict';

/**
 * Content of the BQuee home (landing) page, edited by the super admin.
 * Stored as one JSON document; anything not saved yet falls back to DEFAULTS,
 * so the page always looks complete.
 */

const v = require('../utils/validate');
const { badRequest } = require('../http/errors');

const DEFAULTS = {
  hero: {
    badge: 'QR token booking for every business',
    title: 'Walk-ins,',
    highlight: 'without the waiting room.',
    text: 'Customers scan your QR code, pick services and a staff member, and get a numbered token with a live waiting time. Your staff scan the token to start and finish each service.',
    primary: 'Start free',
    secondary: 'Sign in',
  },
  stats: [
    { value: '2 min', label: 'to set up a branch' },
    { value: 'Live', label: 'waiting time for every customer' },
    { value: '0', label: 'paper tokens or queues' },
    { value: '24×7', label: 'online booking' },
  ],
  features: [
    {
      icon: 'qr',
      title: 'A QR code for every branch',
      text: 'Print a poster with your logo. Customers scan it to open your branch page and book in seconds.',
    },
    {
      icon: 'clock',
      title: 'Live waiting time',
      text: 'Every staff member has their own queue, so each customer sees an honest, live estimate.',
    },
    {
      icon: 'camera',
      title: 'Scan to start and finish',
      text: 'Staff scan the customer’s token to start and finish each service. No paperwork, no shouting names.',
    },
    {
      icon: 'users',
      title: 'Staff and branches',
      text: 'Add branches and staff, link who does which service, and switch people online or offline.',
    },
    {
      icon: 'gift',
      title: 'Offers and reviews',
      text: 'Show discounts and genuine reviews on your page. Customers book straight from an offer.',
    },
    {
      icon: 'chart',
      title: 'Reports and export',
      text: 'Revenue, services, staff and busy hours for any date range – export to Excel in one tap.',
    },
  ],
  steps: [
    {
      title: 'Sign up your business',
      text: 'Create your account in a minute and add your services, prices and staff.',
    },
    { title: 'Print your QR code', text: 'Download the branch QR poster with your logo and put it at the entrance.' },
    {
      title: 'Customers scan and book',
      text: 'They choose services and a staff member and get a token with a live waiting time.',
    },
    {
      title: 'Staff scan and serve',
      text: 'Staff scan tokens to start and finish – the queue updates for everyone instantly.',
    },
  ],
  categoriesTitle: 'Made for every kind of business',
  categoriesText: 'Salons, spas, clinics, service centres, offices – anywhere people wait their turn.',
  app: {
    title: 'Run your queue from your phone',
    text: 'The BQuee app for business owners and staff: live queue, scanning, reports and settings – on Android and iPhone.',
    playUrl: '',
    appStoreUrl: '',
  },
  plans: [
    {
      name: 'Starter',
      price: 'Free',
      period: '14-day trial',
      features: 'One branch\nUp to 3 staff\nQR booking and live queue',
      highlight: false,
    },
    {
      name: 'Business',
      price: '₹999',
      period: 'per month',
      features: 'Up to 3 branches\nUnlimited staff\nOffers, reviews and reports\nMobile app',
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: 'Talk to us',
      period: 'custom',
      features: 'Unlimited branches\nPriority support\nHelp with setup',
      highlight: false,
    },
  ],
  testimonials: [
    {
      name: 'Meera N.',
      role: 'Salon owner',
      text: 'Our waiting area is calm now. Customers come back exactly when it is their turn.',
      rating: 5,
    },
    {
      name: 'Dr. Arun K.',
      role: 'Clinic',
      text: 'Patients love seeing the live waiting time on their phone. Setup took one evening.',
      rating: 5,
    },
    {
      name: 'Fathima R.',
      role: 'Spa manager',
      text: 'The staff app makes start and finish a single scan. The daily report saves me an hour.',
      rating: 4,
    },
  ],
  faqs: [
    {
      q: 'Do my customers need to install an app?',
      a: 'No. Customers scan your QR code and book in their browser. The app is for owners and staff.',
    },
    {
      q: 'Can I use it for more than one branch?',
      a: 'Yes. Each branch has its own QR code, booking page, staff and queue.',
    },
    {
      q: 'How does the waiting time work?',
      a: 'Each staff member has a queue. The waiting time adds up the services ahead of the customer and updates live.',
    },
    {
      q: 'Can I export my data?',
      a: 'Yes. Reports can be filtered by date, branch, staff and status and exported as a CSV file for Excel.',
    },
  ],
  cta: { title: 'Ready to end the waiting room?', text: 'Sign up your business and take your first QR booking today.' },
  contact: { email: '', phone: '', whatsapp: '', address: '' },
  footer: { text: 'QR token booking and live queues for businesses of every kind.' },
  sections: {
    stats: true,
    features: true,
    steps: true,
    categories: true,
    app: true,
    plans: true,
    testimonials: true,
    faqs: true,
    contact: true,
    tokenCheck: true,
  },
  signup: { enabled: true, mode: 'trial', trialDays: 14, planName: 'Free trial' },
};

const SECTION_KEYS = Object.keys(DEFAULTS.sections);
const FEATURE_ICONS = [
  'qr',
  'clock',
  'camera',
  'users',
  'gift',
  'chart',
  'star',
  'tag',
  'store',
  'ticket',
  'check',
  'phone',
  'shield',
  'calendar',
  'list',
  'grid',
];

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Stored content on top of the defaults (top level and one level down). */
function merge(stored) {
  const out = clone(DEFAULTS);
  for (const [k, val] of Object.entries(stored || {})) {
    if (!(k in out)) continue;
    if (Array.isArray(out[k])) out[k] = Array.isArray(val) ? val : out[k];
    else if (out[k] && typeof out[k] === 'object')
      out[k] = { ...out[k], ...(val && typeof val === 'object' ? val : {}) };
    else out[k] = val;
  }
  return out;
}

const t = (x, max) => v.text(x, max);
function link(x, label) {
  const s = t(x, 300);
  if (s && !/^https:\/\/[^\s]+$/i.test(s)) throw badRequest(`${label} must be a full https:// link`);
  return s;
}
function list(x, max, map) {
  if (!Array.isArray(x)) return [];
  return x.slice(0, max).map(map).filter(Boolean);
}

/** Cleans everything the super admin sends before saving. */
function clean(body) {
  const b = body || {};
  const hero = b.hero || {};
  const app = b.app || {};
  const cta = b.cta || {};
  const contact = b.contact || {};
  const signup = b.signup || {};
  const sections = b.sections || {};
  return {
    hero: {
      badge: t(hero.badge, 80),
      title: v.required(t(hero.title, 60), 'Hero title'),
      highlight: t(hero.highlight, 80),
      text: t(hero.text, 400),
      primary: t(hero.primary, 30) || 'Start free',
      secondary: t(hero.secondary, 30) || 'Sign in',
    },
    stats: list(b.stats, 6, (s) => (t(s && s.value, 20) ? { value: t(s.value, 20), label: t(s.label, 60) } : null)),
    features: list(b.features, 12, (f) =>
      t(f && f.title, 60)
        ? { icon: FEATURE_ICONS.includes(f.icon) ? f.icon : 'check', title: t(f.title, 60), text: t(f.text, 240) }
        : null,
    ),
    steps: list(b.steps, 8, (s) => (t(s && s.title, 60) ? { title: t(s.title, 60), text: t(s.text, 240) } : null)),
    categoriesTitle: t(b.categoriesTitle, 80),
    categoriesText: t(b.categoriesText, 240),
    app: {
      title: t(app.title, 80),
      text: t(app.text, 300),
      playUrl: link(app.playUrl, 'Google Play link'),
      appStoreUrl: link(app.appStoreUrl, 'App Store link'),
    },
    plans: list(b.plans, 6, (p) =>
      t(p && p.name, 40)
        ? {
            name: t(p.name, 40),
            price: t(p.price, 30),
            period: t(p.period, 40),
            features: t(p.features, 600),
            highlight: !!p.highlight,
          }
        : null,
    ),
    testimonials: list(b.testimonials, 12, (r) =>
      t(r && r.name, 60) && t(r.text, 400)
        ? { name: t(r.name, 60), role: t(r.role, 60), text: t(r.text, 400), rating: v.integer(r.rating, 1, 5, 5) }
        : null,
    ),
    faqs: list(b.faqs, 20, (f) => (t(f && f.q, 160) ? { q: t(f.q, 160), a: t(f.a, 800) } : null)),
    cta: { title: t(cta.title, 80), text: t(cta.text, 240) },
    contact: {
      email: v.email(contact.email),
      phone: t(contact.phone, 30),
      whatsapp: t(contact.whatsapp, 30).replace(/[^\d+]/g, ''),
      address: t(contact.address, 240),
    },
    footer: { text: t((b.footer || {}).text, 240) },
    sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, sections[k] !== false])),
    signup: {
      enabled: signup.enabled !== false,
      mode: signup.mode === 'approval' ? 'approval' : 'trial',
      trialDays: v.integer(signup.trialDays, 1, 365, 14),
      planName: t(signup.planName, 40) || 'Free trial',
    },
  };
}

function createSiteService(db) {
  async function get() {
    const { rows } = await db.query("SELECT data, updated_at FROM site_content WHERE key = 'landing'");
    const content = merge(rows[0] && rows[0].data);
    content.updatedAt = rows[0] ? new Date(rows[0].updated_at).getTime() : 0;
    return content;
  }

  async function save(body) {
    const data = clean(body);
    await db.query(
      `INSERT INTO site_content (key, data, updated_at) VALUES ('landing', $1, now())
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [JSON.stringify(data)],
    );
    return get();
  }

  async function reset() {
    await db.query("DELETE FROM site_content WHERE key = 'landing'");
    return get();
  }

  return { get, save, reset };
}

module.exports = { createSiteService, FEATURE_ICONS, clean };
