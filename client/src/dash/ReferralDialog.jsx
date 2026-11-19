/*
 * Super admin and team → "Referral links". Each person can make several links with a label
 * (e.g. "Facebook ads", "Mall stall"). Businesses that sign up through a link – or type its code
 * in the BQuee app – show as onboarded by that person, with the link's label.
 */

import { useEffect, useState } from 'react';
import { api, currentUser } from '../core/api.js';
import { dayText } from '../core/format.js';
import { Button, Dialog, Icon, Pill, copyText, toast } from '../core/ui.jsx';
import { QR } from '../lib/qr-encoder.js';
import { handleError } from './Shell.jsx';

/** Short label for how a business came onto BQuee. */
export function onboardText(o) {
  if (!o) return { who: '—', how: '' };
  const where = o.channel === 'app' ? 'BQuee app' : 'website';
  if (o.source === 'referral')
    return {
      who: o.byName || 'Referral',
      how: 'Referral link' + (o.label ? ' “' + o.label + '”' : '') + ' · ' + where,
    };
  if (o.source === 'signup') return { who: 'Direct sign-up', how: 'Signed up on the ' + where };
  const role = o.byRole === 'superadmin' ? 'Super admin' : o.byRole === 'platform_staff' ? 'BQuee team' : 'Created';
  return { who: o.byName || 'Admin', how: role + ' · ' + (o.channel === 'app' ? 'in the app' : 'on the web') };
}

const dayOf = (ms) => dayText(new Date(ms).toISOString().slice(0, 10));

function LinkCard({ link, onChange, showOwner }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(link.label);
  const url = location.origin + link.path;

  const save = async (changes) => {
    try {
      onChange(await api('PUT', '/api/admin/referral-links/' + link.id, changes));
      setEditing(false);
      toast(changes.active === false ? 'Link switched off' : changes.active ? 'Link switched on' : 'Label saved');
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <li className={'ref-item' + (link.active ? '' : ' off')}>
      <div className="ref-item-top">
        <span className="ref-item-ico">
          <Icon name="share" />
        </span>
        <div className="ref-item-main">
          {editing ? (
            <form
              className="ref-rename"
              onSubmit={(e) => {
                e.preventDefault();
                save({ label });
              }}
            >
              <input
                className="input sm"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                autoFocus
                aria-label="Link label"
              />
              <Button size="sm" variant="primary" type="submit">
                Save
              </Button>
              <Button size="sm" variant="quiet" onClick={() => (setEditing(false), setLabel(link.label))}>
                Cancel
              </Button>
            </form>
          ) : (
            <b>
              {link.label}
              {!link.active && <Pill status="off">Off</Pill>}
            </b>
          )}
          <small>
            {showOwner ? link.ownerName + ' · ' : ''}code <span className="num">{link.code.toUpperCase()}</span> · made{' '}
            {dayOf(link.createdAt)}
          </small>
        </div>
        <div className="ref-item-count">
          <b className="num">{link.referred}</b>
          <small>{link.referred === 1 ? 'business' : 'businesses'}</small>
        </div>
      </div>
      <div className="ref-link">
        <span>{url}</span>
        <Button
          size="sm"
          variant="soft"
          icon="copy"
          disabled={!link.active}
          onClick={() => copyText(url, 'Link copied')}
        >
          Copy
        </Button>
      </div>
      <div className="ref-item-actions">
        <a
          className={'btn sm ' + (link.active ? 'primary' : 'quiet is-disabled')}
          href={
            'https://wa.me/?text=' +
            encodeURIComponent('Run your queue with BQuee – QR tokens and live waiting times. Sign up here: ' + url)
          }
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!link.active}
          onClick={(e) => !link.active && e.preventDefault()}
        >
          <Icon name="chat" />
          <span>WhatsApp</span>
        </a>
        <Button size="sm" variant="quiet" icon="qr" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide QR' : 'QR code'}
        </Button>
        <Button size="sm" variant="quiet" icon="edit" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <Button size="sm" variant="quiet" icon="power" onClick={() => save({ active: !link.active })}>
          {link.active ? 'Switch off' : 'Switch on'}
        </Button>
      </div>
      {open && <div className="ref-qr" dangerouslySetInnerHTML={{ __html: QR.svg(url, { margin: 1 }) }} />}
    </li>
  );
}

export function ReferralDialog({ onClose }) {
  const isSuper = currentUser().role === 'superadmin';
  const [d, setD] = useState(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('GET', '/api/admin/referral-links').then(setD).catch(handleError);
  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!label.trim()) return toast('Give the link a label, e.g. Facebook ads', 'err');
    setBusy(true);
    try {
      await api('POST', '/api/admin/referral-links', { label: label.trim() });
      setLabel('');
      toast('Link ready');
      load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };
  const replace = (l) =>
    setD((x) => ({
      ...x,
      links: x.links.map((y) => (y.id === l.id ? l : y)),
      others: (x.others || []).map((y) => (y.id === l.id ? l : y)),
    }));

  return (
    <Dialog title="Referral links" onClose={onClose} width={680} focusFirst={false}>
      {!d ? (
        <p className="ref-loading">Loading…</p>
      ) : (
        <div className="ref">
          <p className="ref-lead">
            Make a link for each place you share it – an ad, a WhatsApp group, a visit. Businesses that sign up through
            a link (or type its code in the BQuee app) show as onboarded by you, with the link’s label.
          </p>
          <form className="ref-new" onSubmit={create}>
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="Label, e.g. Facebook ads – November"
              aria-label="New link label"
            />
            <Button variant="primary" icon="plus" type="submit" busy={busy}>
              New link
            </Button>
          </form>
          <h4 className="ref-h">My links</h4>
          <ul className="ref-list">
            {d.links.map((l) => (
              <LinkCard key={l.id} link={l} onChange={replace} />
            ))}
          </ul>
          {isSuper && d.others && d.others.length > 0 && (
            <>
              <h4 className="ref-h">Team links</h4>
              <ul className="ref-list">
                {d.others.map((l) => (
                  <LinkCard key={l.id} link={l} onChange={replace} showOwner />
                ))}
              </ul>
            </>
          )}
          {isSuper && d.people && d.people.length > 0 && (
            <div className="ref-team">
              <h4>Everyone’s onboarding</h4>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="r">Created</th>
                    <th className="r">Referred</th>
                  </tr>
                </thead>
                <tbody>
                  {d.people.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.name}</b>
                        <small>{p.role === 'superadmin' ? 'Super admin' : 'BQuee team'}</small>
                      </td>
                      <td className="r num">{p.created}</td>
                      <td className="r num">{p.referred}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
