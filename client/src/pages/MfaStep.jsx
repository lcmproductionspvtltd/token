/*
 * Two-step sign-in, shown after the right password for super admins, the BQuee team and owners.
 *   setup   first time: scan the QR code (or type the key) into an authenticator app, enter its code,
 *           then save the 10 backup codes
 *   verify  later sign-ins: the 6-digit code from the app, or one backup code
 * Used by the BQuee sign-in page, the business sign-in page and business sign-up.
 *   <MfaStep mfa={answer.mfa} onDone={(result) => …} onCancel={…} />   result = { user }
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../core/api.js';
import { Button, Icon, copyText, downloadBlob } from '../core/ui.jsx';
import { QR } from '../lib/qr-encoder.js';

export function MfaStep({ mfa, onDone, onCancel }) {
  const [code, setCode] = useState('');
  const [backupMode, setBackupMode] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null); // { result, codes } after a first-time setup
  const input = useRef(null);
  const setup = mfa.step === 'setup';

  useEffect(() => {
    const t = setTimeout(() => input.current && input.current.focus(), 60);
    return () => clearTimeout(t);
  }, [backupMode]);

  const submit = async (e) => {
    e.preventDefault();
    const value = backupMode ? code.trim() : code.replace(/\D/g, '');
    if (!backupMode && value.length !== 6) return setError('Enter the 6-digit code from your authenticator app.');
    if (backupMode && value.length < 8) return setError('Enter one of your backup codes, like 4f7k-2m9q.');
    setError('');
    setBusy(true);
    try {
      const r = await api('POST', '/api/login/mfa', { challenge: mfa.challenge, code: value });
      if (r.backupCodes) setSaved({ result: r, codes: r.backupCodes });
      else onDone(r);
    } catch (err) {
      setError(err.message);
      setCode('');
      setBusy(false);
      if (err.status === 401 && /again/.test(err.message) && /sign in/.test(err.message)) setTimeout(onCancel, 1800);
    }
  };

  if (saved) return <BackupCodes codes={saved.codes} onContinue={() => onDone(saved.result)} />;

  return (
    <form className="mfa" onSubmit={submit} noValidate>
      <span className="mfa-badge">
        <Icon name="shield" /> Two-step sign-in
      </span>
      {setup ? (
        <>
          <h1>Protect your account</h1>
          <p className="mfa-sub">
            Your account needs a code from an authenticator app (Google Authenticator, Microsoft Authenticator or
            similar) each time you sign in. Set it up once – it takes a minute.
          </p>
          <ol className="mfa-steps">
            <li>
              <b>Scan this code</b> with the authenticator app (“+” or “Add account”).
              <div
                className="mfa-qr"
                role="img"
                aria-label="QR code for your authenticator app"
                dangerouslySetInnerHTML={{ __html: QR.svg(mfa.uri, { margin: 2 }) }}
              />
              <span className="mfa-key">
                <small>Can’t scan? Type this key:</small>
                <code>{mfa.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                <button type="button" className="link-btn" onClick={() => copyText(mfa.secret, 'Key copied')}>
                  Copy key
                </button>
              </span>
            </li>
            <li>
              <b>Enter the 6-digit code</b> the app now shows for BQuee.
            </li>
          </ol>
        </>
      ) : (
        <>
          <h1>Enter your code</h1>
          <p className="mfa-sub">
            {backupMode
              ? 'Type one of the backup codes you saved when you set up two-step sign-in. Each works once.'
              : 'Open your authenticator app and enter the 6-digit code for BQuee.'}
          </p>
        </>
      )}

      <label className="field mfa-field">
        <span className="field-label">{backupMode ? 'Backup code' : '6-digit code'}</span>
        <input
          ref={input}
          name="code"
          value={code}
          onChange={(e) => setCode(backupMode ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode={backupMode ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck="false"
          maxLength={backupMode ? 12 : 6}
          placeholder={backupMode ? 'xxxx-xxxx' : '123456'}
          className={backupMode ? '' : 'mfa-digits'}
        />
      </label>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="block" busy={busy} iconRight="arrow">
        {busy ? 'Checking…' : setup ? 'Turn on and sign in' : 'Sign in'}
      </Button>
      <div className="mfa-links">
        {!setup && (
          <button
            type="button"
            className="link-btn"
            onClick={() => (setBackupMode((v) => !v), setCode(''), setError(''))}
          >
            {backupMode ? 'Use the authenticator app' : 'Lost your phone? Use a backup code'}
          </button>
        )}
        <button type="button" className="link-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="mfa-fine">
        The code changes every 30 seconds. If it isn’t accepted, check that your phone’s time is set automatically.
      </p>
    </form>
  );
}

/** The 10 one-time backup codes, shown once after setup (and when new ones are made). */
export function BackupCodes({ codes, onContinue, continueLabel = 'I’ve saved them – continue' }) {
  const text = 'BQuee backup codes – each works once\n\n' + codes.join('\n') + '\n';
  return (
    <div className="mfa">
      <span className="mfa-badge on">
        <Icon name="check" /> Two-step sign-in is on
      </span>
      <h1>Save your backup codes</h1>
      <p className="mfa-sub">
        If you lose your phone, sign in with one of these codes instead of the app code. Each code works once. Keep them
        somewhere safe – they are shown only now.
      </p>
      <ul className="mfa-codes">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <div className="mfa-actions">
        <Button variant="soft" icon="copy" onClick={() => copyText(text, 'Backup codes copied')}>
          Copy
        </Button>
        <Button
          variant="soft"
          icon="download"
          onClick={() => downloadBlob(new Blob([text], { type: 'text/plain' }), 'bquee-backup-codes.txt')}
        >
          Download
        </Button>
      </div>
      <Button variant="primary" size="lg" className="block" iconRight="arrow" onClick={onContinue}>
        {continueLabel}
      </Button>
    </div>
  );
}
