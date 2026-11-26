/*
 * Codes sent by email (src/routes/email.js):
 *   <EmailCodeField …/>    sign-up: the email, a "Send code" button and the code from the email
 *   <EmailCodeStep …/>     sign-in after too many wrong passwords: the code we emailed
 *   <ForgotForm …/>        forgot password: email → code + new password → done
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../core/api.js';
import { Link } from '../core/router.jsx';
import { Button, Icon } from '../core/ui.jsx';

const digits = (v) => v.replace(/\D/g, '').slice(0, 6);

/** The 6-digit code input (numbers only, filled by the phone's "code from email" suggestion). */
function CodeInput({ value, onChange, inputRef, label = 'Code from the email' }) {
  return (
    <label className="field mfa-field">
      <span className="field-label">{label}</span>
      <input
        ref={inputRef}
        name="emailcode"
        value={value}
        onChange={(e) => onChange(digits(e.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="123456"
        className="mfa-digits"
      />
    </label>
  );
}

/**
 * Sign-up: email + "Send code" + the code. Calls onChange({ email, ticket, code }).
 * `purpose`: 'signup' (business) or 'customer-signup'.
 */
export function EmailCodeField({ value, onChange, purpose = 'signup' }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const code = useRef(null);
  const set = (patch) => onChange({ ...value, ...patch });
  const changed = sentTo && sentTo !== value.email.trim().toLowerCase();

  const send = async () => {
    const email = value.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email first.');
    setError('');
    setBusy(true);
    try {
      const r = await api('POST', '/api/email-code', { email, purpose });
      set({ ticket: r.ticket, code: '' });
      setSentTo(email.toLowerCase());
      setNote(`We emailed a 6-digit code to ${email}. It works for ${r.minutes} minutes.`);
      setTimeout(() => code.current && code.current.focus(), 60);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="email-code">
      <label className="acct-field">
        <span className="acct-label">Email *</span>
        <span className="acct-input">
          <Icon name="mail" />
          <input
            value={value.email}
            onChange={(e) => set({ email: e.target.value, ...(sentTo ? { ticket: '', code: '' } : {}) })}
            type="email"
            autoComplete="email"
            placeholder="you@business.com"
            maxLength={120}
          />
          <Button type="button" variant="soft" size="sm" busy={busy} onClick={send}>
            {sentTo && !changed ? 'Send again' : 'Send code'}
          </Button>
        </span>
      </label>
      {value.ticket && !changed ? (
        <>
          <p className="email-code-note">
            <Icon name="mail" /> {note}
          </p>
          <CodeInput value={value.code} onChange={(c) => set({ code: c })} inputRef={code} />
        </>
      ) : (
        <p className="email-code-note">We’ll email you a code to confirm it’s your email.</p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The emailed sign-in code: every business owner sign-in, or any account after too many wrong
 * passwords. `onResult(r)` gets the sign-in answer – a session, or { mfa } for the two-step code.
 */
export function EmailCodeStep({ step, onResult, onCancel }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => input.current && input.current.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return setError('Enter the 6-digit code from the email.');
    setError('');
    setBusy(true);
    try {
      onResult(await api('POST', '/api/login/email-code', { ticket: step.ticket, code }));
    } catch (err) {
      setError(err.message);
      setCode('');
      setBusy(false);
    }
  };

  return (
    <form className="mfa" onSubmit={submit} noValidate>
      <span className="mfa-badge">
        <Icon name="mail" /> Sign-in code
      </span>
      <h1>Check your email</h1>
      <p className="mfa-sub">{step.message}</p>
      <CodeInput value={code} onChange={setCode} inputRef={input} />
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="block" busy={busy} iconRight="arrow">
        {busy ? 'Checking…' : 'Sign in'}
      </Button>
      <div className="mfa-links">
        <button type="button" className="link-btn" onClick={onCancel}>
          Back to sign in
        </button>
        <Link to="/forgot">Forgot your password?</Link>
      </div>
    </form>
  );
}

/** Forgot password (business accounts): email → code + new password → done. */
export function ForgotForm({ query, available = true }) {
  const [email, setEmail] = useState((query && query.get('email')) || '');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const codeInput = useRef(null);
  const back = (query && query.get('back')) || '/login';
  const backTo = back.startsWith('/') && !back.startsWith('//') ? back : '/login';

  const ask = async (e) => {
    if (e) e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter the email of your account.');
    setError('');
    setBusy(true);
    try {
      const r = await api('POST', '/api/password/forgot', { email: email.trim() });
      setTicket(r.ticket);
      setCode('');
      setTimeout(() => codeInput.current && codeInput.current.focus(), 60);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const reset = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return setError('Enter the 6-digit code from the email.');
    if (password.length < 8) return setError('Choose a new password of at least 8 characters.');
    setError('');
    setBusy(true);
    try {
      await api('POST', '/api/password/reset', { ticket, code, password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  if (!available)
    return (
      <div className="acct-form">
        <h1>Forgot your password?</h1>
        <p className="acct-sub">
          Staff can ask their business owner to set a new password. Business owners can contact the BQuee team at
          info@bquee.com.
        </p>
        <Link to={backTo} className="btn primary block">
          <span>Back to sign in</span>
        </Link>
      </div>
    );
  if (done)
    return (
      <div className="acct-form acct-done">
        <span className="acct-done-ico">
          <Icon name="check" />
        </span>
        <h1>Password changed</h1>
        <p className="acct-sub">
          Sign in with your new password. For safety, you’ve been signed out on every other device.
        </p>
        <Link to={backTo} className="btn primary block">
          <span>Go to sign in</span>
        </Link>
      </div>
    );

  return (
    <form className="acct-form" onSubmit={ticket ? reset : ask} noValidate>
      <h1>Forgot your password?</h1>
      {!ticket ? (
        <>
          <p className="acct-sub">
            Enter the email of your business account. We’ll email you a code to choose a new password.
          </p>
          <label className="acct-field">
            <span className="acct-label">Email</span>
            <span className="acct-input">
              <Icon name="mail" />
              <input
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@business.com"
                maxLength={120}
              />
            </span>
          </label>
        </>
      ) : (
        <>
          <p className="acct-sub">
            If <b>{email.trim()}</b> belongs to a BQuee account, we’ve emailed it a 6-digit code. It works for 15
            minutes. No email? Check spam, or{' '}
            <button type="button" className="link-btn" onClick={() => ask()}>
              send it again
            </button>
            .
          </p>
          <CodeInput value={code} onChange={setCode} inputRef={codeInput} />
          <label className="acct-field">
            <span className="acct-label">New password</span>
            <span className="acct-input">
              <Icon name="lock" />
              <input
                name="password"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="8+ characters"
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
        </>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="block" busy={busy} iconRight="arrow">
        {ticket ? (busy ? 'Saving…' : 'Set new password') : busy ? 'Sending…' : 'Email me a code'}
      </Button>
      <p className="acct-fine">
        Staff without an email: ask your business owner to set a new password.{' '}
        <Link to={backTo}>Back to sign in</Link>
      </p>
    </form>
  );
}
