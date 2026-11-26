/*
 * Account and data deletion request (/request). Not linked from any page and not in the sitemap –
 * it is the address given to the app stores. People who are signed in can also delete their account
 * from their profile in the apps; this page is for anyone who can't.
 * The request reaches the BQuee team as a notification (same as the home page contact form).
 */

import { useEffect, useState } from 'react';
import { api } from '../core/api.js';
import { applyBrand } from '../core/format.js';
import { Button, Field, Icon } from '../core/ui.jsx';
import { Logo } from './Home.jsx';

const WHAT = [
  ['account', 'Delete my account and all its data'],
  ['data', 'Delete some of my data only'],
];
const WHO = ['Customer (BQuee app)', 'Business owner', 'Staff member'];

export function RequestPage() {
  const [f, setF] = useState({
    name: '',
    email: '',
    phone: '',
    who: WHO[0],
    what: 'account',
    details: '',
    website: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    applyBrand();
    document.title = 'Request account or data deletion | BQuee';
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.name.trim()) return setError('Enter your name.');
    if (!f.email.trim() && !f.phone.trim()) return setError('Enter the email or phone number of your account.');
    if (f.what === 'data' && !f.details.trim()) return setError('Tell us which data to delete.');
    setBusy(true);
    try {
      const what = WHAT.find(([k]) => k === f.what)[1];
      await api('POST', '/api/public/contact', {
        topic: 'deletion',
        name: f.name,
        email: f.email,
        phone: f.phone,
        website: f.website,
        message: `${what} – ${f.who}.${f.details.trim() ? ' ' + f.details.trim() : ''}`,
      });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="site legal request-page">
      <header className="request-head">
        <Logo />
      </header>
      <main className="site-wrap legal-in request-in">
        <h1>Delete your account or data</h1>
        {sent ? (
          <div className="site-form-done" role="status">
            <Icon name="check" />
            <div>
              <b>We have your request</b>
              <p>We’ll check it is your account and reply to the email or phone number you gave.</p>
            </div>
          </div>
        ) : (
          <>
            <p>
              Ask us to delete your BQuee account, or only some of your data. We may first check that the account is
              yours.
            </p>
            <ul>
              <li>Deleted: your profile (name, phone, email), sign-in details and your token history.</li>
              <li>
                Kept for a while only where the law requires it, such as invoices of a business account – then deleted.
              </li>
            </ul>
            <form className="site-form" onSubmit={submit} noValidate>
              <div className="site-form-row">
                <Field label="Your name *">
                  <input value={f.name} onChange={set('name')} autoComplete="name" maxLength={80} />
                </Field>
                <Field label="I am a">
                  <select value={f.who} onChange={set('who')}>
                    {WHO.map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="site-form-row">
                <Field label="Email of the account">
                  <input type="email" value={f.email} onChange={set('email')} autoComplete="email" maxLength={120} />
                </Field>
                <Field label="Phone of the account">
                  <input type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" maxLength={30} />
                </Field>
              </div>
              <fieldset className="site-form-choice">
                <legend>What should we delete?</legend>
                {WHAT.map(([k, label]) => (
                  <label key={k}>
                    <input type="radio" name="what" value={k} checked={f.what === k} onChange={set('what')} />
                    {label}
                  </label>
                ))}
              </fieldset>
              <Field label={f.what === 'data' ? 'Which data? *' : 'Anything else (optional)'}>
                <textarea rows={3} value={f.details} onChange={set('details')} maxLength={1500} />
              </Field>
              {/* Only bots fill this in. */}
              <input
                className="hp"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                name="website"
                value={f.website}
                onChange={set('website')}
              />
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" busy={busy} icon="trash">
                {busy ? 'Sending…' : 'Send request'}
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
