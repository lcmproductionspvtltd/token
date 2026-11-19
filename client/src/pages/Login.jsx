/*
 * Sign-in.
 *   /login              – the platform sign-in (super admin, and any salon account)
 *   /s/<salon>/login    – a salon's own sign-in page: its logo, name, photo and colour.
 *                         Only that salon's owner and staff can sign in here.
 */

import { useEffect, useRef, useState } from 'react';
import { api, currentUser, homeFor, setSession, writeStored } from '../core/api.js';
import { applyBrand } from '../core/format.js';
import { Link, Redirect, navigate } from '../core/router.jsx';
import { Button, ErrorPage, Icon, PageLoader, SalonMark, useLoad } from '../core/ui.jsx';
import { DEFAULT_COVER } from '../customer/parts.jsx';
import { MfaStep } from './MfaStep.jsx';

export function SalonLogin({ slug, query }) {
  const { data, error } = useLoad(() => api('GET', '/api/public/salon/' + encodeURIComponent(slug)), [slug]);
  if (error) return <ErrorPage message={error.message} />;
  if (!data) return <PageLoader />;
  return <Login query={query} salon={data.salon} />;
}

export function Login({ query, salon }) {
  const user = currentUser();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null); // two-step sign-in step (owners), after the right password
  const form = useRef(null);

  useEffect(() => {
    applyBrand(salon && salon.color);
    document.title = 'Sign in · ' + (salon ? salon.name : 'BQuee');
    // Focus the first field unless the user (or a password manager) already started typing.
    const t = setTimeout(() => {
      if (form.current && !form.current.contains(document.activeElement)) form.current.elements.username.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [salon && salon.id]);

  if (user && !busy) return <Redirect to={homeFor(user)} />;

  const finish = (r) => {
    // Remember the salon so a later "please sign in" sends this person back to its page.
    writeStored('sq_last_salon', r.user.salonSlug || null);
    setBusy(true);
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
      const r = await api('POST', '/api/login', {
        username: login.trim(),
        password,
        salon: salon ? salon.slug : undefined,
      });
      if (r.mfa) {
        setMfa(r.mfa);
        setPassword('');
        setBusy(false);
        return;
      }
      finish(r);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className={'auth' + (salon ? ' salon' : '')}>
      {salon ? (
        <aside className="auth-side" style={{ '--cover': `url("${salon.cover || DEFAULT_COVER}")` }}>
          <Link to={'/s/' + salon.slug} className="auth-salon-top">
            <Icon name="arrowl" /> {salon.name}
          </Link>
          <div className="auth-salon">
            <SalonMark salon={salon} size="lg" className="auth-salon-mark" />
            <h2>{salon.name}</h2>
            {salon.tagline && <p>{salon.tagline}</p>}
          </div>
          <p className="auth-quote">Owner and staff sign-in</p>
        </aside>
      ) : (
        <aside className="auth-side">
          <Link to="/" className="auth-logo" aria-label="BQuee home">
            <img src="/img/brand/bquee-logo-light.png" alt="BQuee" width="160" height="38" />
          </Link>
          <div className="auth-stack" aria-hidden="true">
            <div className="mini-ticket t3">
              <span>A-014</span>
              <em>Waiting · ~25 min</em>
            </div>
            <div className="mini-ticket t2">
              <span>A-013</span>
              <em>Waiting · ~10 min</em>
            </div>
            <div className="mini-ticket t1">
              <span>A-012</span>
              <em>In service</em>
            </div>
          </div>
          <p className="auth-quote">One sign-in for super admins, service owners and staff.</p>
        </aside>
      )}

      <main className="auth-main">
        {mfa ? (
          <div className="auth-form">
            <MfaStep mfa={mfa} onDone={finish} onCancel={() => setMfa(null)} />
          </div>
        ) : (
          <form ref={form} className="auth-form" onSubmit={submit} noValidate>
            {salon && <SalonMark salon={salon} size="lg" className="auth-form-mark" />}
            <h1>{salon ? 'Welcome back' : 'Sign in'}</h1>
            <p className="auth-sub">
              {salon ? `Sign in to ${salon.name}’s dashboard.` : 'Open your business dashboard.'}
            </p>
            <label className="field">
              <span className="field-label">Username or email</span>
              <input
                name="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                placeholder={salon ? 'Your username or email' : 'e.g. owner or you@business.com'}
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <span className="pw">
                <input
                  name="password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Your password"
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  aria-pressed={show}
                >
                  <Icon name={show ? 'x' : 'eye'} />
                </button>
              </span>
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="block" busy={busy} iconRight="arrow">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="auth-help">
              {salon
                ? 'Forgot your password? Staff can ask the service owner to set a new one.'
                : 'Forgot your password? Staff can ask their service owner. Service owners can contact their BQuee provider.'}
            </p>
          </form>
        )}
        <Link to={salon ? '/s/' + salon.slug : '/'} className="auth-back">
          <Icon name="arrowl" /> {salon ? 'Back to ' + salon.name : 'Back to home'}
        </Link>
      </main>
    </div>
  );
}

/** Where a salon person should sign in: their salon's page if known, otherwise /login. */
export function loginPathFor(user, next) {
  let slug = user && user.salonSlug;
  if (!slug && !user) {
    try {
      slug = JSON.parse(localStorage.getItem('sq_last_salon') || 'null');
    } catch (err) {
      slug = null;
    }
  }
  const base = slug ? '/s/' + slug + '/login' : '/login';
  return next ? base + '?next=' + encodeURIComponent(next) : base;
}
