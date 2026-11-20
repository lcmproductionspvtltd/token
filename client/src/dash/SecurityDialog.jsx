/* Account menu → Sign-in security: two-step sign-in status, new backup codes, signed-in devices. */

import { useState } from 'react';
import { api } from '../core/api.js';
import { dayText } from '../core/format.js';
import { Button, Dialog, Icon, Pill, copyText, toast, useLoad } from '../core/ui.jsx';
import { QR } from '../lib/qr-encoder.js';
import { BackupCodes } from '../pages/MfaStep.jsx';
import { handleError } from './Shell.jsx';

export function SecurityDialog({ onClose }) {
  const mfa = useLoad(() => api('GET', '/api/me/mfa'), []);
  const devices = useLoad(() => api('GET', '/api/me/sessions'), []);
  const [code, setCode] = useState('');
  const [asking, setAsking] = useState(false);
  const [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  // Owners only: switching two-step sign-in on (setup = QR code + key) or off (needs a code).
  const [setup, setSetup] = useState(null);
  const [onCode, setOnCode] = useState('');
  const [offAsk, setOffAsk] = useState(false);
  const [offCode, setOffCode] = useState('');

  const startOn = async () => {
    setBusy(true);
    try {
      setSetup(await api('POST', '/api/me/mfa/setup'));
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };
  const confirmOn = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('POST', '/api/me/mfa/enable', { challenge: setup.challenge, code: onCode });
      setSetup(null);
      setOnCode('');
      setCodes(r.backupCodes);
      toast('Two-step sign-in is on');
      mfa.reload();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('POST', '/api/me/mfa/disable', { code: offCode.trim() });
      setOffAsk(false);
      setOffCode('');
      toast('Two-step sign-in is off');
      mfa.reload();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const renew = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('POST', '/api/me/mfa/backup-codes', { code: code.replace(/\D/g, '') });
      setCodes(r.backupCodes);
      setAsking(false);
      setCode('');
      mfa.reload();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };
  const signOutOthers = async () => {
    try {
      await api('POST', '/api/me/sessions/revoke-others');
      toast('Other devices signed out');
      devices.reload();
    } catch (err) {
      handleError(err);
    }
  };

  if (codes)
    return (
      <Dialog title="New backup codes" onClose={onClose} width={480}>
        <BackupCodes codes={codes} onContinue={() => setCodes(null)} continueLabel="Done" />
      </Dialog>
    );

  const m = mfa.data;
  const list = devices.data ? devices.data.sessions : [];
  return (
    <Dialog title="Sign-in security" onClose={onClose} width={520}>
      <section className="sec-block">
        <h3>
          <Icon name="shield" /> Two-step sign-in
          {m &&
            (m.enabled ? (
              <Pill status="on">On</Pill>
            ) : (
              <Pill status="off">{m.optional ? 'Off' : 'Not needed for staff'}</Pill>
            ))}
        </h3>
        {m && m.enabled && (
          <>
            <p>
              Each sign-in asks for a code from your authenticator app. You have <b>{m.backupCodesLeft}</b> unused
              backup
              {m.backupCodesLeft === 1 ? ' code' : ' codes'} for when your phone isn’t at hand.
            </p>
            {asking ? (
              <form className="sec-renew" onSubmit={renew}>
                <input
                  className="input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  aria-label="Code from your authenticator app"
                  autoFocus
                />
                <Button type="submit" variant="primary" size="sm" busy={busy}>
                  Make new codes
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setAsking(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <Button size="sm" variant="soft" icon="refresh" onClick={() => setAsking(true)}>
                New backup codes
              </Button>
            )}
            <p className="sec-fine">
              Lost your phone and your backup codes? Ask the super admin to reset two-step sign-in for you.
            </p>
            {m.optional &&
              (offAsk ? (
                <form className="sec-renew" onSubmit={turnOff}>
                  <input
                    className="input"
                    value={offCode}
                    onChange={(e) => setOffCode(e.target.value.slice(0, 20))}
                    autoComplete="one-time-code"
                    placeholder="6-digit code or backup code"
                    aria-label="Code to switch two-step sign-in off"
                    autoFocus
                  />
                  <Button type="submit" variant="danger" size="sm" busy={busy}>
                    Turn off
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setOffAsk(false)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <Button size="sm" variant="danger-quiet" icon="x" onClick={() => setOffAsk(true)}>
                  Turn two-step sign-in off
                </Button>
              ))}
          </>
        )}
        {m && !m.enabled && m.optional && !setup && (
          <>
            <p>
              Off – you sign in with your password only. Turn it on to also ask for a code from an authenticator app
              (Google Authenticator, Microsoft Authenticator or similar), so nobody can sign in with your password
              alone.
            </p>
            <Button size="sm" variant="primary" icon="shield" busy={busy} onClick={startOn}>
              Turn two-step sign-in on
            </Button>
          </>
        )}
        {m && !m.enabled && m.optional && setup && (
          <form className="sec-setup" onSubmit={confirmOn}>
            <ol className="mfa-steps">
              <li>
                <b>Scan this code</b> with your authenticator app (“+” or “Add account”).
                <div
                  className="mfa-qr"
                  role="img"
                  aria-label="QR code for your authenticator app"
                  dangerouslySetInnerHTML={{ __html: QR.svg(setup.uri, { margin: 2 }) }}
                />
                <span className="mfa-key">
                  <small>Can’t scan? Type this key:</small>
                  <code>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                  <button type="button" className="link-btn" onClick={() => copyText(setup.secret, 'Key copied')}>
                    Copy key
                  </button>
                </span>
              </li>
              <li>
                <b>Enter the 6-digit code</b> the app now shows for BQuee.
              </li>
            </ol>
            <div className="sec-renew">
              <input
                className="input"
                value={onCode}
                onChange={(e) => setOnCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                aria-label="Code from your authenticator app"
                autoFocus
              />
              <Button type="submit" variant="primary" size="sm" busy={busy} disabled={onCode.length !== 6}>
                Turn on
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setSetup(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {m && !m.enabled && !m.optional && (
          <p>
            Staff accounts sign in with their password. Owners, the BQuee team and the super admin also use a code from
            an authenticator app.
          </p>
        )}
      </section>

      <section className="sec-block">
        <h3>
          <Icon name="phone" /> Signed-in devices
        </h3>
        <ul className="sec-devices">
          {list.map((d, i) => (
            <li key={i}>
              <Icon name={d.client === 'web' ? 'globe' : 'phone'} />
              <span className="sec-dev-text">
                <b>{d.client === 'web' ? 'Web browser' : 'BQuee app'}</b>
                <small>
                  Signed in {dayText(new Date(d.since).toISOString().slice(0, 10))} · until{' '}
                  {dayText(new Date(d.until).toISOString().slice(0, 10))}
                </small>
              </span>
              {d.current && <Pill status="on">This device</Pill>}
            </li>
          ))}
        </ul>
        {list.length > 1 && (
          <Button size="sm" variant="danger-quiet" icon="logout" onClick={signOutOthers}>
            Sign out all other devices
          </Button>
        )}
      </section>
    </Dialog>
  );
}
