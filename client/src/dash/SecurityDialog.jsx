/* Account menu → Sign-in security: two-step sign-in status, new backup codes, signed-in devices. */

import { useState } from 'react';
import { api } from '../core/api.js';
import { dayText } from '../core/format.js';
import { Button, Dialog, Icon, Pill, toast, useLoad } from '../core/ui.jsx';
import { BackupCodes } from '../pages/MfaStep.jsx';
import { handleError } from './Shell.jsx';

export function SecurityDialog({ onClose }) {
  const mfa = useLoad(() => api('GET', '/api/me/mfa'), []);
  const devices = useLoad(() => api('GET', '/api/me/sessions'), []);
  const [code, setCode] = useState('');
  const [asking, setAsking] = useState(false);
  const [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false);

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
          {m && (m.enabled ? <Pill status="on">On</Pill> : <Pill status="off">Not needed for staff</Pill>)}
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
          </>
        )}
        {m && !m.enabled && (
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
