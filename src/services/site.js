'use strict';

/**
 * Content of the BQuee home (landing) page, edited by the super admin.
 * Stored as one JSON document; anything not saved yet falls back to DEFAULTS,
 * so the page always looks complete.
 */

const v = require('../utils/validate');
const { badRequest } = require('../http/errors');

const DEFAULTS = {
  // What Google and link previews show (the <title> and description of the home page).
  seo: {
    title: 'Digital Token & Queue System for Salons & Clinics | BQuee',
    description:
      'Replace paper tokens and token machines with QR tokens and live waiting times. Queue management for salons, clinics and walk-ins in UAE, GCC, India and Europe.',
  },
  hero: {
    badge: 'Replace paper tokens and token machines',
    title: 'Digital token & queue system',
    highlight: 'for salons, clinics and walk-ins',
    text: 'Customers scan your QR code, choose services and a staff member, and get a numbered token with a live waiting time on their phone – no app, no token machine, no paper. Staff scan the token to start and finish each service.',
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
  // "Replace paper tokens and token machines": the everyday problem and how BQuee solves it.
  replace: [
    {
      problem: 'Paper token rolls run out and the token printer jams',
      solution: 'The token is on the customer’s phone – no paper, no printer, nothing to refill or repair.',
    },
    {
      problem: 'Token machines and display screens are costly to buy and maintain',
      solution: 'Print one QR poster. Any phone or browser becomes your token counter and your queue display.',
    },
    {
      problem: 'Customers crowd the reception asking “how long?”',
      solution: 'Every customer sees their token number, how many are ahead and a live waiting time.',
    },
    {
      problem: 'People walk away when the queue looks long',
      solution: 'Customers book at the door, wait anywhere – a café, their car, home – and come back on time.',
    },
    {
      problem: 'Staff call out names and lose track of who is next',
      solution: 'Staff scan the token to start and finish. The queue moves on its own, stylist by stylist.',
    },
    {
      problem: 'No idea of busy hours, revenue or staff performance',
      solution: 'Reports by day, service, staff and branch – export to Excel in one tap.',
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
  categoriesText:
    'Salons, barbershops, beauty parlours, spas, clinics, hospital OPDs, labs, service centres, repair shops and offices – anywhere people wait their turn.',
  // Where BQuee is used: region + its main cities (comma-separated).
  locations: [
    {
      region: 'United Arab Emirates',
      places: 'Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain, Al Ain',
    },
    { region: 'Saudi Arabia', places: 'Riyadh, Jeddah, Dammam, Al Khobar, Makkah, Madinah' },
    { region: 'Qatar', places: 'Doha, Al Wakrah, Al Khor, Lusail' },
    { region: 'Kuwait', places: 'Kuwait City, Hawalli, Salmiya, Farwaniya' },
    { region: 'Bahrain', places: 'Manama, Muharraq, Riffa' },
    { region: 'Oman', places: 'Muscat, Salalah, Sohar, Nizwa' },
    {
      region: 'Kerala',
      places:
        'Kochi, Thiruvananthapuram, Kozhikode, Thrissur, Kannur, Kollam, Kottayam, Malappuram, Palakkad, Alappuzha',
    },
    { region: 'India', places: 'Bengaluru, Chennai, Mumbai, Delhi, Hyderabad, Pune, Coimbatore, Mangaluru' },
    { region: 'Europe', places: 'London, Manchester, Birmingham, Dublin, Paris, Berlin, Amsterdam, Madrid' },
  ],
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
      q: 'What is a digital token system?',
      a: 'It gives every customer a numbered token on their phone instead of a paper slip from a token machine. With BQuee the customer scans your QR code, gets a token and sees a live waiting time, and your staff scan the token to start and finish the service.',
    },
    {
      q: 'Can BQuee replace our paper tokens or token machine?',
      a: 'Yes. You don’t need a token dispenser, thermal printer, paper rolls or a token display screen. Print the QR poster for your branch – customers take their token by scanning it, and any phone, tablet or computer shows the queue.',
    },
    {
      q: 'Do my customers need to install an app?',
      a: 'No. Customers scan your QR code and book in their browser. The app is for owners and staff.',
    },
    {
      q: 'Is BQuee a queue management system for salons and barbershops?',
      a: 'Yes – it was made for salons. Every stylist has their own queue, customers can choose a stylist or “no preference”, and the waiting time counts each service they booked.',
    },
    {
      q: 'Does it work for clinics, hospitals and service centres?',
      a: 'Yes. Clinics, hospital OPDs, labs, repair and service centres use the same QR token: patients and customers see their place in the queue and wait comfortably instead of crowding the counter.',
    },
    {
      q: 'Can I use BQuee in the UAE, Saudi Arabia, Qatar and the rest of the GCC?',
      a: 'Yes. BQuee runs in any phone browser, so businesses in Dubai, Abu Dhabi, Sharjah, Riyadh, Jeddah, Doha, Kuwait City, Manama and Muscat can start the same day – there is nothing to install.',
    },
    {
      q: 'Can businesses in Kerala, the rest of India and Europe use it?',
      a: 'Yes. Salons and clinics in Kochi, Thiruvananthapuram, Kozhikode, Thrissur, Bengaluru, Chennai, London, Dublin and anywhere else can sign up online and take their first token booking in minutes.',
    },
    {
      q: 'How do I stop crowding and long queues in my waiting area?',
      a: 'Give every customer a token with a live waiting time. They can wait outside, shop nearby or come back just in time, so your waiting area stays calm and fewer people walk away.',
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
    replace: true,
    locations: true,
    faqs: true,
    contact: true,
    tokenCheck: true,
  },
  signup: { enabled: true, mode: 'trial', trialDays: 14, planName: 'Free trial' },
};

/**
 * Built-in text of earlier versions. Saved content that still equals it word for word was never
 * changed by the super admin, so it is upgraded to the current built-in text (the SEO wording);
 * anything the super admin wrote is kept.
 */
const OLD_DEFAULTS = {
  heroTitles: ['Walk-ins,'],
  categoriesText: ['Salons, spas, clinics, service centres, offices – anywhere people wait their turn.'],
  faqQuestions: [
    [
      'Do my customers need to install an app?',
      'Can I use it for more than one branch?',
      'How does the waiting time work?',
      'Can I export my data?',
    ],
  ],
};

function upgradeUntouched(stored) {
  const s = { ...(stored || {}) };
  if (s.hero && OLD_DEFAULTS.heroTitles.includes(s.hero.title)) delete s.hero;
  if (OLD_DEFAULTS.categoriesText.includes(s.categoriesText)) delete s.categoriesText;
  if (
    Array.isArray(s.faqs) &&
    OLD_DEFAULTS.faqQuestions.some(
      (qs) => qs.length === s.faqs.length && qs.every((q, i) => s.faqs[i] && s.faqs[i].q === q),
    )
  )
    delete s.faqs;
  return s;
}

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
  for (const [k, val] of Object.entries(upgradeUntouched(stored))) {
    if (!(k in out)) continue;
    if (Array.isArray(out[k])) out[k] = Array.isArray(val) ? val : out[k];
    else if (k === 'seo') {
      // An empty title or description falls back to the default, so Google always gets one.
      for (const [f, x] of Object.entries(val || {})) if (x && f in out.seo) out.seo[f] = x;
    } else if (out[k] && typeof out[k] === 'object')
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
  const out = {
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
  // Added later: saved only when the editor sends them, so older editors never wipe the defaults.
  if (b.seo) {
    out.seo = { title: t(b.seo.title, 70), description: t(b.seo.description, 170) };
  }
  if (Array.isArray(b.replace)) {
    out.replace = list(b.replace, 10, (r) =>
      t(r && r.problem, 120) ? { problem: t(r.problem, 120), solution: t(r.solution, 240) } : null,
    );
  }
  if (Array.isArray(b.locations)) {
    out.locations = list(b.locations, 20, (l) =>
      t(l && l.region, 60) ? { region: t(l.region, 60), places: t(l.places, 300) } : null,
    );
  }
  return out;
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

module.exports = { createSiteService, FEATURE_ICONS, clean, merge };
