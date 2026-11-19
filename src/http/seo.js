'use strict';

/**
 * Search engines and link previews (technical SEO).
 *
 * The website is a React app, so the plain index.html has no text. For the pages that should be
 * found on Google, the server fills index.html in before sending it:
 *   /             the BQuee home page: title, description, canonical link, link-preview tags,
 *                 structured data (organisation, software, FAQ) and the page's full text
 *   /s/<slug>     a business page: its own title, description, preview tags and business details
 * Private pages (dashboards, sign-in, tokens) get "noindex"; unknown addresses answer 404.
 * Also serves /robots.txt and /sitemap.xml.
 *
 * The text sent is the same content the page shows (from the home page editor), never extra
 * hidden text. React replaces it with the live page as soon as it loads.
 */

const fs = require('fs');
const path = require('path');
const { createSiteService } = require('../services/site');
const legal = require('../content/legal');
const { pickEncoding, compressQuick, MIN_BYTES } = require('./compress');

/** SPA addresses that exist but must not appear on Google. */
const PRIVATE_PAGES = [
  /^\/(login|signup|admin|owner|staff)\/?$/,
  /^\/s\/[^/]+\/login\/?$/,
  /^\/b\/[^/]+(\/book)?\/?$/,
  /^\/t\/[^/]+\/?$/,
];
/** Terms and Privacy: indexable, with their full text in the HTML. */
const LEGAL_PAGES = { '/terms': legal.terms, '/privacy': legal.privacy };
const BUSINESS_PAGE = /^\/s\/([a-z0-9-]{1,80})\/?$/i;
const CACHE_MS = 10 * 60_000; // the sitemap is rebuilt at most every 10 minutes

const esc = (x) =>
  String(x == null ? '' : x).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
/** JSON inside <script>: "<" escaped so text can never close the tag. */
const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const cut = (s, n) => {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
};

function createSeo({ db, config, headers, log = console }) {
  const site = createSiteService(db);
  const indexFile = path.join(config.publicDir, 'index.html');
  let template = { mtimeMs: 0, html: '' };
  const cache = new Map(); // sitemap: key → { at, html }

  function indexHtml() {
    const stat = fs.statSync(indexFile);
    if (stat.mtimeMs !== template.mtimeMs)
      template = { mtimeMs: stat.mtimeMs, html: fs.readFileSync(indexFile, 'utf8') };
    return template.html;
  }

  /** The site's own address, for canonical links (PUBLIC_URL / Render's address, else this request). */
  function baseUrl(req) {
    if (config.publicUrl) return config.publicUrl;
    const proto =
      config.trustProxy && req.headers['x-forwarded-proto'] === 'https'
        ? 'https'
        : req.socket.encrypted
          ? 'https'
          : 'http';
    return `${proto}://${String(req.headers.host || 'localhost').replace(/[^\w.:-]/g, '')}`;
  }
  const absolute = (base, url) =>
    !url ? '' : /^https?:\/\//i.test(url) ? url : base + (url.startsWith('/') ? '' : '/') + url;

  /** index.html with a new <head> part and, optionally, the page's text inside #root. */
  function fill({ title, description, head, body }) {
    let html = indexHtml()
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
      .replace('</head>', `${head}\n  </head>`);
    if (body) html = html.replace(/<div id="root">[\s\S]*?<\/div>\s*<\/div>/, `<div id="root">${body}</div>`);
    return html;
  }

  function send(req, res, status, html) {
    const out = {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      Vary: 'Accept-Encoding',
    };
    let body = Buffer.from(html);
    const enc = body.length >= MIN_BYTES ? pickEncoding(req.headers['accept-encoding']) : null;
    if (enc) {
      body = compressQuick(body, enc);
      out['Content-Encoding'] = enc;
    }
    res.writeHead(status, out);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function cached(key, make) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.html;
    const html = await make();
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), html });
    return html;
  }

  /* ---------------- the home page ---------------- */

  async function homeContent() {
    const content = await site.get();
    const { rows: categories } = await db.query('SELECT name FROM business_categories ORDER BY name');
    return { ...content, categories };
  }

  function homeBody(c) {
    const on = c.sections || {};
    const h = c.hero || {};
    const signupOpen = c.signup && c.signup.enabled;
    const sec = (id, title, inner, text) =>
      `<section${id ? ` id="${id}"` : ''} class="site-sec"><div class="site-wrap"><h2>${esc(title)}</h2>${
        text ? `<p>${esc(text)}</p>` : ''
      }${inner}</div></section>`;
    const parts = [];
    parts.push(
      `<header class="seo-pre-head site-wrap"><a href="/"><img src="/img/brand/bquee-logo.png" alt="BQuee" width="126" height="30" /></a>` +
        `<nav><a href="#features">Features</a> <a href="#pricing">Pricing</a> <a href="#faq">FAQ</a> <a href="/login">Sign in</a></nav></header>`,
    );
    parts.push(
      `<main><section class="site-hero"><div class="site-wrap site-hero-in">` +
        (h.badge ? `<span class="site-badge">${esc(h.badge)}</span>` : '') +
        `<h1>${esc(h.title)} ${h.highlight ? `<span class="grad-text">${esc(h.highlight)}</span>` : ''}</h1>` +
        (h.text ? `<p class="site-lead">${esc(h.text)}</p>` : '') +
        `<p class="site-cta">${signupOpen ? `<a href="/signup">${esc(h.primary || 'Start free')}</a> ` : ''}<a href="/login">${esc(
          h.secondary || 'Sign in',
        )}</a></p></div></section>`,
    );
    if (on.stats && c.stats.length)
      parts.push(
        `<ul class="seo-pre-stats site-wrap">${c.stats.map((s) => `<li><b>${esc(s.value)}</b> ${esc(s.label)}</li>`).join('')}</ul>`,
      );
    if (on.replace && c.replace && c.replace.length)
      parts.push(
        sec(
          'why',
          'Replace paper tokens and token machines',
          `<ul>${c.replace.map((r) => `<li><p>${esc(r.problem)}</p><p>${esc(r.solution)}</p></li>`).join('')}</ul>`,
          'The everyday problems of paper tokens, token dispensers and crowded waiting rooms – and how BQuee solves each one.',
        ),
      );
    if (on.features && c.features.length)
      parts.push(
        sec(
          'features',
          'Everything your queue needs',
          c.features.map((f) => `<h3>${esc(f.title)}</h3><p>${esc(f.text)}</p>`).join(''),
          'One simple system for customers, staff and owners.',
        ),
      );
    if (on.categories && c.categories.length)
      parts.push(
        sec(
          '',
          c.categoriesTitle || 'Made for every kind of business',
          `<ul>${c.categories.map((x) => `<li>${esc(x.name)}</li>`).join('')}</ul>`,
          c.categoriesText,
        ),
      );
    if (on.steps && c.steps.length)
      parts.push(
        sec(
          'how',
          'Live in an afternoon',
          `<ol>${c.steps.map((s) => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}</ol>`,
          'No hardware and no training – just a QR code and your phone.',
        ),
      );
    if (on.app && c.app && c.app.title) parts.push(sec('', c.app.title, '', c.app.text));
    if (on.locations && c.locations && c.locations.length)
      parts.push(
        sec(
          'locations',
          'Queue management across the UAE, GCC, India and Europe',
          c.locations.map((l) => `<h3>${esc(l.region)}</h3><p>${esc(l.places)}</p>`).join(''),
          'BQuee runs in any phone browser – no token machine, display or installation – so salons, clinics and service centres can start the same day, wherever they are.',
        ),
      );
    if (on.plans && c.plans.length)
      parts.push(
        sec(
          'pricing',
          'Simple pricing',
          c.plans
            .map(
              (p) =>
                `<h3>${esc(p.name)} – ${esc(p.price)}${p.period ? ` ${esc(p.period)}` : ''}</h3><ul>${String(
                  p.features || '',
                )
                  .split('\n')
                  .filter(Boolean)
                  .map((x) => `<li>${esc(x)}</li>`)
                  .join('')}</ul>`,
            )
            .join(''),
        ),
      );
    if (on.testimonials && c.testimonials.length)
      parts.push(
        sec(
          '',
          'What businesses say',
          c.testimonials
            .map(
              (t) =>
                `<blockquote><p>${esc(t.text)}</p><footer>${esc(t.name)}${t.role ? `, ${esc(t.role)}` : ''}</footer></blockquote>`,
            )
            .join(''),
        ),
      );
    if (on.faqs && c.faqs.length)
      parts.push(
        sec('faq', 'Questions and answers', c.faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')),
      );
    const contact = c.contact || {};
    if (on.contact && (contact.email || contact.phone || contact.address))
      parts.push(
        sec(
          'contact',
          'Contact us',
          [
            contact.email && `<p>Email: <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></p>`,
            contact.phone && `<p>Phone: ${esc(contact.phone)}</p>`,
            contact.address && `<p>${esc(contact.address)}</p>`,
          ]
            .filter(Boolean)
            .join(''),
        ),
      );
    if (c.cta && c.cta.title)
      parts.push(sec('', c.cta.title, signupOpen ? '<p><a href="/signup">Start free</a></p>' : '', c.cta.text));
    parts.push('</main>');
    parts.push(
      `<footer class="site-wrap seo-pre-foot"><p>${esc((c.footer && c.footer.text) || '')}</p><p>© BQuee</p></footer>`,
    );
    return `<div class="site seo-pre">${parts.join('')}</div>`;
  }

  /** Structured data: who BQuee is, what it is (software with prices), and the FAQ. */
  function homeData(c, base) {
    const on = c.sections || {};
    const offers = (c.plans || [])
      .map((p) => {
        const free = /free/i.test(p.price);
        const n = free ? 0 : Number(String(p.price).replace(/[^\d.]/g, ''));
        if (!free && !(n > 0)) return null;
        const currency = /₹|rs|inr/i.test(p.price)
          ? 'INR'
          : /aed|dhs/i.test(p.price)
            ? 'AED'
            : /€|eur/i.test(p.price)
              ? 'EUR'
              : /£|gbp/i.test(p.price)
                ? 'GBP'
                : /\$|usd/i.test(p.price)
                  ? 'USD'
                  : free
                    ? 'INR'
                    : '';
        return currency ? { '@type': 'Offer', name: p.name, price: String(n), priceCurrency: currency } : null;
      })
      .filter(Boolean);
    const contact = c.contact || {};
    const org = {
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      name: 'BQuee',
      url: `${base}/`,
      logo: `${base}/img/brand/bquee-logo.png`,
      description: c.seo.description,
    };
    if (contact.email || contact.phone)
      org.contactPoint = {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        ...(contact.email ? { email: contact.email } : {}),
        ...(contact.phone ? { telephone: contact.phone } : {}),
      };
    const graph = [
      org,
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        url: `${base}/`,
        name: 'BQuee',
        publisher: { '@id': `${base}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'BQuee',
        url: `${base}/`,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Queue management system',
        operatingSystem: 'Web, Android, iOS',
        description: c.hero.text || c.seo.description,
        publisher: { '@id': `${base}/#organization` },
        areaServed: (c.locations || []).map((l) => ({ '@type': 'Place', name: l.region })),
        ...(offers.length ? { offers } : {}),
      },
    ];
    if (on.faqs && c.faqs.length)
      graph.push({
        '@type': 'FAQPage',
        mainEntity: c.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      });
    return { '@context': 'https://schema.org', '@graph': graph };
  }

  function previewTags({ base, url, title, description, image, type = 'website' }) {
    return [
      `<link rel="canonical" href="${esc(url)}" />`,
      `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
      `<meta property="og:type" content="${type}" />`,
      `<meta property="og:site_name" content="BQuee" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:url" content="${esc(url)}" />`,
      `<meta property="og:image" content="${esc(absolute(base, image))}" />`,
      `<meta property="og:locale" content="en" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
      `<meta name="twitter:image" content="${esc(absolute(base, image))}" />`,
    ]
      .map((t) => `    ${t}`)
      .join('\n');
  }

  async function home(req, res) {
    const base = baseUrl(req);
    const html = await (async () => {
      const c = await homeContent();
      const title = c.seo.title;
      const description = c.seo.description;
      return fill({
        title,
        description,
        head: `${previewTags({ base, url: `${base}/`, title, description, image: '/img/og-image.png' })}\n    ${jsonLd(homeData(c, base))}`,
        body: homeBody(c),
      });
    })();
    send(req, res, 200, html);
  }

  /* ---------------- a business page ---------------- */

  async function business(req, res, slug) {
    const base = baseUrl(req);
    const html = await (async () => {
      const {
        rows: [s],
      } = await db.query(
        `SELECT name, slug, tagline, about, phone, address, logo_url, cover_url, is_active,
                (expires_on IS NOT NULL AND expires_on < CURRENT_DATE) AS expired
           FROM salons WHERE lower(slug) = lower($1)`,
        [slug],
      );
      if (!s || !s.is_active || s.expired) return null;
      const where = cut(s.address, 60);
      const title = cut(`${s.name}${where ? ` – ${where}` : ''} | Book a token online`, 70);
      const description = cut(
        s.tagline ||
          s.about ||
          `Book your token at ${s.name}${where ? ` in ${where}` : ''}, see your live waiting time and skip the queue – no app needed.`,
        160,
      );
      const url = `${base}/s/${encodeURIComponent(s.slug)}`;
      const data = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: s.name,
        url,
        ...(s.tagline || s.about ? { description: cut(s.tagline || s.about, 300) } : {}),
        ...(s.phone ? { telephone: s.phone } : {}),
        ...(s.address ? { address: s.address } : {}),
        ...(s.logo_url ? { logo: absolute(base, s.logo_url), image: absolute(base, s.cover_url || s.logo_url) } : {}),
      };
      return fill({
        title,
        description,
        head: `${previewTags({ base, url, title, description, image: s.cover_url || s.logo_url || '/img/og-image.png', type: 'business.business' })}\n    ${jsonLd(data)}`,
      });
    })();
    if (!html) return notFound(req, res);
    send(req, res, 200, html);
  }

  /* ---------------- Terms and Privacy ---------------- */

  function legalPage(req, res, doc) {
    const base = baseUrl(req);
    const title = `${doc.title} | BQuee`;
    const block = (sec) =>
      (sec.h ? `<h2>${esc(sec.h)}</h2>` : '') +
      (sec.list && sec.p && sec.p.length ? `<p>${esc(sec.p[0])}</p>` : '') +
      (sec.list ? `<ul>${sec.list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '') +
      (sec.list ? (sec.p || []).slice(1) : sec.p || []).map((t) => `<p>${esc(t)}</p>`).join('');
    const body =
      `<div class="site seo-pre"><header class="seo-pre-head site-wrap"><a href="/"><img src="/img/brand/bquee-logo.png" alt="BQuee" width="126" height="30" /></a></header>` +
      `<main class="site-wrap legal-in"><h1>${esc(doc.title)}</h1><p class="legal-date">Last updated: ${esc(doc.updated)}</p>` +
      doc.intro.map((t) => `<p>${esc(t)}</p>`).join('') +
      doc.sections.map(block).join('') +
      `</main></div>`;
    const html = fill({
      title,
      description: doc.description,
      head: previewTags({
        base,
        url: base + doc.path,
        title,
        description: doc.description,
        image: '/img/og-image.png',
      }),
      body,
    });
    send(req, res, 200, html);
  }

  /* ---------------- private pages, 404, robots, sitemap ---------------- */

  const noindexHead = '    <meta name="robots" content="noindex, nofollow" />';

  function privatePage(req, res) {
    const html = indexHtml().replace('</head>', `${noindexHead}\n  </head>`);
    send(req, res, 200, html);
  }

  /** An address that isn't a page: the app shows its "not found" page; Google gets a real 404. */
  function notFound(req, res) {
    const html = indexHtml().replace('</head>', `${noindexHead}\n  </head>`);
    send(req, res, 404, html);
  }

  function robots(req, res) {
    const base = baseUrl(req);
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /admin',
      'Disallow: /owner',
      'Disallow: /staff',
      'Disallow: /login',
      'Disallow: /t/',
      '',
      `Sitemap: ${base}/sitemap.xml`,
      '',
    ].join('\n');
    res.writeHead(200, {
      ...headers,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function sitemap(req, res) {
    const base = baseUrl(req);
    const xml = await cached(`sitemap ${base}`, async () => {
      const content = await site.get();
      const { rows } = await db.query(
        `SELECT slug, created_at FROM salons
          WHERE is_active AND (expires_on IS NULL OR expires_on >= CURRENT_DATE) AND slug <> ''
          ORDER BY created_at LIMIT 45000`,
      );
      const day = (d) => new Date(d).toISOString().slice(0, 10);
      const urls = [
        { loc: `${base}/`, lastmod: day(content.updatedAt || Date.now()), priority: '1.0' },
        ...Object.values(LEGAL_PAGES).map((d) => ({ loc: base + d.path, lastmod: d.updatedIso, priority: '0.3' })),
        ...rows.map((r) => ({
          loc: `${base}/s/${encodeURIComponent(r.slug)}`,
          lastmod: day(r.created_at),
          priority: '0.6',
        })),
      ];
      return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls
          .map(
            (u) =>
              `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`,
          )
          .join('\n') +
        '\n</urlset>\n'
      );
    });
    res.writeHead(200, {
      ...headers,
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : xml);
  }

  /** Handles the request if it's one of ours; returns false to let the static files answer. */
  async function handle(req, res, pathname) {
    try {
      if (pathname === '/') return (await home(req, res), true);
      if (pathname === '/robots.txt') return (robots(req, res), true);
      if (pathname === '/sitemap.xml') return (await sitemap(req, res), true);
      if (LEGAL_PAGES[pathname]) return (legalPage(req, res, LEGAL_PAGES[pathname]), true);
      const m = pathname.match(BUSINESS_PAGE);
      if (m) return (await business(req, res, m[1]), true);
      if (PRIVATE_PAGES.some((re) => re.test(pathname))) return (privatePage(req, res), true);
      return false;
    } catch (err) {
      // Never block the website: fall back to the plain page.
      log.error('SEO page failed:', err);
      return false;
    }
  }

  return { handle, notFound, homeBody, homeData };
}

module.exports = { createSeo };
