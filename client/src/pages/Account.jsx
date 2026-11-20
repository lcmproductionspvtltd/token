/*
 * Platform sign-in and business sign-up on one page, in two tabs (/login and /signup).
 * Uses the home page header and footer. Only business owners can sign up –
 * staff are added by their owner and the BQuee team by the super admin.
 * A business's own branded sign-in (/s/<business>/login) stays in Login.jsx.
 */

import { useEffect, useRef, useState } from 'react';
import { api, currentUser, homeFor, setSession, writeStored } from '../core/api.js';
import { applyBrand } from '../core/format.js';
import { Redirect, navigate, useLocation } from '../core/router.jsx';
import { Icon, LinkButton } from '../core/ui.jsx';
import { BookingModes } from '../core/BookingModes.jsx';
import { StepBar } from '../core/Steps.jsx';
import { SiteFooter, SiteHeader, forgetReferral, rememberReferral, savedReferral, useSite } from './Home.jsx';
import { MfaStep } from './MfaStep.jsx';
import { CurrencyPicker, priceIn, useCurrency } from '../core/currency.jsx';

const EMPTY = {
  businessName: '',
  categoryId: '',
  serviceMode: 'multiple',
  staffMode: 'multiple',
  ownerName: '',
  mobile: '',
  email: '',
  username: '',
  password: '',
  website: '',
};

/** The sign-up form's steps, in order. */
const SIGNUP_STEPS = ['Business', 'Booking', 'Your account'];

const POINTS = [
  ['qr', 'Your own booking page and QR code'],
  ['clock', 'Live queue and waiting time for every customer'],
  ['camera', 'Staff app to scan and serve'],
  ['chart', 'Reports with Excel export'],
];

/** Text box with an icon inside it. */
function AField({ label, icon, hint, children }) {
  return (
    <label className="acct-field">
      <span className="acct-label">{label}</span>
      <span className="acct-input">
        <Icon name={icon} />
        {children}
      </span>
      {hint && <span className="acct-hint">{hint}</span>}
    </label>
  );
}

function PasswordInput({ value, onChange, autoComplete, placeholder, name }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <input
        name={name}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="acct-eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        <Icon name={show ? 'x' : 'eye'} />
      </button>
    </>
  );
}

/**
 * "Continue with Google / Apple" for business owners – only shown for providers set up on the server.
 * The browser goes to Google/Apple and comes back to /login?social=… (see src/routes/oauth.js).
 */
function SocialButtons({ site, verb = 'Continue' }) {
  const on = (site && site.social) || {};
  if (!on.google && !on.apple) return null;
  return (
    <div className="acct-social">
      {on.google && (
        <a className="btn soft lg block social-btn" href="/api/oauth/google/start?client=web">
          <span className="social-mark g" aria-hidden="true">
            G
          </span>
          <span>{verb} with Google</span>
        </a>
      )}
      {on.apple && (
        <a className="btn soft lg block social-btn" href="/api/oauth/apple/start?client=web">
          <span className="social-mark a" aria-hidden="true">
            <Icon name="phoneapp" />
          </span>
          <span>{verb} with Apple</span>
        </a>
      )}
      <p className="acct-or">
        <span>or with your {verb === 'Continue' ? 'username' : 'details'}</span>
      </p>
    </div>
  );
}

function SignInForm({ query }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null); // two-step sign-in step, after the right password
  const form = useRef(null);
  const site = useSite();

  // Back from Google/Apple: pick up the ticket (signed in, a two-step code, or off to sign up).
  useEffect(() => {
    const failed = query.get('social_error');
    if (failed) setError(failed);
    const ticket = query.get('social');
    if (!ticket) return;
    setBusy(true);
    api('POST', '/api/oauth/exchange', { ticket })
      .then((r) => {
        if (r.signup) return navigate('/signup?social=' + encodeURIComponent(ticket), { replace: true });
        if (r.mfa) {
          setMfa(r.mfa);
          setBusy(false);
          return;
        }
        finish(r);
      })
      .catch((err) => {
        setError(err.message);
        setBusy(false);
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (form.current && !form.current.contains(document.activeElement) && window.innerWidth > 720)
        form.current.elements.username.focus();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const finish = (r) => {
    writeStored('sq_last_salon', r.user.salonSlug || null);
    setSession(r);
    const next = query.get('next');
    navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(r.user), { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!login.trim() || !password) return setError('Enter your username or email, and your password.');
    setError('');
    setBusy(true);
    try {
      const r = await api('POST', '/api/login', { username: login.trim(), password });
      if (r.mfa) {
        setMfa(r.mfa);
        setBusy(false);
        setPassword('');
        return;
      }
      finish(r);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (mfa)
    return (
      <div className="acct-form">
        <MfaStep mfa={mfa} onDone={finish} onCancel={() => setMfa(null)} />
      </div>
    );

  return (
    <form ref={form} className="acct-form" onSubmit={submit} noValidate>
      <h1>Welcome back</h1>
      <p className="acct-sub">
        Sign in to your dashboard. One sign-in for super admins, the BQuee team, business owners and staff.
      </p>
      <SocialButtons site={site} />
      <AField label="Username or email" icon="user">
        <input
          name="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
          placeholder="e.g. owner or you@business.com"
        />
      </AField>
      <AField label="Password" icon="lock">
        <PasswordInput
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Your password"
        />
      </AField>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className={'btn primary lg block' + (busy ? ' is-busy' : '')} type="submit" disabled={busy}>
        <span>{busy ? 'Signing in…' : 'Sign in'}</span>
        {!busy && <Icon name="arrow" />}
      </button>
      <p className="acct-fine">
        Forgot your password? Staff can ask their business owner. Business owners can contact the BQuee team.
      </p>
    </form>
  );
}

function SignUpForm({ site, onPending, query }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ref, setRef] = useState(null); // { code, name }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [at, setAt] = useState(0);
  const [mfa, setMfa] = useState(null); // only if this account must use two-step sign-in
  const top = useRef(null);
  // Signing up with Google/Apple: { ticket, provider, email, name } – no username or password needed.
  const [social, setSocial] = useState(null);
  useEffect(() => {
    const ticket = query && query.get('social');
    if (!ticket) return;
    api('POST', '/api/oauth/exchange', { ticket })
      .then((r) => {
        if (!r.signup) return;
        setSocial(r.signup);
        setF((x) => ({ ...x, ownerName: x.ownerName || r.signup.name, email: r.signup.email }));
      })
      .catch((err) => setError(err.message));
  }, []);

  // Invited through a referral link? Show who invited them.
  useEffect(() => {
    rememberReferral();
    const code = savedReferral();
    if (!code) return;
    api('GET', '/api/public/referral/' + encodeURIComponent(code))
      .then((r) => setRef({ code, name: r.name }))
      .catch(() => forgetReferral());
  }, []);
  const trial = site && site.signup && !site.signup.approval ? site.signup.trialDays : 0;
  // When the home page shows pricing, the owner picks one of those packages.
  const packages = site && site.sections && site.sections.plans ? site.plans || [] : [];
  const [pkg, setPkg] = useState('');
  // Prices in the owner's own currency (their country, or the one they pick); the server works out
  // the amount again from the package and this currency.
  const [currency, setCurrency] = useCurrency(site);
  useEffect(() => {
    if (packages.length && !packages.some((p) => p.name === pkg))
      setPkg((packages.find((p) => p.highlight) || packages[0]).name);
  }, [packages.length]);

  const done = (r) => {
    writeStored('sq_last_salon', r.user.salonSlug || null);
    setSession(r);
    navigate(homeFor(r.user), { replace: true });
  };

  /** Moves to another step and brings the top of the form into view. */
  const go = (i) => {
    setError('');
    setAt(i);
    if (top.current && top.current.getBoundingClientRect().top < 0)
      top.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (at === 0 && !f.businessName.trim()) return setError('Enter your business name.');
    if (at < SIGNUP_STEPS.length - 1) return go(at + 1);
    if (!f.ownerName.trim() || !f.mobile.trim() || (!social && (!f.username.trim() || !f.password))) {
      setError('Fill in every field marked *');
      return;
    }
    setBusy(true);
    try {
      const r = await api('POST', '/api/public/signup', {
        ...f,
        username: f.username.trim().toLowerCase(),
        ref: ref ? ref.code : '',
        channel: 'web',
        package: packages.length ? pkg : '',
        currency: packages.length ? currency : '',
        ...(social ? { social: social.ticket } : {}),
      });
      forgetReferral();
      if (r.pending) {
        onPending(r.business);
        return;
      }
      if (r.mfa) {
        setMfa(r.mfa);
        setBusy(false);
        return;
      }
      done(r);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  // Account created: the owner turns on two-step sign-in before the dashboard opens. Cancelling
  // leaves the account as it is; they set it up at their next sign-in.
  if (mfa)
    return (
      <div className="acct-form" ref={top}>
        <MfaStep mfa={mfa} onDone={done} onCancel={() => navigate('/login', { replace: true })} />
      </div>
    );

  return (
    <form className="acct-form" onSubmit={submit} noValidate ref={top}>
      <h1>Sign up your business</h1>
      <p className="acct-sub">
        {trial
          ? `Start with a ${trial}-day free trial. No card needed.`
          : 'We’ll review your sign-up and switch your account on.'}
      </p>

      {ref && (
        <p className="signup-ref">
          <Icon name="share" /> Invited by <b>{ref.name}</b>
        </p>
      )}
      <div className="signup-role" aria-label="Account type">
        <Icon name="store" />
        <span>
          <small>Signing up as</small>
          <b>Business owner</b>
        </span>
        <em>
          <Icon name="lock" /> Staff are added by their owner
        </em>
      </div>

      {!social && at === 0 && <SocialButtons site={site} verb="Sign up" />}
      <StepBar steps={SIGNUP_STEPS} at={at} onPick={go} />
      {at === 0 && (
        <>
          {packages.length > 0 && (
            <AField label="Package *" icon="tag">
              <select value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label="Package">
                {packages.map((p) => (
                  <option key={p.name} value={p.name}>
                    {packageLabel(p, currency)}
                  </option>
                ))}
              </select>
            </AField>
          )}
          {packages.length > 0 && (
            <CurrencyPicker site={site} code={currency} onPick={setCurrency} className="in-form" />
          )}
          <AField label="Business name *" icon="store">
            <input
              value={f.businessName}
              onChange={set('businessName')}
              placeholder="e.g. Lotus Salon & Spa"
              autoComplete="organization"
              maxLength={80}
            />
          </AField>
          {site && site.categories && site.categories.length > 0 && (
            <AField label="Business type" icon="grid">
              <select value={f.categoryId} onChange={set('categoryId')}>
                <option value="">Choose a type</option>
                {site.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </AField>
          )}
        </>
      )}
      {at === 1 && (
        <div className="acct-field">
          <span className="acct-label">How customers book</span>
          <BookingModes
            serviceMode={f.serviceMode}
            staffMode={f.staffMode}
            onChange={(k, val) => setF((x) => ({ ...x, [k]: val }))}
          />
        </div>
      )}
      {at === 2 && (
        <>
          <div className="acct-two">
            <AField label="Your name *" icon="user">
              <input
                value={f.ownerName}
                onChange={set('ownerName')}
                autoComplete="name"
                maxLength={80}
                placeholder="Full name"
              />
            </AField>
            <AField label="Mobile *" icon="phone">
              <input
                value={f.mobile}
                onChange={set('mobile')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                placeholder="Mobile number"
              />
            </AField>
          </div>
          {social ? (
            <p className="acct-social-note">
              <Icon name="check" /> Signing up with {social.provider === 'apple' ? 'Apple' : 'Google'} as{' '}
              <b>{social.email}</b> – you’ll sign in with {social.provider === 'apple' ? 'Apple' : 'Google'}, no
              password needed.
            </p>
          ) : (
            <AField label="Email" icon="mail">
              <input
                value={f.email}
                onChange={set('email')}
                type="email"
                autoComplete="email"
                placeholder="you@business.com"
                maxLength={120}
              />
            </AField>
          )}
          {!social && (
            <div className="acct-two">
              <AField label="Username *" icon="user">
                <input
                  value={f.username}
                  onChange={set('username')}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  maxLength={40}
                  placeholder="For signing in"
                />
              </AField>
              <AField label="Password *" icon="lock">
                <PasswordInput
                  value={f.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                  placeholder="8+ characters"
                />
              </AField>
            </div>
          )}
        </>
      )}
      {/* Hidden from people; bots fill it in. */}
      <input
        className="hp"
        tabIndex={-1}
        autoComplete="off"
        value={f.website}
        onChange={set('website')}
        aria-hidden="true"
        name="website"
      />

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="acct-step-actions">
        {at > 0 && (
          <button type="button" className="btn quiet lg" onClick={() => go(at - 1)}>
            <Icon name="back" />
            <span>Back</span>
          </button>
        )}
        <button className={'btn primary lg block' + (busy ? ' is-busy' : '')} type="submit" disabled={busy}>
          <span>
            {at < SIGNUP_STEPS.length - 1 ? 'Next' : busy ? 'Creating your account…' : 'Create my business account'}
          </span>
          {!busy && <Icon name="arrow" />}
        </button>
      </div>
      <p className="acct-fine">
        You’ll sign in as the business owner and can add branches, services and staff right away.
      </p>
    </form>
  );
}

/** One line for the package dropdown: "Business – ₹999 per month (popular)", "Starter – Free · 14-day trial". */
const packageLabel = (p, currency) => {
  const period = p.period ? (/^per\b/i.test(p.period) ? ' ' : ' · ') + p.period : '';
  const price = priceIn(p, currency);
  return p.name + (price ? ` – ${price}${period}` : '') + (p.highlight ? ' (popular)' : '');
};

export function Account({ query }) {
  const site = useSite();
  const user = currentUser();
  const { path } = useLocation();
  const tab = path === '/signup' ? 'signup' : 'signin';
  const [pending, setPending] = useState(null);

  useEffect(() => {
    applyBrand();
  }, []);
  useEffect(() => {
    document.title = (tab === 'signup' ? 'Sign up your business' : 'Sign in') + ' – BQuee';
  }, [tab]);

  if (user) return <Redirect to={homeFor(user)} />;

  const signupOpen = !site || (site.signup && site.signup.enabled);
  const trial = site && site.signup && site.signup.enabled && !site.signup.approval ? site.signup.trialDays : 0;
  const switchTo = (t) => {
    const q = query.toString();
    navigate((t === 'signup' ? '/signup' : '/login') + (q ? '?' + q : ''), { replace: true, keepScroll: true });
  };
  const show = tab === 'signup' && !signupOpen ? 'closed' : tab;

  return (
    <div className="site">
      <SiteHeader site={site} tab={tab} />
      <main>
        <section className="acct">
          <div className="site-wrap acct-in">
            <div className="acct-copy">
              <span className="site-badge">
                <Icon name="sparkle" /> QR token booking for every business
              </span>
              <h2>
                {tab === 'signup' ? 'Bring your business online in minutes' : 'Your queue, live – wherever you are'}
              </h2>
              <ul className="acct-points">
                {POINTS.map(([icon, text]) => (
                  <li key={text}>
                    <span>
                      <Icon name={icon} />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
              {trial ? (
                <p className="site-note">
                  <Icon name="check" /> {trial}-day free trial · no card needed
                </p>
              ) : null}
            </div>

            <div className="acct-card">
              {pending ? (
                <div className="acct-form acct-done">
                  <span className="acct-done-ico">
                    <Icon name="check" />
                  </span>
                  <h1>Thanks – you’re signed up</h1>
                  <p className="acct-sub">
                    We’re checking <b>{pending}</b>. You can sign in as soon as we switch your account on – usually
                    within a day.
                  </p>
                  <LinkButton to="/" variant="soft" className="block">
                    Back to home
                  </LinkButton>
                </div>
              ) : (
                <>
                  <div className="acct-tabs" role="tablist" aria-label="Sign in or sign up">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === 'signin'}
                      className={tab === 'signin' ? 'on' : ''}
                      onClick={() => switchTo('signin')}
                    >
                      <Icon name="lock" /> Sign in
                    </button>
                    {signupOpen && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'signup'}
                        className={tab === 'signup' ? 'on' : ''}
                        onClick={() => switchTo('signup')}
                      >
                        <Icon name="store" /> Sign up
                      </button>
                    )}
                  </div>
                  <div role="tabpanel">
                    {show === 'signin' && <SignInForm query={query} />}
                    {show === 'signup' && <SignUpForm site={site} onPending={setPending} query={query} />}
                    {show === 'closed' && (
                      <div className="acct-form">
                        <h1>Sign-up is closed</h1>
                        <p className="acct-sub">
                          New businesses can’t sign up online right now. Please contact us and we’ll set you up.
                        </p>
                        <button type="button" className="btn primary block" onClick={() => switchTo('signin')}>
                          <span>Go to sign in</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="acct-switch">
                    {tab === 'signin' ? (
                      signupOpen && (
                        <>
                          New business?{' '}
                          <button type="button" onClick={() => switchTo('signup')}>
                            Sign up as a business owner
                          </button>
                        </>
                      )
                    ) : (
                      <>
                        Already have an account?{' '}
                        <button type="button" onClick={() => switchTo('signin')}>
                          Sign in
                        </button>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter site={site} />
    </div>
  );
}
