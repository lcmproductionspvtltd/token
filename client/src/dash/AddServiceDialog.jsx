/*
 * "Add services" – staff (or the owner) add one or more services a customer asks for during
 * their visit. Each service goes to a stylist (the signed-in stylist when they do it, otherwise
 * whoever is free first). The queue maths then updates every later customer's waiting time.
 */

import { useMemo, useState } from 'react';
import { api } from '../core/api.js';
import { money, tokenNo, waitText } from '../core/format.js';
import { Avatar, Button, Dialog, Empty, Icon, Spinner, toast, useLoad } from '../core/ui.jsx';

export function AddServiceDialog({ token, currency, onClose, onDone }) {
  const { data, error } = useLoad(() => api('GET', '/api/token/' + token.id + '/services'), [token.id]);
  const [picked, setPicked] = useState({}); // serviceId → staffId
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const services = data ? data.services : [];
  const already = new Set(token.items.filter((i) => i.status !== 'done').map((i) => i.serviceId));
  const ql = query.trim().toLowerCase();
  const shown = services.filter((s) => !ql || (s.name + ' ' + (s.category || '')).toLowerCase().includes(ql));

  const defaultStaff = (svc) => {
    const online = svc.staff.filter((x) => x.online !== false);
    if (data.me && online.some((x) => x.id === data.me)) return data.me;
    return online.reduce((best, x) => (x.load < best.load ? x : best)).id;
  };
  const toggle = (svc) =>
    setPicked((p) => {
      const n = { ...p };
      if (n[svc.id]) delete n[svc.id];
      else n[svc.id] = defaultStaff(svc);
      return n;
    });

  const chosen = useMemo(
    () =>
      services.filter((s) => picked[s.id]).map((s) => ({ svc: s, staff: s.staff.find((x) => x.id === picked[s.id]) })),
    [services, picked],
  );
  const addedMinutes = chosen.reduce((a, c) => a + c.svc.duration, 0);
  const addedPrice = chosen.reduce((a, c) => a + c.svc.price, 0);
  const byStaff = {};
  for (const c of chosen) byStaff[c.staff.name] = (byStaff[c.staff.name] || 0) + c.svc.duration;

  const submit = async () => {
    if (!chosen.length) return;
    setBusy(true);
    let last = null;
    try {
      for (const c of chosen) {
        last = await api('POST', '/api/token/' + token.id + '/add-service', {
          serviceId: c.svc.id,
          staffId: c.staff.id,
        });
      }
      toast(chosen.length === 1 ? last.message : `Added ${chosen.length} services`);
      onDone(last);
      onClose();
    } catch (err) {
      toast(err.message, 'err');
      if (last) onDone(last);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={'Add services to ' + tokenNo(token)}
      onClose={onClose}
      width={600}
      className="add-svc"
      focusFirst={false}
      footer={
        <>
          <span className="add-svc-total">
            {chosen.length ? (
              <>
                <b className="num">
                  +{addedMinutes} min · {money(addedPrice, currency)}
                </b>
                <small>
                  {chosen.length} {chosen.length === 1 ? 'service' : 'services'}
                </small>
              </>
            ) : (
              <small>Pick what the customer asked for</small>
            )}
          </span>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="plus" onClick={submit} disabled={!chosen.length} busy={busy}>
            {busy ? 'Adding…' : chosen.length > 1 ? `Add ${chosen.length} services` : 'Add service'}
          </Button>
        </>
      }
    >
      <p className="add-svc-who">
        <Icon name="user" /> {token.customer.name}
        <span>· {token.items.map((i) => i.serviceName).join(', ')}</span>
      </p>

      {error ? (
        <Empty icon="x" title="Couldn’t load services">
          {error.message}
        </Empty>
      ) : !data ? (
        <div className="panel-loading">
          <Spinner />
        </div>
      ) : (
        <>
          {services.length > 6 && (
            <label className="search add-svc-search">
              <Icon name="search" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search services"
                aria-label="Search services"
              />
            </label>
          )}
          <ul className="add-svc-list">
            {shown.map((svc) => {
              const on = !!picked[svc.id];
              return (
                <li key={svc.id} className={on ? 'on' : ''}>
                  <button
                    type="button"
                    className="add-svc-row"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(svc)}
                  >
                    <span className="tick" aria-hidden="true">
                      <Icon name={on ? 'check' : 'plus'} />
                    </span>
                    <span className="add-svc-name">
                      <b>{svc.name}</b>
                      <small>
                        {svc.duration} min{svc.category ? ' · ' + svc.category : ''}
                        {already.has(svc.id) ? ' · already on this token' : ''}
                      </small>
                    </span>
                    <span className="num">{money(svc.price, currency)}</span>
                  </button>
                  {on && (
                    <div className="add-svc-staff" role="radiogroup" aria-label={'Staff member for ' + svc.name}>
                      {svc.staff
                        .slice()
                        .sort((a, b) => (a.online === false) - (b.online === false))
                        .map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            role="radio"
                            aria-checked={picked[svc.id] === st.id}
                            disabled={st.online === false}
                            className={
                              'staff-chip' +
                              (picked[svc.id] === st.id ? ' on' : '') +
                              (st.online === false ? ' offline' : '')
                            }
                            onClick={() => setPicked((p) => ({ ...p, [svc.id]: st.id }))}
                          >
                            <Avatar name={st.name} photo={st.photo} size="xs" />
                            <span>
                              {st.id === data.me ? 'Me' : st.name}
                              <small>
                                {st.online === false
                                  ? 'Offline'
                                  : st.busy
                                    ? 'Busy · ' + waitText(st.load) + ' queue'
                                    : st.load
                                      ? waitText(st.load) + ' queue'
                                      : 'Free now'}
                              </small>
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {chosen.length > 0 && (
            <p className="add-svc-note">
              <Icon name="clock" />
              Customers after this token wait longer with{' '}
              {Object.entries(byStaff)
                .map(([name, min]) => `${name} (+${min} min)`)
                .join(', ')}
              . Their waiting times update automatically.
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
