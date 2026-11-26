/*
 * Platform sign-in and business sign-up on one page, in two tabs (/login and /signup).
 * Uses the home page header and footer. Only business owners can sign up –
 * staff are added by their owner and the BQuee team by the super admin.
 * A business's own branded sign-in (/s/<business>/login) stays in Login.jsx.
 */

import { useEffect, useRef, useState } from 'react';
import { api, currentUser, homeFor, setSession, writeStored } from '../core/api.js';
import { applyBrand } from '../core/format.js';
import { Link, Redirect, navigate, useLocation } from '../core/router.jsx';
import { Icon, LinkButton } from '../core/ui.jsx';
import { BookingModes } from '../core/BookingModes.jsx';
import { StepBar } from '../core/Steps.jsx';
import { SiteFooter, SiteHeader, forgetReferral, rememberReferral, savedReferral, useSite } from './Home.jsx';
import { MfaStep } from './MfaStep.jsx';
import { EmailCodeField, EmailCodeStep, ForgotForm } from './EmailCode.jsx';
import { deviceWhere, localCurrency, priceIn } from '../core/currency.jsx';

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
/** Google's four-colour "G" and the Apple mark, drawn inline (no outside images or fonts). */
const GoogleMark = () => (
  <svg viewBox="0 0 48 48" width="26" height="26" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);
const AppleMark = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="currentColor">
    <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.9C6.9 7.4 5.4 8.3 4.6 9.8c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.1.8c1.3 0 2.1-1.2 2.9-2.4.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.6-1-2.8-4z" />
    <path d="M14.1 5.6c.7-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z" />
  </svg>
);

/**
 * "Continue with Google / Apple" for business owners – only shown for providers set up on the server.
 * Full-width buttons, one under the other. The browser goes to Google/Apple and comes back to
 * /login?social=… (see src/routes/oauth.js).
 */
function SocialButtons({ site, signUp = false }) {
  const on = (site && site.social) || {};
  if (!on.google && !on.apple) return null;
  const both = on.google && on.apple; // side by side on one line
  return (
    <div className="acct-social">
      <div className={'social-stack' + (both ? ' two' : '')}>
        {on.google && (
          <a className="social-btn google" href="/api/oauth/google/start?client=web" aria-label="Continue with Google">
            <span className="social-mark">
              <GoogleMark />
            </span>
            <span className="social-label">
              <span className="social-verb">Continue with </span>Google
            </span>
            <Icon name="chevr" className="social-go" />
          </a>
        )}
        {on.apple && (
          <a className="social-btn apple" href="/api/oauth/apple/start?client=web" aria-label="Continue with Apple">
            <span className="social-mark">
              <AppleMark />
            </span>
            <span className="social-label">
              <span className="social-verb">Continue with </span>Apple
            </span>
            <Icon name="chevr" className="social-go" />
          </a>
        )}
      </div>
      <p className="acct-or">
        <span>or with your {signUp ? 'details' : 'username'}</span>
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
  const [emailStep, setEmailStep] = useState(null); // after too many wrong passwords: the emailed code
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
      setPassword('');
      afterPassword(r);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  /** A session, the two-step code, or (after many wrong passwords) the emailed code. */
  const afterPassword = (r) => {
    setEmailStep(null);
    if (r.emailCode) {
      setEmailStep(r.emailCode);
      setBusy(false);
      return;
    }
    if (r.mfa) {
      setMfa(r.mfa);
      setBusy(false);
      return;
    }
    finish(r);
  };

  if (mfa)
    return (
      <div className="acct-form">
        <MfaStep mfa={mfa} onDone={finish} onCancel={() => setMfa(null)} />
      </div>
    );
  if (emailStep)
    return (
      <div className="acct-form">
        <EmailCodeStep step={emailStep} onResult={afterPassword} onCancel={() => setEmailStep(null)} />
      </div>
    );

  return (
    <form ref={form} className="acct-form" onSubmit={submit} noValidate>
      <h1>Welcome back</h1>
      <p className="acct-sub">
        Sign in to your dashboard.
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
      {site && site.emailCodes ? (
        <p className="acct-fine">
          <Link to={'/forgot' + (/@/.test(login) ? '?email=' + encodeURIComponent(login.trim()) : '')}>
            Forgot your password?
          </Link>{' '}
          Staff without an email can ask their business owner.
        </p>
      ) : (
        <p className="acct-fine">
          Forgot your password? Staff can ask their business owner. Business owners can contact the BQuee team.
        </p>
      )}
    </form>
  );
}

function SignUpForm({ site, onPending, query }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ref, setRef] = useState(null); // { code, name }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [mail, setMail] = useState({ email: '', ticket: '', code: '' }); // email + its code (not with Google/Apple)
  const codes = !!(site && site.emailCodes); // email codes switched on (a mailbox can send)
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
  // Prices in the currency of the owner's country – worked out from where the device is, not picked
  // by hand. The server works out the country and the amount again from the same details.
  const currency = localCurrency(site);
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
    if (at === 0 && site && site.categories && site.categories.length && !f.categoryId)
      return setError('Choose your business type.');
    if (at < SIGNUP_STEPS.length - 1) return go(at + 1);
    if (!f.ownerName.trim() || !f.mobile.trim() || (!social && (!f.username.trim() || !f.password))) {
      setError('Fill in every field marked *');
      return;
    }
    if (codes && !social && !mail.ticket)
      return setError('Confirm your email: press “Send code” and enter the code we email you.');
    if (codes && !social && mail.code.length !== 6) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    try {
      const r = await api('POST', '/api/public/signup', {
        ...f,
        username: f.username.trim().toLowerCase(),
        ref: ref ? ref.code : '',
        channel: 'web',
        package: packages.length ? pkg : '',
        ...(packages.length ? deviceWhere() : {}),
        ...(social
          ? { social: social.ticket }
          : codes
            ? { email: mail.email.trim(), emailTicket: mail.ticket, emailCode: mail.code }
            : { email: mail.email.trim() }),
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
      {!social && at === 0 && <SocialButtons site={site} signUp />}
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
            <AField label="Business type *" icon="grid">
              <select value={f.categoryId} onChange={set('categoryId')} required aria-required="true">
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
              <Icon name="check" />
              <span>
                Signing up with {social.provider === 'apple' ? 'Apple' : 'Google'} as <b>{social.email}</b> – you’ll
                sign in with {social.provider === 'apple' ? 'Apple' : 'Google'}, no password needed.
              </span>
            </p>
          ) : codes ? (
            <EmailCodeField value={mail} onChange={setMail} />
          ) : (
            <AField label="Email" icon="mail">
              <input
                value={mail.email}
                onChange={(e) => setMail((m) => ({ ...m, email: e.target.value }))}
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
  const tab = path === '/signup' ? 'signup' : path === '/forgot' ? 'forgot' : 'signin';
  const [pending, setPending] = useState(null);

  useEffect(() => {
    applyBrand();
  }, []);
  useEffect(() => {
    document.title =
      (tab === 'signup' ? 'Sign up your business' : tab === 'forgot' ? 'Forgot password' : 'Sign in') + ' – BQuee';
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
              {tab === 'forgot' ? (
                <ForgotForm query={query} available={!site || site.emailCodes} />
              ) : pending ? (
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
                          Don’t have an account? Create one:{' '}
                          <button type="button" onClick={() => switchTo('signup')}>
                            Sign up
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
