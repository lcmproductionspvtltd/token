/* Two-step sign-in status of another person's account, with "Reset" for a lost phone
   (super admin: owners and team; team members with "edit businesses": owners). */

import { useState } from 'react';
import { api } from '../core/api.js';
import { Button, Pill, confirmAction, toast } from '../core/ui.jsx';
import { handleError } from './Shell.jsx';

export function MfaResetRow({ userId, name, enabled, onDone }) {
  const [on, setOn] = useState(enabled);
  const reset = async () => {
    const ok = await confirmAction({
      title: 'Reset two-step sign-in for ' + name + '?',
      message:
        'Use this when they lost their phone. They are signed out everywhere and set up their authenticator app again at their next sign-in.',
      confirm: 'Reset',
    });
    if (!ok) return;
    try {
      await api('POST', '/api/admin/users/' + userId + '/mfa-reset');
      toast('Two-step sign-in reset for ' + name);
      setOn(false);
      if (onDone) onDone();
    } catch (err) {
      handleError(err);
    }
  };
  return (
    <div className="mfa-row">
      <span>
        <b>Two-step sign-in</b>
        <small>
          {on
            ? 'Set up – a code from their authenticator app is asked at every sign-in.'
            : 'Not set up yet – they set it up at their next sign-in.'}
        </small>
      </span>
      {on ? <Pill status="on">On</Pill> : <Pill status="waiting">Next sign-in</Pill>}
      {on && (
        <Button size="sm" variant="danger-quiet" icon="refresh" onClick={reset}>
          Reset (lost phone)
        </Button>
      )}
    </div>
  );
}
