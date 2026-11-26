/*
 * Salon / branch landing page – what a branch QR code opens.
 *
 * Full-bleed photo hero with the salon name, quick contact buttons and a live-queue ticket
 * (wait gauge, people waiting). Then: key facts, how it works, offers, reviews, visit us.
 * The nav turns solid on scroll; on phones a "Book a token" bar slides up once the hero
 * button has scrolled away. Numbers count up and sections ease in once, as they appear.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../core/api.js';
import {
  applyBrand,
  setFavicon,
  directionsLink,
  igLink,
  plural,
  socialLabel,
  socialLink,
  telLink,
  waLink,
  waitText,
} from '../core/format.js';
import { Link, navigate } from '../core/router.jsx';
import { Button, Dialog, ErrorPage, Icon, PageLoader, SalonMark, toast, useInterval, useLoad } from '../core/ui.jsx';
import { QueueCheck } from './QueueCheck.jsx';
import { StoreButtons } from '../pages/Home.jsx';
import { CheckTokenDialog, DEFAULT_COVER, OfferCoupon, ReviewCard, Stars, todaysTokens } from './parts.jsx';

/** A branch's link part: its name link (/b/lotussalon), or its id when it has none. */
const linkOf = (b) => b.slug || b.id;

export function SalonPage({ slug }) {
  const { data, error } = useLoad(() => api('GET', '/api/public/salon/' + encodeURIComponent(slug)), [slug]);
  useEffect(() => {
    if (data && data.branches.length === 1) navigate('/b/' + linkOf(data.branches[0]), { replace: true });
  }, [data]);
  if (error) return <ErrorPage message={error.message} />;
  if (!data || data.branches.length === 1) return <PageLoader />;
  return <LandingView d={data} scoped={null} />;
}

export function Landing({ branchId }) {
  const url = '/api/public/landing/' + encodeURIComponent(branchId);
  const load = useLoad(() => api('GET', url), [branchId]);
  useInterval(load.reload, 30000, !!load.data);
  // An old number link (/b/358f30d501, printed posters) moves to the name link (/b/lotussalon).
  const slug = load.data && load.data.branches[0] && load.data.branches[0].slug;
  useEffect(() => {
    if (slug && slug !== branchId) navigate('/b/' + slug + location.search + location.hash, { replace: true });
  }, [slug, branchId]);
  if (load.error && !load.data) return <ErrorPage message={load.error.message} />;
  if (!load.data) return <PageLoader />;
  return <LandingView d={load.data} scoped={branchId} />;
}

/* ---------- motion helpers ---------- */

const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True once the element has scrolled into view (stays true). */
function useSeen(threshold = 0.2) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    if (!('IntersectionObserver' in window)) return setSeen(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** Counts from 0 to `value` once it's visible. Non-numeric values render as-is. */
function CountUp({ value, prefix = '', suffix = '', decimals = 0 }) {
  const [ref, seen] = useSeen(0.4);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!seen) return undefined;
    if (reducedMotion()) return setShown(value);
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 900);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value]);
  return (
    <span ref={ref} className="num">
      {prefix}
      {Number(shown).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** Section that eases in once when it appears. */
function Reveal({ as: Tag = 'section', className = '', children, ...rest }) {
  const [ref, seen] = useSeen(0.12);
  return (
    <Tag ref={ref} className={'reveal ' + className + (seen ? ' in' : '')} {...rest}>
      {children}
    </Tag>
  );
}

/** Horizontal card rail with arrow buttons (desktop) and dots, optional auto-advance. */
function Rail({ children, label, auto }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });
  const count = Array.isArray(children) ? children.length : 1;
  const paused = useRef(false);

  const update = () => {
    const el = track.current;
    if (!el) return;
    const first = el.children[0];
    const step = first ? first.getBoundingClientRect().width + 18 : el.clientWidth;
    setIndex(Math.round(el.scrollLeft / step));
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  };
  const go = (i) => {
    const el = track.current;
    const item = el && el.children[Math.max(0, Math.min(count - 1, i))];
    if (item) el.scrollTo({ left: item.offsetLeft - el.children[0].offsetLeft, behavior: 'smooth' });
  };
  useEffect(update, [count]);
  useInterval(
    () => {
      if (paused.current || !track.current) return;
      const el = track.current;
      if (el.scrollLeft + el.clientWidth > el.scrollWidth - 8) go(0);
      else go(index + 1);
    },
    5000,
    !!auto && count > 1 && !reducedMotion(),
  );

  return (
    <div
      className="ld-rail"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onTouchStart={() => (paused.current = true)}
    >
      <div className="ld-rail-track" ref={track} onScroll={update} aria-label={label} tabIndex={0}>
        {children}
      </div>
      {count > 1 && (
        <div className="ld-rail-nav">
          <div className="ld-dots" aria-hidden="true">
            {Array.from({ length: count }, (_, i) => (
              <button key={i} type="button" tabIndex={-1} className={i === index ? 'on' : ''} onClick={() => go(i)} />
            ))}
          </div>
          <div className="ld-arrows">
            <button
              type="button"
              className="ld-arrow"
              onClick={() => go(index - 1)}
              disabled={edges.start}
              aria-label="Previous"
            >
              <Icon name="prev" />
            </button>
            <button
              type="button"
              className="ld-arrow"
              onClick={() => go(index + 1)}
              disabled={edges.end}
              aria-label="Next"
            >
              <Icon name="next" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- live queue ticket ---------- */

const NAV_ICONS = { check: 'clock', how: 'sparkle', offers: 'gift', reviews: 'star', visit: 'pin' };

/* ---------- page ---------- */

function LandingView({ d, scoped }) {
  const s = d.salon;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // 'branches' | 'check'
  const [solid, setSolid] = useState(false);
  const [showBar, setShowBar] = useState(false);
  const heroCta = useRef(null);
  const checkInput = useRef(null);

  const open = d.branches.filter((b) => b.wait != null);
  const branch = scoped ? d.branches[0] : null;
  const address = (branch && branch.address) || s.address;
  const phone = (branch && branch.phone) || s.phone;
  // Lowest price. One branch (its QR code): that branch's own prices only.
  // Several branches: also count the listed branches that charge a different price.
  const shownBranches = d.branches.map((b) => b.id);
  const minPrice = d.services.length
    ? Math.min(
        ...d.services.flatMap((x) =>
          scoped
            ? [x.price]
            : [
                x.price,
                ...Object.entries(x.branchPrices || {})
                  .filter(([id]) => shownBranches.includes(id))
                  .map(([, p]) => p),
              ],
        ),
      )
    : 0;
  const reviews = d.testimonials || [];
  const rating = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;

  useEffect(() => applyBrand(s.color), [s.color]);
  // The tab shows this business's logo; leaving puts the BQuee logo back.
  useEffect(() => (setFavicon(s.logo), () => setFavicon('')), [s.logo]);
  useEffect(() => {
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta && s.name) meta.setAttribute('content', s.name);
  }, [s.name]);
  useEffect(() => {
    document.title = s.name + (branch ? ' – ' + branch.name : '') + ' · Book a token';
  }, [s.name]);

  // Nav turns solid once the page scrolls past the top of the hero.
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Phone booking bar appears once the hero's own button is off screen.
  useEffect(() => {
    const el = heroCta.current;
    if (!el || !('IntersectionObserver' in window)) return setShowBar(true);
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // offer: the offer card the customer tapped "Book" on (goes straight to booking with it applied).
  const [pickOffer, setPickOffer] = useState(null);
  const bookPath = (branchId, offer) =>
    '/b/' + branchId + '/book' + (offer ? '?offer=' + encodeURIComponent(offer.id) : '');
  const book = (offer) => {
    setMenuOpen(false);
    const withOffer = offer && offer.id ? offer : null;
    setPickOffer(withOffer);
    if (scoped) {
      if (open.length) navigate(bookPath(scoped, withOffer));
      else toast('Online booking is paused right now', 'err');
    } else if (open.length === 1) navigate(withOffer ? bookPath(linkOf(open[0]), withOffer) : '/b/' + linkOf(open[0]));
    else if (open.length) setDialog('branches');
    else toast('Online booking is paused right now', 'err');
  };

  const checkToken = () => {
    setMenuOpen(false);
    const mine = todaysTokens(s.id);
    if (mine.length === 1) navigate('/t/' + mine[0].id);
    else if (scoped) {
      document.getElementById('check').scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => checkInput.current && checkInput.current.focus({ preventScroll: true }), 500);
    } else setDialog('check');
  };

  const words = String(s.name).trim().split(/\s+/);
  const nameFirst = words.length > 1 ? words[0] : '';
  const nameRest = words.length > 1 ? words.slice(1).join(' ') : words[0];
  const b0 = d.branches[0];
  const minWait = open.length ? Math.min(...open.map((x) => x.wait || 0)) : null;
  const heroTiles = [
    scoped
      ? { icon: 'pin', label: 'Branch', value: b0.name }
      : { icon: 'store', label: 'Branches', value: `${open.length} of ${d.branches.length} open` },
    {
      icon: 'clock',
      label: 'Current wait',
      value: minWait == null ? 'Paused' : minWait ? '~' + waitText(minWait) : 'No wait',
    },
    {
      icon: 'users',
      label: 'In the queue',
      value: plural(
        d.branches.reduce((a, x) => a + (x.waiting || 0), 0),
        'person',
        'people',
      ),
    },
    s.hours
      ? { icon: 'calendar', label: 'Open', value: s.hours }
      : {
          icon: 'users',
          label: 'Staff online',
          value: String(d.branches.reduce((a, x) => a + (x.staffCount || 0), 0)),
        },
  ];

  const links = [
    scoped && ['check', 'Live queue'],
    ['how', 'How it works'],
    d.offers.length && ['offers', 'Offers'],
    reviews.length && ['reviews', 'Reviews'],
    ['visit', 'Visit us'],
  ].filter(Boolean);

  const igHandle = s.instagram
    ? '@' +
      String(s.instagram)
        .replace(/^@/, '')
        .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
        .replace(/\/$/, '')
    : '';
  const quick = [
    phone && { icon: 'phone', label: 'Call', sub: phone, href: telLink(phone) },
    s.whatsapp && { icon: 'chat', label: 'WhatsApp', sub: 'Chat with us', href: waLink(s.whatsapp), ext: true },
    address && { icon: 'map', label: 'Directions', sub: 'Open in Maps', href: directionsLink(s, address), ext: true },
    s.instagram && { icon: 'insta', label: 'Instagram', sub: igHandle, href: igLink(s.instagram), ext: true },
  ].filter(Boolean);

  // Social pages and website the owner added in Salon profile.
  const socials = [
    s.facebook && {
      icon: 'facebook',
      label: 'Facebook',
      sub: socialLabel('facebook', s.facebook),
      href: socialLink('facebook', s.facebook),
      tone: 't5',
      ext: true,
    },
    s.youtube && {
      icon: 'youtube',
      label: 'YouTube',
      sub: socialLabel('youtube', s.youtube),
      href: socialLink('youtube', s.youtube),
      tone: 't6',
      ext: true,
    },
    s.x && { icon: 'xlogo', label: 'X', sub: socialLabel('x', s.x), href: socialLink('x', s.x), tone: 't7', ext: true },
    s.website && {
      icon: 'globe',
      label: 'Website',
      sub: socialLabel('website', s.website),
      href: socialLink('website', s.website),
      tone: 't8',
      ext: true,
    },
  ].filter(Boolean);

  const contacts = [
    phone && { icon: 'phone', label: 'Call us', sub: phone, href: telLink(phone), tone: 't1' },
    s.whatsapp && {
      icon: 'chat',
      label: 'WhatsApp',
      sub: 'Chat with us',
      href: waLink(s.whatsapp),
      ext: true,
      tone: 't2',
    },
    s.instagram && {
      icon: 'insta',
      label: 'Instagram',
      sub: igHandle,
      href: igLink(s.instagram),
      ext: true,
      tone: 't3',
    },
    s.email && { icon: 'mail', label: 'Email', sub: s.email, href: 'mailto:' + s.email, tone: 't4' },
    ...socials,
  ].filter(Boolean);

  const facts = [
    d.services.length > 0 && {
      icon: 'tag',
      value: d.services.length,
      label: d.services.length === 1 ? 'service' : 'services',
    },
    d.team.length > 0 && { icon: 'users', value: d.team.length, label: d.team.length === 1 ? 'staff member' : 'staff' },
    d.services.length > 0 && { icon: 'tag', value: minPrice, prefix: s.currency || '₹', label: 'starting price' },
    reviews.length > 0 && { icon: 'star', value: rating, decimals: 1, suffix: ' ★', label: 'client rating' },
  ].filter(Boolean);

  return (
    <div className={'ld' + (menuOpen ? ' menu-open' : '')}>
      <header className={'ld-nav v2' + (solid || menuOpen ? ' solid' : '')}>
        <div className="ld-nav-pill">
          {/* With a logo the header shows only the logo; without one, the name. */}
          <a className="ld-brand" href="#top" onClick={() => setMenuOpen(false)} aria-label={s.name}>
            {s.logo ? (
              <SalonMark salon={s} className="ld-logo only" />
            ) : (
              <>
                <SalonMark salon={s} className="ld-logo" />
                <span className="ld-brand-text">
                  <b>{s.name}</b>
                  {s.tagline && <small>{s.tagline}</small>}
                </span>
              </>
            )}
          </a>
          <nav className="ld-links" aria-label="Sections">
            {links.map(([id, label]) => (
              <a key={id} href={'#' + id} onClick={() => setMenuOpen(false)}>
                <Icon name={NAV_ICONS[id]} />
                {label}
              </a>
            ))}
          </nav>
          <div className="ld-nav-end">
            <button
              type="button"
              className="ld-nav-icon"
              onClick={checkToken}
              aria-label="Check my token"
              title="Check my token"
            >
              <Icon name="ticket" />
            </button>
            {open.length > 0 && (
              <Button variant="primary" size="sm" onClick={book} className="ld-nav-book" icon="sparkle">
                <span className="long">Book a token</span>
                <span className="short">Book</span>
              </Button>
            )}
            <button
              type="button"
              className="ld-menu"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} />
            </button>
          </div>
        </div>
      </header>

      <section className="ld-hero v2" id="top">
        <div
          className="ld-hero-photo"
          style={{ backgroundImage: `url("${s.cover || DEFAULT_COVER}")` }}
          role="img"
          aria-label={s.name}
        />
        <div className="ld-hero-inner">
          <div className="ld-hero-copy">
            <span className={'ld-eyebrow' + (open.length ? '' : ' off')}>
              <i aria-hidden="true" />
              {open.length ? 'Taking bookings now' : 'Online booking paused'}
            </span>
            <h1>
              {nameFirst}
              {nameRest && (
                <>
                  <br />
                  <span className="grad">{nameRest}</span>
                </>
              )}
            </h1>
            {s.tagline && <p className="ld-tagline">{s.tagline}</p>}
            <p className="ld-lede">
              Book your token from your phone in under a minute and follow your <em>live waiting time</em> – walk in
              when it’s your turn.
            </p>
          </div>

          <div className="ld-bookcard">
            <div className="ld-bookcard-actions" ref={heroCta}>
              <button type="button" className="ld-bookcard-btn" onClick={book} disabled={!open.length}>
                <Icon name="sparkle" />
                {open.length ? 'Book a token' : 'Booking paused'}
              </button>
              <button type="button" className="ld-bookcard-btn alt" onClick={checkToken}>
                <Icon name="clock" />
                Check my waiting time
              </button>
            </div>
            <div className="ld-bookcard-tiles">
              {heroTiles.map((t) => (
                <div key={t.label} className="ld-bookcard-tile">
                  <span className="ld-bookcard-icon" aria-hidden="true">
                    <Icon name={t.icon} />
                  </span>
                  <span>
                    <small>{t.label}</small>
                    <b>{t.value}</b>
                  </span>
                </div>
              ))}
            </div>
            <div className="ld-bookcard-foot">
              {quick.length > 0 && (
                <div className="ld-quick" aria-label="Contact">
                  {quick.map((q) => (
                    <a
                      key={q.label}
                      href={q.href}
                      {...(q.ext ? { target: '_blank', rel: 'noopener' } : {})}
                      aria-label={q.label}
                      title={q.label}
                    >
                      <Icon name={q.icon} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <main className="ld-main">
        {facts.length > 0 && (
          <Reveal as="dl" className="ld-facts">
            {facts.map((f) => (
              <div key={f.label}>
                <span className="ld-fact-icon" aria-hidden="true">
                  <Icon name={f.icon} />
                </span>
                <dt>{f.label}</dt>
                <dd>
                  <CountUp value={f.value} prefix={f.prefix} suffix={f.suffix} decimals={f.decimals} />
                </dd>
              </div>
            ))}
          </Reveal>
        )}

        {scoped && (
          <Reveal className="ld-sec ld-check" id="check">
            <header className="ld-head">
              <span className="ld-kicker">Live queue</span>
              <h2>Where’s the queue?</h2>
              <p>Check your token’s waiting time and see which numbers are being served right now.</p>
            </header>
            <QueueCheck branchId={scoped} prefix={d.branches[0].prefix} inputRef={checkInput} />
          </Reveal>
        )}

        <Reveal className="ld-sec ld-how" id="how">
          <header className="ld-head light">
            <span className="ld-kicker">How it works</span>
            <h2>Skip the waiting room</h2>
            <p>Three steps, all from your phone. No app, no sign-up.</p>
          </header>
          <ol className="ld-steps">
            {[
              [
                'tag',
                'Pick your services',
                'Choose one or more services and, if you like, your preferred staff member.',
              ],
              ['ticket', 'Get your token', 'Your number and QR code appear instantly. Save it as an image or PDF.'],
              [
                'clock',
                'Walk in on time',
                'Watch your live waiting time and arrive when you’re next. Staff scan your token.',
              ],
            ].map(([icon, title, text], i) => (
              <li key={title} className="ld-step" style={{ '--i': i }}>
                <div className="ld-step-top">
                  <span className="ld-step-icon">
                    <Icon name={icon} />
                  </span>
                  <span className="ld-step-n">Step {i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          {open.length > 0 && (
            <div className="ld-how-cta">
              <Button variant="primary" iconRight="arrow" onClick={book}>
                Start booking
              </Button>
              <span>Takes under a minute</span>
            </div>
          )}
        </Reveal>

        {d.offers.length > 0 && (
          <Reveal className="ld-sec ld-band" id="offers">
            <header className="ld-head">
              <span className="ld-kicker">Offers</span>
              <h2>Offers for you</h2>
              <p>Pick an offer and book with it – it’s saved on your token, so just show your token at the desk.</p>
            </header>
            <Rail label="Offers">
              {d.offers.map((o) => (
                <OfferCoupon
                  key={o.id}
                  offer={o}
                  currency={s.currency}
                  onBook={open.length ? (offer) => book(offer) : null}
                />
              ))}
            </Rail>
          </Reveal>
        )}

        {reviews.length > 0 && (
          <Reveal className="ld-sec ld-reviews" id="reviews">
            <div className="ld-score">
              <span className="ld-kicker light">Reviews</span>
              <h2>Loved by our clients</h2>
              <div className="ld-score-main">
                <b className="num">{rating.toFixed(1)}</b>
                <span>
                  <Stars value={Math.round(rating)} />
                  <small>{plural(reviews.length, 'review')}</small>
                </span>
              </div>
              <ul className="ld-bars" aria-label="Ratings breakdown">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = reviews.filter((r) => r.rating === n).length;
                  return (
                    <li key={n}>
                      <span>{n}★</span>
                      <i>
                        <em style={{ width: (c / reviews.length) * 100 + '%' }} />
                      </i>
                      <span className="num">{c}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <Rail label="Reviews" auto>
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </Rail>
          </Reveal>
        )}

        <Reveal className="ld-sec ld-visit" id="visit">
          <header className="ld-head">
            <span className="ld-kicker">Visit us</span>
            <h2>Come visit</h2>
            <p>We’d love to see you.</p>
          </header>
          <div className="ld-visit-grid">
            <div className="ld-visit-card">
              <span className="ld-visit-mark" aria-hidden="true">
                <Icon name="pin" />
              </span>
              {address && <p className="ld-address">{address}</p>}
              {s.hours && (
                <p className="ld-hours">
                  <Icon name="clock" />
                  {s.hours}
                </p>
              )}
              {s.about && <About text={s.about} />}
              {address && (
                <a
                  className="btn primary ld-directions"
                  href={directionsLink(s, address)}
                  target="_blank"
                  rel="noopener"
                >
                  <Icon name="map" />
                  <span>Get directions</span>
                </a>
              )}
            </div>
            {contacts.length > 0 && (
              <ul
                className={
                  'ld-tiles' +
                  (contacts.length > 4 ? ' many' : contacts.length <= 2 ? ' stack n' + contacts.length : '')
                }
              >
                {contacts.map((q) => (
                  <li key={q.label}>
                    <a
                      href={q.href}
                      {...(q.ext ? { target: '_blank', rel: 'noopener' } : {})}
                      className={'ld-tile ' + q.tone}
                    >
                      <span className="ld-tile-icon">
                        <Icon name={q.icon} />
                      </span>
                      <b>{q.label}</b>
                      <small>{q.sub}</small>
                      <Icon name="arrow" className="go" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Reveal>

        {d.appLinks && (
          <section className="ld-sec ld-getapp" aria-labelledby="getapp-title">
            <div>
              <h2 id="getapp-title">Get the BQuee app</h2>
              <p>Book your token at {s.name} from your phone and see your turn live.</p>
            </div>
            <StoreButtons app={{ playUrl: d.appLinks.play, appStoreUrl: d.appLinks.appStore }} onlyLinked />
          </section>
        )}
      </main>

      <footer className="ld-footer">
        <div className="ld-foot-grid">
          <div className="ld-foot-about">
            <div className="ld-foot-brand">
              <SalonMark salon={s} size="lg" className="ld-foot-logo" />
              <span>
                <b>{s.name}</b>
                {s.tagline && <small>{s.tagline}</small>}
              </span>
            </div>
            {s.about && <p>{s.about}</p>}
            {quick.length + socials.length > 0 && (
              <div className="ld-foot-social" aria-label="Contact and social media">
                {[...quick, ...socials].map((q) => (
                  <a
                    key={q.label}
                    href={q.href}
                    {...(q.ext ? { target: '_blank', rel: 'noopener' } : {})}
                    aria-label={q.label}
                    title={q.label}
                  >
                    <Icon name={q.icon} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <nav className="ld-foot-col" aria-label="Page sections">
            <h3>Explore</h3>
            <ul>
              {links.map(([id, label]) => (
                <li key={id}>
                  <a href={'#' + id}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>

          {(address || s.hours) && (
            <div className="ld-foot-col">
              <h3>Visit</h3>
              <ul>
                {address && (
                  <li>
                    <a href={directionsLink(s, address)} target="_blank" rel="noopener">
                      <Icon name="pin" />
                      <span>
                        {branch ? branch.name + ', ' : ''}
                        {address}
                      </span>
                    </a>
                  </li>
                )}
                {s.hours && (
                  <li>
                    <Icon name="clock" />
                    <span>{s.hours}</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {(phone || s.whatsapp || s.email) && (
            <div className="ld-foot-col">
              <h3>Contact</h3>
              <ul>
                {phone && (
                  <li>
                    <a href={telLink(phone)}>
                      <Icon name="phone" />
                      <span>{phone}</span>
                    </a>
                  </li>
                )}
                {s.whatsapp && (
                  <li>
                    <a href={waLink(s.whatsapp)} target="_blank" rel="noopener">
                      <Icon name="chat" />
                      <span>WhatsApp us</span>
                    </a>
                  </li>
                )}
                {s.email && (
                  <li>
                    <a href={'mailto:' + s.email}>
                      <Icon name="mail" />
                      <span>{s.email}</span>
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="ld-foot-bottom">
          <small>
            © {new Date().getFullYear()} {s.name}. Token booking by{' '}
            <Link to="/" className="ld-foot-bquee">
              BQuee
            </Link>
            .
          </small>
          <a href="#top" className="ld-foot-top-link">
            Back to top <Icon name="chevr" className="up" />
          </a>
        </div>
      </footer>

      {open.length > 0 && (
        <div className={'ld-bar' + (showBar ? ' show' : '')} aria-hidden={!showBar}>
          <span>
            {scoped ? (
              <>
                <b>{d.branches[0].wait ? '~' + waitText(d.branches[0].wait) + ' wait' : 'No wait right now'}</b>
                <small>{plural(d.branches[0].waiting || 0, 'person', 'people')} in the queue</small>
              </>
            ) : (
              <>
                <b>{plural(open.length, 'branch', 'branches')} open</b>
                <small>Pick one to book</small>
              </>
            )}
          </span>
          <Button variant="primary" onClick={book} iconRight="arrow" tabIndex={showBar ? 0 : -1}>
            Book a token
          </Button>
        </div>
      )}

      {dialog === 'check' && <CheckTokenDialog onClose={() => setDialog(null)} />}
      {dialog === 'branches' && (
        <Dialog
          title={pickOffer ? 'Choose a branch for ' + pickOffer.title : 'Choose a branch'}
          width={460}
          onClose={() => setDialog(null)}
        >
          <ul className="branch-pick">
            {open.map((b) => (
              <li key={b.id}>
                <Link to={pickOffer ? bookPath(linkOf(b), pickOffer) : '/b/' + linkOf(b)}>
                  <span>
                    <b>{b.name}</b>
                    <small>{b.address}</small>
                  </span>
                  <span className={'wait-tag' + (b.wait ? '' : ' free')}>
                    {b.wait ? '~' + waitText(b.wait) : 'No wait'}
                  </span>
                  <Icon name="chevr" />
                </Link>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </div>
  );
}

/** The "about" text, cut to a few lines so the Visit card keeps its size; "Read more" shows the rest. */
function About({ text }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  return (
    <>
      <p className={'ld-about' + (long && !open ? ' clamp' : '')}>{text}</p>
      {long && (
        <button type="button" className="ld-more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </>
  );
}
