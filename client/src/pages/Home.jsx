/* BQuee product landing page. Every text block comes from the super admin's "Website" editor. */

import { useEffect, useRef, useState } from 'react';
import { api } from '../core/api.js';
import { applyBrand } from '../core/format.js';
import { Link, navigate, useLocation } from '../core/router.jsx';
import { Icon, LinkButton } from '../core/ui.jsx';
import { CurrencyPicker, priceIn, useCurrency } from '../core/currency.jsx';

const NAV = [
  ['features', 'Features'],
  ['how', 'How it works'],
  ['pricing', 'Pricing'],
  ['faq', 'FAQ'],
  ['contact', 'Contact'],
];

/**
 * Referral links (/?ref=CODE or /signup?ref=CODE): the code is remembered for 30 days so the
 * business is credited to whoever invited it, even if it signs up later.
 */
const REF_KEY = 'bq_ref';
export function rememberReferral() {
  try {
    const code = new URLSearchParams(location.search).get('ref');
    if (code && /^[a-z0-9]{3,20}$/i.test(code))
      localStorage.setItem(REF_KEY, JSON.stringify({ code: code.toLowerCase(), at: Date.now() }));
  } catch (err) {
    /* storage blocked – the link still works on the sign-up page itself */
  }
}
export function savedReferral() {
  try {
    const r = JSON.parse(localStorage.getItem(REF_KEY) || 'null');
    if (r && r.code && Date.now() - r.at < 30 * 86400000) return r.code;
  } catch (err) {
    /* ignore */
  }
  return '';
}
export function forgetReferral() {
  try {
    localStorage.removeItem(REF_KEY);
  } catch (err) {
    /* ignore */
  }
}

/** The device's time zone and region, so the server can say which currency this visitor uses. */
function deviceQuery() {
  const q = new URLSearchParams();
  try {
    q.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  } catch (e) {}
  const lang = (typeof navigator !== 'undefined' && navigator.language) || '';
  const m = /[-_]([A-Za-z]{2})$/.exec(lang);
  if (m) q.set('region', m[1]);
  return q.toString();
}

/** Site content is cached for the session so going back to the home page is instant. */
let cached = null;

export function useSite() {
  const [site, setSite] = useState(cached);
  useEffect(() => {
    let alive = true;
    api('GET', '/api/public/site?' + deviceQuery())
      .then((s) => {
        cached = s;
        if (alive) setSite(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return site;
}

/** BQuee logo files: dark text for light backgrounds, white for purple/dark ones, and the square icon. */
const BRAND = {
  logo: '/img/brand/bquee-logo.png',
  logoLight: '/img/brand/bquee-logo-light.png',
  icon: '/img/brand/bquee-icon.png',
};

export function Logo({ light }) {
  return (
    <Link to="/" className={'site-logo' + (light ? ' light' : '')} aria-label="BQuee home">
      <img className="site-logo-full" src={light ? BRAND.logoLight : BRAND.logo} alt="BQuee" width="143" height="34" />
      <img className="site-logo-icon" src={BRAND.icon} alt="" width="34" height="34" />
    </Link>
  );
}

/** Store buttons. Without a link yet they read "Coming soon" (or are left out with onlyLinked). */
export function StoreButtons({ app, onlyLinked = false }) {
  const items = [
    ['playUrl', 'Get it on', 'Google Play', 'play', 'play'],
    ['appStoreUrl', 'Download on the', 'App Store', 'phoneapp', 'ios'],
  ];
  return (
    <div className="store-row">
      {items
        .filter(([key]) => !onlyLinked || (app && app[key]))
        .map(([key, small, big, icon, kind]) => {
          const href = app && app[key];
          const inner = (
            <>
              <span className="store-ico">
                <Icon name={icon} />
              </span>
              <span className="store-txt">
                <small>{href ? small : 'Coming soon'}</small>
                <b>{big}</b>
              </span>
            </>
          );
          return href ? (
            <a key={key} className={'store-btn ' + kind} href={href} target="_blank" rel="noopener noreferrer">
              {inner}
            </a>
          ) : (
            <span key={key} className={'store-btn soon ' + kind} aria-label={big + ' – coming soon'}>
              {inner}
            </span>
          );
        })}
    </div>
  );
}

function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Which page sections are switched on (used by the header and footer links). */
function navFor(site) {
  const on = (site && site.sections) || {};
  return NAV.filter(([sid]) =>
    sid === 'pricing'
      ? on.plans
      : sid === 'faq'
        ? on.faqs
        : sid === 'contact'
          ? on.contact
          : sid === 'how'
            ? on.steps
            : on.features,
  );
}

/** Go to a section of the home page – from the home page itself or from sign-in / sign-up. */
function useGoTo() {
  const { path } = useLocation();
  return (sid) => {
    if (path === '/') return scrollTo(sid);
    try {
      sessionStorage.setItem('bq_scroll', sid);
    } catch (err) {
      /* storage blocked – just open the home page */
    }
    navigate('/');
  };
}

/** Floating, rounded header shared by the home, sign-in and sign-up pages. */
export function SiteHeader({ site, tab }) {
  const [menu, setMenu] = useState(false);
  const go = useGoTo();
  const nav = navFor(site);
  const signupOpen = !site || (site.signup && site.signup.enabled);
  const pick = (sid) => {
    setMenu(false);
    go(sid);
  };
  const head = useRef(null);
  // The open phone menu closes on a tap outside it or the Escape key.
  useEffect(() => {
    if (!menu) return undefined;
    const outside = (e) => {
      if (head.current && !head.current.contains(e.target)) setMenu(false);
    };
    const esc = (e) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);
  return (
    <header ref={head} className={'site-head' + (menu ? ' open' : '')}>
      <div className="site-head-bar">
        <Logo />
        <nav className="site-nav" aria-label="Sections">
          {nav.map(([sid, label]) => (
            <button key={sid} type="button" onClick={() => pick(sid)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="site-auth">
          <LinkButton to="/login" size="sm" variant="quiet" className={tab === 'signin' ? 'is-on' : ''}>
            Sign in
          </LinkButton>
          {signupOpen && (
            <LinkButton to="/signup" size="sm" variant="primary">
              Sign up
            </LinkButton>
          )}
          {nav.length > 0 && (
            <button
              type="button"
              className="icon-btn site-burger"
              aria-label={menu ? 'Close menu' : 'Open menu'}
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              <Icon name={menu ? 'x' : 'menu'} />
            </button>
          )}
        </div>
      </div>
      {menu && (
        <nav className="site-mobile-nav" aria-label="Sections">
          {nav.map(([sid, label]) => (
            <button key={sid} type="button" onClick={() => pick(sid)}>
              {label}
              <Icon name="chevr" />
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter({ site, withCta }) {
  const go = useGoTo();
  const nav = navFor(site);
  const on = (site && site.sections) || {};
  const contact = (site && site.contact) || {};
  const hasContact = contact.email || contact.phone || contact.address;
  const signupOpen = site && site.signup && site.signup.enabled;
  return (
    <footer className={'site-foot' + (withCta ? ' with-cta' : '')}>
      <div className="site-wrap site-foot-in">
        <div className="site-foot-brand">
          <Logo light />
          {site && site.footer && site.footer.text && <p>{site.footer.text}</p>}
          {site && on.app && <StoreButtons app={site.app} />}
        </div>
        {nav.length > 0 && (
          <div className="site-foot-col">
            <h4>Product</h4>
            {nav.map(([sid, label]) => (
              <button key={sid} type="button" onClick={() => go(sid)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="site-foot-col">
          <h4>Account</h4>
          <Link to="/login">Sign in</Link>
          {signupOpen && <Link to="/signup">Sign up your business</Link>}
        </div>
        {hasContact && (
          <div className="site-foot-col">
            <h4>Contact</h4>
            {contact.email && <a href={'mailto:' + contact.email}>{contact.email}</a>}
            {contact.phone && <a href={'tel:' + contact.phone.replace(/\s/g, '')}>{contact.phone}</a>}
            {contact.address && <span>{contact.address}</span>}
          </div>
        )}
      </div>
      <div className="site-wrap site-copy">
        <span>© {new Date().getFullYear()} BQuee</span>
        <span>QR tokens and live queues for every business</span>
        <nav className="site-legal-links" aria-label="Legal">
          <Link to="/terms">Terms and Conditions</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </nav>
      </div>
    </footer>
  );
}

/** Testimonials slider: swipe or use the arrows; moves on by itself unless the visitor prefers less motion. */
function QuoteSlider({ items }) {
  const track = useRef(null);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fits, setFits] = useState(false);

  // When every review is already in view there is nothing to slide.
  useEffect(() => {
    const check = () => track.current && setFits(track.current.scrollWidth <= track.current.clientWidth + 2);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [items.length]);

  const cards = () => (track.current ? Array.from(track.current.children) : []);
  const show = (i) => {
    const list = cards();
    if (!list.length) return;
    const n = (i + list.length) % list.length;
    track.current.scrollTo({ left: list[n].offsetLeft - list[0].offsetLeft, behavior: 'smooth' });
  };
  const onScroll = () => {
    const list = cards();
    if (!list.length) return;
    const x = track.current.scrollLeft;
    let best = 0;
    list.forEach((c, i) => {
      if (Math.abs(c.offsetLeft - list[0].offsetLeft - x) < Math.abs(list[best].offsetLeft - list[0].offsetLeft - x))
        best = i;
    });
    // At the end of the track the last few cards are all in view – mark the last one.
    if (x + track.current.clientWidth >= track.current.scrollWidth - 4) best = list.length - 1;
    setAt(best);
  };

  useEffect(() => {
    if (paused || fits || items.length < 2) return undefined;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => show(at + 1), 6000);
    return () => clearInterval(t);
  }, [at, paused, fits, items.length]);

  return (
    <div
      className="quote-slider"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div
        className="quote-track"
        ref={track}
        onScroll={onScroll}
        role="region"
        aria-label="What our customers say"
        tabIndex={0}
      >
        {items.map((r, i) => (
          <figure key={i} className="site-quote" aria-label={`${i + 1} of ${items.length}`}>
            <Icon name="quote" className="site-quote-mark" />
            <div className="site-stars" aria-label={r.rating + ' out of 5'}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Icon key={s} name="star" className={s <= r.rating ? 'on' : ''} />
              ))}
            </div>
            <blockquote>{r.text}</blockquote>
            <figcaption>
              <span className="site-avatar">{r.name.slice(0, 1)}</span>
              <span>
                <b>{r.name}</b>
                {r.role && <small>{r.role}</small>}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      {items.length > 1 && !fits && (
        <div className="quote-controls">
          <button type="button" className="quote-arrow" onClick={() => show(at - 1)} aria-label="Previous review">
            <Icon name="arrowl" />
          </button>
          <div className="quote-dots">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                className={i === at ? 'on' : ''}
                onClick={() => show(i)}
                aria-label={'Review ' + (i + 1)}
                aria-current={i === at}
              />
            ))}
          </div>
          <button type="button" className="quote-arrow" onClick={() => show(at + 1)} aria-label="Next review">
            <Icon name="arrow" />
          </button>
        </div>
      )}
    </div>
  );
}

const STEP_ICONS = ['store', 'print', 'qr', 'camera', 'clock', 'check', 'users', 'chart'];

export function Home() {
  const site = useSite();
  const [currency, setCurrency] = useCurrency(site);
  useEffect(() => {
    applyBrand();
    rememberReferral();
  }, []);
  useEffect(() => {
    if (site && site.seo && site.seo.title) document.title = site.seo.title;
  }, [site]);

  // Coming from sign-in / sign-up with a section in mind: scroll to it once the page is drawn.
  useEffect(() => {
    if (!site) return undefined;
    let sid = null;
    try {
      sid = sessionStorage.getItem('bq_scroll');
      sessionStorage.removeItem('bq_scroll');
    } catch (err) {
      sid = null;
    }
    if (!sid) return undefined;
    const t = setTimeout(() => scrollTo(sid), 60);
    return () => clearTimeout(t);
  }, [!!site]);

  if (!site)
    return (
      <div className="site site-loading">
        <span className="spinner" />
      </div>
    );

  const on = site.sections || {};
  const signupOpen = site.signup && site.signup.enabled;
  const h = site.hero;
  const contact = site.contact || {};
  const hasContact = contact.email || contact.phone || contact.whatsapp || contact.address;
  const trial = signupOpen && !site.signup.approval && site.signup.trialDays;

  return (
    <div className="site">
      <SiteHeader site={site} />

      <main>
        {/* ---------- hero ---------- */}
        <section className="site-hero">
          <div className="site-wrap site-hero-in">
            {h.badge && (
              <span className="site-badge">
                <Icon name="sparkle" /> {h.badge}
              </span>
            )}
            <h1>
              {h.title} {h.highlight && <span className="grad-text">{h.highlight}</span>}
            </h1>
            {h.text && <p className="site-lead">{h.text}</p>}
            <div className="site-cta">
              {signupOpen && (
                <LinkButton to="/signup" variant="white" size="lg" iconRight="arrow">
                  {h.primary || 'Start free'}
                </LinkButton>
              )}
              <LinkButton to="/login" variant="glass" size="lg">
                {h.secondary || 'Sign in'}
              </LinkButton>
            </div>
            {trial ? (
              <p className="site-note">
                <Icon name="check" /> {trial}-day free trial · no card needed · set up in minutes
              </p>
            ) : null}
            {on.app && <StoreButtons app={site.app} />}
          </div>
        </section>

        {/* ---------- stats (overlaps the hero) ---------- */}
        {on.stats && site.stats.length > 0 && (
          <section className="site-stats" aria-label="BQuee in numbers">
            <div className="site-wrap">
              <div className="site-stats-in">
                {site.stats.map((s, i) => (
                  <div key={i}>
                    <b>{s.value}</b>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- replace paper tokens and token machines (problem → solution) ---------- */}
        {on.replace && site.replace && site.replace.length > 0 && (
          <section id="why" className="site-sec site-why">
            <div className="site-wrap">
              <SectionHead {...head(site, 'replace')} />
              <ul className="site-why-list">
                {site.replace.map((r, i) => (
                  <li key={i}>
                    <p className="site-why-problem">
                      <Icon name="x" /> {r.problem}
                    </p>
                    {r.solution && (
                      <p className="site-why-solution">
                        <Icon name="check" /> {r.solution}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------- features ---------- */}
        {on.features && site.features.length > 0 && (
          <section id="features" className="site-sec">
            <div className="site-wrap">
              <SectionHead {...head(site, 'features')} />
              <div className="site-features">
                {site.features.map((f, i) => (
                  <article key={i} className="site-feature">
                    <span className="site-ico">
                      <Icon name={f.icon || 'check'} />
                    </span>
                    <h3>{f.title}</h3>
                    {f.text && <p>{f.text}</p>}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- categories ---------- */}
        {on.categories && site.categories.length > 0 && (
          <section className="site-sec site-cats-sec">
            <div className="site-wrap site-cats-in">
              <div>
                <h2>{site.categoriesTitle || 'Made for every kind of business'}</h2>
                {site.categoriesText && <p>{site.categoriesText}</p>}
              </div>
              <ul className="site-cats">
                {site.categories.map((c) => (
                  <li key={c.id} style={{ '--c': c.color || '#7b2c9e' }}>
                    <span className="site-cat-ico">
                      <Icon name={c.icon || 'store'} />
                    </span>
                    {c.name}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------- how it works ---------- */}
        {on.steps && site.steps.length > 0 && (
          <section id="how" className="site-sec site-how">
            <div className="site-wrap">
              <SectionHead {...head(site, 'steps')} center light />
              <ol className="site-steps" style={{ '--n': Math.min(site.steps.length, 4) }}>
                {site.steps.map((s, i) => (
                  <li key={i}>
                    <div className="site-step-top">
                      <span className="site-step-ico">
                        <Icon name={STEP_ICONS[i % STEP_ICONS.length]} />
                      </span>
                      <span className="site-step-no">Step {i + 1}</span>
                    </div>
                    <h3>{s.title}</h3>
                    {s.text && <p>{s.text}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* ---------- app ---------- */}
        {on.app && (
          <section className="site-sec site-app-sec">
            <div className="site-wrap">
              <div className="site-app">
                <div className="site-app-copy">
                  <span className="site-kicker light">Mobile app</span>
                  <h2>{site.app.title || 'Run your queue from your phone'}</h2>
                  {site.app.text && <p>{site.app.text}</p>}
                  <StoreButtons app={site.app} />
                </div>
                <div className="site-phone" aria-hidden="true">
                  <div className="site-phone-screen">
                    <div className="sp-head">
                      <span className="sp-mark">
                        <Icon name="ticket" />
                      </span>
                      My queue
                    </div>
                    {[
                      ['A-021', 'In service', 'serve'],
                      ['A-022', 'Waiting · 10 min', 'wait'],
                      ['A-023', 'Waiting · 25 min', 'wait'],
                    ].map(([no, st, k]) => (
                      <div key={no} className="sp-card">
                        <b className="num">{no}</b>
                        <span className={'sp-pill ' + k}>{st}</span>
                      </div>
                    ))}
                    <div className="sp-scan">
                      <Icon name="camera" /> Scan
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ---------- pricing ---------- */}
        {/* ---------- where BQuee works ---------- */}
        {on.locations && site.locations && site.locations.length > 0 && (
          <section id="locations" className="site-sec site-places">
            <div className="site-wrap">
              <SectionHead {...head(site, 'locations')} />
              <div className="site-places-grid">
                {site.locations.map((l, i) => (
                  <article key={i}>
                    <h3>
                      <Icon name="pin" /> {l.region}
                    </h3>
                    {l.places && <p>{l.places}</p>}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {on.plans && site.plans.length > 0 && (
          <section id="pricing" className="site-sec tint">
            <div className="site-wrap">
              <SectionHead {...head(site, 'plans')} center />
              <CurrencyPicker site={site} code={currency} onPick={setCurrency} className="center" />
              <div className="site-plans">
                {site.plans.map((p, i) => (
                  <article key={i} className={'site-plan' + (p.highlight ? ' best' : '')}>
                    {p.highlight && <span className="site-plan-tag">Most popular</span>}
                    <h3>{p.name}</h3>
                    <div className="site-price">
                      <b>{priceIn(p, currency)}</b>
                      {p.period && <span>{p.period}</span>}
                    </div>
                    <ul>
                      {String(p.features || '')
                        .split('\n')
                        .filter((x) => x.trim())
                        .map((x, j) => (
                          <li key={j}>
                            <Icon name="check" /> {x}
                          </li>
                        ))}
                    </ul>
                    {signupOpen ? (
                      <LinkButton to="/signup" variant={p.highlight ? 'primary' : 'soft'} className="block">
                        Get started
                      </LinkButton>
                    ) : (
                      <button type="button" className="btn soft block" onClick={() => scrollTo('contact')}>
                        <span>Contact us</span>
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- testimonials ---------- */}
        {on.testimonials && site.testimonials.length > 0 && (
          <section className="site-sec site-reviews">
            <div className="site-wrap">
              <SectionHead {...head(site, 'testimonials')} />
              <QuoteSlider items={site.testimonials} />
            </div>
          </section>
        )}

        {/* ---------- FAQ ---------- */}
        {on.faqs && site.faqs.length > 0 && (
          <section id="faq" className="site-sec tint">
            <div className="site-wrap site-faq-wrap">
              <SectionHead {...head(site, 'faqs')} text={hasContact && on.contact ? head(site, 'faqs').text : ''} />
              <div className="site-faq">
                {site.faqs.map((f, i) => (
                  <details key={i}>
                    <summary>
                      {f.q}
                      <Icon name="plus" />
                    </summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- contact ---------- */}
        {on.contact && hasContact && (
          <section id="contact" className="site-sec">
            <div className="site-wrap">
              <SectionHead {...head(site, 'contact')} />
              <div className="site-contact">
                {contact.whatsapp && (
                  <a
                    href={'https://wa.me/' + contact.whatsapp.replace(/[^\d]/g, '')}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="chat" />
                    <span>
                      <small>WhatsApp</small>
                      <b>{contact.whatsapp}</b>
                    </span>
                  </a>
                )}
                {contact.phone && (
                  <a href={'tel:' + contact.phone.replace(/\s/g, '')}>
                    <Icon name="phone" />
                    <span>
                      <small>Call</small>
                      <b>{contact.phone}</b>
                    </span>
                  </a>
                )}
                {contact.email && (
                  <a href={'mailto:' + contact.email}>
                    <Icon name="mail" />
                    <span>
                      <small>Email</small>
                      <b>{contact.email}</b>
                    </span>
                  </a>
                )}
                {contact.address && (
                  <div>
                    <Icon name="pin" />
                    <span>
                      <small>Office</small>
                      <b>{contact.address}</b>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ---------- call to action (sits on the edge of the footer) ---------- */}
        {signupOpen && (
          <section className="site-cta-sec">
            <div className="site-wrap">
              <div className="site-cta-band">
                <div>
                  <h2>{(site.cta && site.cta.title) || 'Ready to end the waiting room?'}</h2>
                  {site.cta && site.cta.text && <p>{site.cta.text}</p>}
                </div>
                <div className="site-cta-btns">
                  <LinkButton to="/signup" variant="white" size="lg" iconRight="arrow">
                    Sign up your business
                  </LinkButton>
                  <LinkButton to="/login" variant="glass" size="lg">
                    Sign in
                  </LinkButton>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <SiteFooter site={site} withCta={signupOpen} />
    </div>
  );
}

/** A section's heading as the super admin set it (Admin → Website → Section titles). */
const head = (site, key) => {
  const h = (site.headings && site.headings[key]) || {};
  return { kicker: h.kicker, title: h.title, text: h.text };
};

function SectionHead({ kicker, title, text, center, light }) {
  return (
    <div className={'site-sec-head' + (center ? ' center' : '') + (light ? ' light' : '')}>
      {kicker && <span className={'site-kicker' + (light ? ' light' : '')}>{kicker}</span>}
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}
