/* Owner: overview (today at a glance) and the token list with filters and CSV export. */

import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { clock, money, todayStr, tokenNo, waitText } from '../../core/format.js';
import { Link, navigate } from '../../core/router.jsx';
import {
  Avatar,
  Button,
  Empty,
  Field,
  FormDialog,
  Icon,
  Pill,
  confirmAction,
  downloadBlob,
  resetPage,
  toast,
  usePaged,
} from '../../core/ui.jsx';
import { Figures, Panel, handleError } from '../Shell.jsx';
import { AddServiceDialog } from '../AddServiceDialog.jsx';

/** "Appointment · Fri 28 Nov, 4:30 PM" – highlights tokens booked for a chosen time. */
export function ApptBadge({ t }) {
  const d = new Date(t.appointmentAt);
  const sameDay = d.toDateString() === new Date().toDateString();
  const when =
    (sameDay ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ') +
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <span className="appt-badge" title={t.upcoming ? 'Joins the queue 15 minutes before' : 'Appointment'}>
      <Icon name="calendar" />
      {t.upcoming ? 'Upcoming ' : 'Appt '}
      {when}
    </span>
  );
}

/** Owner filter: which tokens to list. Expired (unused) tokens are only ever shown to the owner. */
const SHOW = {
  all: ['All tokens', () => true],
  queue: ['In the queue', (t) => ['waiting', 'serving'].includes(t.status) && !t.upcoming],
  appointments: ['Appointments', (t) => !!t.appointmentAt],
  done: ['Completed', (t) => t.status === 'done'],
  cancelled: ['Cancelled', (t) => t.status === 'cancelled'],
  missed: ['Expired (unused)', (t) => t.status === 'missed'],
};

/** Token list – a table on wide screens, stacked rows on narrow ones. */
function TokenTable({ tokens, d, withBranch, pageKey, onChanged, empty }) {
  const { items, pager } = usePaged(pageKey, tokens);
  const [adding, setAdding] = useState(null);
  const branchName = (id) => (d.branches.find((b) => b.id === id) || {}).name || '—';

  // The owner's setting: one Start / Finish for the whole token, or one for each service.
  const whole = d.salon.tokenFlow === 'whole';
  const [acting, setActing] = useState(null);
  const act = async (t, action, index) => {
    setActing(t.id);
    try {
      const r = await api('POST', '/api/token/' + t.id + '/' + action, index != null ? { index } : {});
      toast(tokenNo(t) + ' · ' + r.message);
      onChanged();
    } catch (err) {
      handleError(err);
    } finally {
      setActing(null);
    }
  };
  // Open tokens can be started and finished until they're done or expire (they stay across the day change).
  const live = (t) => ['waiting', 'serving'].includes(t.status);

  const cancel = async (t) => {
    const ok = await confirmAction({
      title: 'Cancel token ' + tokenNo(t) + '?',
      message: `${t.customer.name} will see the token as cancelled. This can’t be undone.`,
      confirm: 'Cancel token',
    });
    if (!ok) return;
    try {
      await api('POST', '/api/token/' + t.id + '/cancel');
      toast('Token cancelled');
      onChanged();
    } catch (err) {
      handleError(err);
    }
  };

  if (!tokens.length) return empty || <Empty icon="ticket" title="No tokens yet" />;
  return (
    <>
      <div className="table-wrap">
        <table className="table tokens">
          <thead>
            <tr>
              <th>Token</th>
              <th>Customer</th>
              <th>Services</th>
              {withBranch && <th>Branch</th>}
              <th>Booked</th>
              <th>Status</th>
              <th className="r">Amount</th>
              <th className="r">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className={t.appointmentAt ? 'is-appt' : ''}>
                <td data-label="Token">
                  <Link to={'/t/' + t.id} className="tok-no num">
                    {tokenNo(t)}
                  </Link>
                  {t.appointmentAt && <ApptBadge t={t} />}
                </td>
                <td data-label="Customer">
                  <b>{t.customer.name}</b>
                  <small>{t.customer.mobile}</small>
                  {t.offer && (
                    <span className="offer-tag" title={t.offer.title + (t.offer.code ? ' · ' + t.offer.code : '')}>
                      <Icon name="gift" /> {t.offer.code || t.offer.title}
                    </span>
                  )}
                </td>
                <td data-label="Services">
                  <ul className="cell-items">
                    {t.items.map((i, k) => (
                      <li key={k}>
                        <span>
                          {i.serviceName} <small>· {i.staffName}</small>
                        </span>
                        {!whole && live(t) && i.status === 'waiting' ? (
                          <Button size="sm" variant="go" icon="play" busy={acting === t.id} onClick={() => act(t, 'start', k)}>
                            Start
                          </Button>
                        ) : !whole && live(t) && i.status === 'in_progress' ? (
                          <Button
                            size="sm"
                            variant="danger"
                            icon="stop"
                            busy={acting === t.id}
                            onClick={() => act(t, 'finish', k)}
                          >
                            Finish
                          </Button>
                        ) : (
                          <Pill status={i.status} />
                        )}
                      </li>
                    ))}
                  </ul>
                </td>
                {withBranch && <td data-label="Branch">{branchName(t.branchId)}</td>}
                <td data-label="Booked" className="nowrap">
                  {clock(t.createdAt)}
                  {t.status === 'waiting' && (
                    <small>
                      {t.upcoming ? 'in ~' + waitText(t.wait) : t.wait ? 'wait ~' + waitText(t.wait) : 'next up'}
                    </small>
                  )}
                </td>
                <td data-label="Status">
                  <div className="tok-status">
                    <Pill status={t.status} />
                    {/* Whole tokens: one Start / Finish for all of the token's services. */}
                    {whole && live(t) && t.items.some((i) => i.status === 'in_progress') ? (
                      <Button size="sm" variant="danger" icon="stop" busy={acting === t.id} onClick={() => act(t, 'finish')}>
                        Finish
                      </Button>
                    ) : whole && live(t) && t.items.some((i) => i.status === 'waiting') ? (
                      <Button size="sm" variant="go" icon="play" busy={acting === t.id} onClick={() => act(t, 'start')}>
                        Start
                      </Button>
                    ) : null}
                  </div>
                </td>
                <td data-label="Amount" className="r num">
                  {money(t.total != null ? t.total : t.items.reduce((a, i) => a + i.price, 0), d.salon.currency)}
                  {t.discount > 0 && <small className="disc">−{money(t.discount, d.salon.currency)} offer</small>}
                </td>
                <td className="r actions">
                  <Button
                    size="sm"
                    variant="quiet"
                    className="icon-only"
                    icon="eye"
                    aria-label="Open token"
                    onClick={() => navigate('/t/' + t.id)}
                  />
                  {!['cancelled', 'missed', 'done'].includes(t.status) && (
                    <Button
                      size="sm"
                      variant="quiet"
                      className="icon-only"
                      icon="plus"
                      aria-label="Add services"
                      title="Add services"
                      onClick={() => setAdding(t)}
                    />
                  )}
                  {t.status === 'waiting' && (
                    <Button
                      size="sm"
                      variant="danger-quiet"
                      className="icon-only"
                      icon="x"
                      aria-label="Cancel token"
                      onClick={() => cancel(t)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pager}
      {adding && (
        <AddServiceDialog
          token={adding}
          currency={d.salon.currency}
          onClose={() => setAdding(null)}
          onDone={() => onChanged()}
        />
      )}
    </>
  );
}

export function Overview({ d, reload }) {
  const s = d.stats;
  const cur = d.salon.currency;
  const setup = [
    !d.services.length && ['Add your services', 'services'],
    !d.staff.length && ['Add staff and link them to services', 'staff'],
    !d.salon.logo && ['Upload your logo', 'settings'],
    !d.salon.cover && ['Add a cover photo', 'settings'],
    !(d.salon.phone || d.salon.whatsapp || d.salon.instagram || d.salon.facebook) && [
      'Add your contact and social links',
      'settings',
    ],
    !d.testimonials.length && ['Add client reviews', 'reviews'],
  ].filter(Boolean);
  const activeStaff = d.staff.filter((x) => x.active);
  const staffPage = usePaged('owner-load', activeStaff);
  const live = d.tokens.filter((t) => (t.status === 'waiting' || t.status === 'serving') && !t.upcoming);
  const upcoming = d.tokens.filter((t) => t.upcoming).sort((a, b) => a.appointmentAt - b.appointmentAt);
  const branchName = (id) => (d.branches.find((b) => b.id === id) || {}).name || '—';

  return (
    <div className="stack">
      {setup.length > 0 && (
        <div className="setup">
          <b>Finish setting up</b>
          <div>
            {setup.map(([label, tab]) => (
              <button key={label} type="button" onClick={() => navigate('/owner?tab=' + tab)}>
                {label} <Icon name="chevr" />
              </button>
            ))}
          </div>
        </div>
      )}

      <Figures
        items={[
          ['Tokens today', s.total],
          ['Waiting', s.waiting, 'wait'],
          ['In service', s.serving, 'serve'],
          ['Completed', s.done, 'done'],
          ['Revenue today', money(s.revenue, cur)],
        ]}
      />

      <div className="overview-grid">
        <Panel title="Live queue" sub="Waiting and in-service tokens. Refreshes every 15 seconds." flush>
          <TokenTable
            tokens={live}
            d={d}
            withBranch={d.branches.length > 1}
            pageKey="owner-live"
            onChanged={reload}
            empty={
              <Empty icon="check" title="The queue is clear">
                New bookings appear here as soon as they’re made.
              </Empty>
            }
          />
        </Panel>

        <div className="stack">
          {upcoming.length > 0 && (
            <Panel title="Upcoming appointments" sub="They join the live queue 15 minutes before their time." flush>
              <TokenTable
                tokens={upcoming}
                d={d}
                withBranch={d.branches.length > 1}
                pageKey="owner-upcoming"
                onChanged={reload}
              />
            </Panel>
          )}
          <TokenNumbers d={d} reload={reload} />

          <Panel title="Staff right now" flush>
            {activeStaff.length ? (
              <>
                <ul className="staff-load">
                  {staffPage.items.map((st) => {
                    const its = d.tokens.flatMap((t) =>
                      t.status === 'cancelled' ? [] : t.items.filter((i) => i.staffId === st.id),
                    );
                    const run = its.find((i) => i.status === 'in_progress');
                    const waiting = its.filter((i) => i.status === 'waiting').length;
                    return (
                      <li key={st.id} className={st.online ? '' : 'is-offline'}>
                        <span className={'presence ' + (!st.online ? 'off' : st.busy ? 'busy' : 'on')}>
                          <Avatar name={st.name} photo={st.photo} size="sm" />
                        </span>
                        <span>
                          <b>{st.name}</b>
                          <small>
                            {!st.online ? 'Offline' : run ? 'Busy · ' + run.serviceName : 'Free'}
                            {d.branches.length > 1 ? ' · ' + branchName(st.branchId) : ''}
                          </small>
                        </span>
                        <span className="load">
                          <b className="num">{st.load ? waitText(st.load) : '—'}</b>
                          <small>{waiting} waiting</small>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {staffPage.pager}
              </>
            ) : (
              <Empty
                icon="users"
                title="No staff yet"
                action={
                  <Button size="sm" onClick={() => navigate('/owner?tab=staff')}>
                    Add staff
                  </Button>
                }
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export function TokensTab({ d }) {
  const [date, setDate] = useState(todayStr());
  const [branchId, setBranchId] = useState('');
  const [show, setShow] = useState('all');
  const [all, setList] = useState(null);
  const list = all ? all.filter(SHOW[show][1]) : null;
  const [byNumber, setByNumber] = useState(false); // "Cancel by number" dialog

  const load = async () => {
    try {
      setList(await api('GET', `/api/owner/tokens?date=${date}&branchId=${branchId}`));
    } catch (err) {
      handleError(err);
    }
  };
  useEffect(() => {
    resetPage('owner-tokens');
    load();
  }, [date, branchId]);
  useEffect(() => {
    resetPage('owner-tokens'); // back to page 1 when the filter changes
  }, [show]);
  // Future days list appointment tokens booked for them.
  const lastDay = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  const branchName = (id) => (d.branches.find((b) => b.id === id) || {}).name || '';
  const revenue = (list || [])
    .filter((t) => t.status !== 'cancelled')
    .reduce(
      (a, t) =>
        a +
        (t.doneTotal != null
          ? t.doneTotal
          : t.items.filter((i) => i.status === 'done').reduce((x, i) => x + i.price, 0)),
      0,
    );

  const exportCsv = () => {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [
      [
        'Token',
        'Date',
        'Time',
        'Branch',
        'Customer',
        'Mobile',
        'Email',
        'Service',
        'Staff',
        'Price',
        'Duration',
        'Service status',
        'Started',
        'Finished',
        'Token status',
        'Offer',
        'Offer code',
        'Token discount',
        'Token total',
      ],
    ];
    list.forEach((t) =>
      t.items.forEach((i) =>
        rows.push([
          tokenNo(t),
          t.date,
          clock(t.createdAt),
          branchName(t.branchId),
          t.customer.name,
          t.customer.mobile,
          t.customer.email,
          i.serviceName,
          i.staffName,
          i.price,
          i.duration,
          i.status,
          clock(i.startedAt),
          clock(i.endedAt),
          t.status,
          t.offer ? t.offer.title : '',
          t.offer ? t.offer.code : '',
          t.discount || 0,
          t.total,
        ]),
      ),
    );
    downloadBlob(
      new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }),
      `tokens-${date}.csv`,
    );
  };

  return (
    <Panel
      flush
      title={list ? `${list.length} ${list.length === 1 ? 'token' : 'tokens'}` : 'Tokens'}
      sub={list ? 'Completed revenue ' + money(revenue, d.salon.currency) : ' '}
      actions={
        <div className="filters">
          <input
            type="date"
            className="input sm"
            value={date}
            max={lastDay}
            onChange={(e) => setDate(e.target.value || todayStr())}
            aria-label="Date"
          />
          <select className="input sm" value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show">
            {Object.entries(SHOW).map(([k, [label]]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          {d.branches.length > 1 && (
            <select
              className="input sm"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              aria-label="Branch"
            >
              <option value="">All branches</option>
              {d.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {(!d.features || d.features.reportExport) && (
            <Button size="sm" icon="download" onClick={exportCsv} disabled={!list || !list.length}>
              CSV
            </Button>
          )}
          {date >= todayStr() && (
            <Button size="sm" icon="x" onClick={() => setByNumber(true)}>
              Cancel by number
            </Button>
          )}
        </div>
      }
    >
      {byNumber && (
        <FormDialog
          title="Cancel all tokens from one number"
          submit="Cancel their tokens"
          danger
          onClose={() => setByNumber(false)}
          onSubmit={async (form) => {
            const r = await api('POST', '/api/owner/tokens/cancel-number', { mobile: form.elements.mobile.value });
            toast(r.message);
            load();
          }}
        >
          <p className="muted-text">
            For fake or repeated bookings: every token still waiting, in all your branches (appointments too), that was
            booked with this mobile number is cancelled. Tokens already in service are not touched.
          </p>
          <Field label="Mobile number">
            <input name="mobile" className="input" type="tel" inputMode="tel" required maxLength={20} />
          </Field>
        </FormDialog>
      )}
      {list ? (
        <TokenTable
          key={date + branchId + show}
          tokens={list}
          d={d}
          withBranch={d.branches.length > 1}
          pageKey="owner-tokens"
          onChanged={load}
          empty={
            <Empty icon="calendar" title={show === 'all' ? 'No tokens on this day' : 'No tokens match'}>
              {show === 'all' ? 'Pick another date to see other bookings.' : 'Try another filter or date.'}
            </Empty>
          }
        />
      ) : (
        <div className="panel-loading">
          <span className="spinner" />
        </div>
      )}
    </Panel>
  );
}

/** Per-branch token numbering: last number today, next number, and a manual restart at 001. */
function TokenNumbers({ d, reload }) {
  const [busy, setBusy] = useState('');
  const reset = async (b) => {
    const n = (d.numbers || {})[b.id] || {};
    const first = tokenNo({ prefix: b.prefix, number: 1 });
    const ok = await confirmAction({
      title: 'Restart ' + b.name + ' at ' + first + '?',
      message:
        'The next booking gets ' +
        first +
        '. ' +
        (n.open
          ? n.open + (n.open === 1 ? ' token is' : ' tokens are') + ' still in the queue and keep their numbers.'
          : 'Nobody is in the queue right now.') +
        ' Numbers also restart by themselves every morning.',
      confirm: 'Restart numbers',
    });
    if (!ok) return;
    setBusy(b.id);
    try {
      await api('POST', '/api/owner/branches/' + b.id + '/reset-numbers');
      toast('Numbers restarted – next token is ' + first);
      reload();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy('');
    }
  };
  return (
    <Panel
      title="Token numbers"
      sub="Restart at 001 any time. They restart by themselves every day."
      flush
      className="numbers-panel"
    >
      <ul className="num-list">
        {d.branches.map((b) => {
          const n = (d.numbers || {})[b.id] || { last: 0, next: 1 };
          return (
            <li key={b.id}>
              <div className="num-info">
                {d.branches.length > 1 && <b>{b.name}</b>}
                <div className="num-pair">
                  <span>
                    <small>Last today</small>
                    <strong className="num">{n.last ? tokenNo({ prefix: b.prefix, number: n.last }) : '—'}</strong>
                  </span>
                  <Icon name="chevr" />
                  <span>
                    <small>Next token</small>
                    <strong className="num next">{tokenNo({ prefix: b.prefix, number: n.next })}</strong>
                  </span>
                </div>
                {n.resetAt && <small className="num-reset">Restarted at {clock(n.resetAt)}</small>}
              </div>
              <Button size="sm" icon="refresh" disabled={busy === b.id || !n.last} onClick={() => reset(b)}>
                Reset to {tokenNo({ prefix: b.prefix, number: 1 })}
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
