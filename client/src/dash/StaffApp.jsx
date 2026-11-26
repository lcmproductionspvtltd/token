/* Staff panel: my queue, completed today, and the scanner (one scan starts, the next finishes). */

import { useEffect, useState } from 'react';
import { api } from '../core/api.js';
import { applyBrand, tokenNo, waitText } from '../core/format.js';
import { navigate } from '../core/router.jsx';
import { Button, Empty, Icon, PageLoader, Pill, Switch, toast, useInterval, useLoad, usePaged } from '../core/ui.jsx';
import { Scanner } from '../lib/Scanner.jsx';
import { Figures, Panel, Shell, handleError, useGuard } from './Shell.jsx';
import { AddServiceDialog } from './AddServiceDialog.jsx';
import { NewTokenDialog } from './NewTokenDialog.jsx';
import { ReportsTab } from './Reports.jsx';

export function StaffApp({ query }) {
  const guard = useGuard('staff');
  if (guard.redirect) return guard.redirect;
  return <Staff query={query} />;
}

function Staff({ query }) {
  const load = useLoad(() => api('GET', '/api/staff/queue'), []);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(null); // token
  const [making, setMaking] = useState(false); // "New token" for a walk-in
  const d = load.data;
  const f = (d && d.features) || {};
  const reportsOn = f.staffReports !== false;
  const view = ['done', ...(reportsOn ? ['reports'] : [])].includes(query.get('tab')) ? query.get('tab') : 'queue';

  useEffect(() => {
    if (load.error) handleError(load.error);
  }, [load.error]);
  useEffect(() => {
    if (d) applyBrand(d.salon.color);
  }, [d && d.salon.color]);
  useInterval(load.reload, 10000, !!d);

  if (!d) return <PageLoader />;

  const me = d.staff.id;
  const active = d.tokens.filter((t) => t.items.some((i) => i.staffId === me && i.status !== 'done'));
  const done = d.tokens.filter((t) => !active.includes(t));
  const now = active.find((t) => t.items.some((i) => i.staffId === me && i.status === 'in_progress'));

  const setOnline = async (online) => {
    try {
      await api('PUT', '/api/staff/status', { online });
      toast(online ? 'You’re online – customers can book you' : 'You’re offline – new customers can’t pick you');
      await load.reload();
    } catch (err) {
      handleError(err);
    }
  };
  const presence = !d.staff.online ? 'off' : d.staff.busy ? 'busy' : 'on';

  // The owner's setting: one Start / Finish for the whole token, or one for each service.
  const whole = d.salon.tokenFlow === 'whole';
  const act = async (id, action, index) => {
    setBusyId(id);
    try {
      const r = await api('POST', '/api/token/' + id + '/' + action, index != null ? { index } : {});
      toast(tokenNo(r.token) + ' · ' + r.message);
      await load.reload();
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Shell
      brand={d.salon}
      nav={[
        { id: 'queue', icon: 'list', label: 'My queue', section: 'Today', badge: active.length },
        { id: 'done', icon: 'check', label: 'Completed', section: 'Today', badge: done.length },
        { id: 'scan', icon: 'camera', label: 'Scan token', section: 'Today' },
        { id: 'new', icon: 'plus', label: 'New token', section: 'Today' },
        ...(reportsOn ? [{ id: 'reports', icon: 'chart', label: 'My reports', section: 'Insights' }] : []),
      ]}
      active={view}
      onNav={(id) =>
        id === 'scan'
          ? setScanning(true)
          : id === 'new'
            ? setMaking(true)
            : navigate(id === 'queue' ? '/staff' : '/staff?tab=' + id)
      }
      title={view === 'queue' ? 'My queue' : view === 'reports' ? 'My reports' : 'Completed today'}
      subtitle={d.staff.name + (d.branch.name ? ' · ' + d.branch.name : '')}
      actions={
        <>
          <PresencePill presence={presence} online={d.staff.online} setOnline={setOnline} />
          <Button size="sm" variant="primary" icon="plus" className="topbar-new" onClick={() => setMaking(true)}>
            New token
          </Button>
          <Button
            size="sm"
            variant="quiet"
            className="icon-only"
            icon="refresh"
            aria-label="Refresh"
            onClick={async () => (await load.reload(), toast('Up to date'))}
          />
        </>
      }
    >
      {view === 'queue' ? (
        <div className="stack">
          <PresenceCard presence={presence} online={d.staff.online} setOnline={setOnline} />
          <ScanHero onScan={() => setScanning(true)} />
          <Button variant="soft" icon="plus" className="block" onClick={() => setMaking(true)}>
            New token for a walk-in
          </Button>

          <Figures
            items={[
              ['Waiting for me', d.stats.waiting, 'wait'],
              ['In service', d.stats.serving, 'serve'],
              ['Completed', d.stats.done, 'done'],
              ['My queue time', waitText(d.stats.load)],
            ]}
          />

          {now && (
            <Panel title="Serving now" className="now-panel">
              <QueueRow t={now} me={me} whole={whole} busy={busyId === now.id} onAct={act} onAdd={setAdding} />
            </Panel>
          )}

          <Panel title="Customers waiting for me" flush>
            <QueueList
              key="q"
              list={active.filter((t) => t !== now)}
              me={me}
              whole={whole}
              busyId={busyId}
              onAct={act}
              onAdd={setAdding}
              pageKey="staff-queue"
              empty={
                <Empty icon="check" title="No one is waiting for you">
                  New bookings show up here on their own.
                </Empty>
              }
            />
          </Panel>
        </div>
      ) : view === 'reports' ? (
        <ReportsTab kind="staff" currency={d.salon.currency} canExport={f.reportExport !== false} />
      ) : (
        <Panel title={`${done.length} completed today`} flush>
          <QueueList
            key="d"
            list={done}
            me={me}
            whole={whole}
            busyId={busyId}
            onAct={act}
            onAdd={setAdding}
            pageKey="staff-done"
            empty={<Empty icon="clock" title="Nothing completed yet today" />}
          />
        </Panel>
      )}
      {adding && (
        <AddServiceDialog
          token={adding}
          currency={d.salon.currency}
          onClose={() => setAdding(null)}
          onDone={() => load.reload()}
        />
      )}
      {making && (
        <NewTokenDialog currency={d.salon.currency} onClose={() => setMaking(false)} onDone={() => load.reload()} />
      )}
      {scanning && <Scanner onClose={() => setScanning(false)} onToken={(id) => act(id, 'next')} />}
    </Shell>
  );
}

/** Online / busy / offline pill in the top bar; tap to switch. */
function PresencePill({ presence, online, setOnline }) {
  return (
    <button
      type="button"
      className={'presence-pill ' + presence}
      onClick={() => setOnline(!online)}
      title={online ? 'Go offline' : 'Go online'}
    >
      <span className="presence-dot" />
      {presence === 'off' ? 'Offline' : presence === 'busy' ? 'Busy' : 'Online'}
    </button>
  );
}

/** What online / busy / offline means for customers, with the switch. */
function PresenceCard({ presence, online, setOnline }) {
  return (
    <div className={'presence-card ' + presence}>
      <span className="presence-dot big" />
      <span className="presence-text">
        <b>
          {presence === 'off'
            ? 'You’re offline'
            : presence === 'busy'
              ? 'You’re busy – serving a customer'
              : 'You’re online – ready for customers'}
        </b>
        <small>
          {presence === 'off'
            ? 'New customers can’t pick you or be given to you. Customers already in your queue stay.'
            : presence === 'busy'
              ? 'Customers see you as busy until you finish this service. You can still take bookings.'
              : 'Customers can book you. You show as busy automatically when you scan a token to start.'}
        </small>
      </span>
      <Switch checked={online} onChange={setOnline} label={online ? 'Online' : 'Offline'} />
    </div>
  );
}

/** Big “Scan a customer’s token” button. */
function ScanHero({ onScan }) {
  return (
    <button type="button" className="scan-hero" onClick={onScan}>
      <span className="scan-hero-icon">
        <Icon name="camera" />
      </span>
      <span>
        <b>Scan a customer’s token</b>
        <small>The first scan starts their service, the next scan finishes it.</small>
      </span>
      <Icon name="chevr" />
    </button>
  );
}

function QueueList({ list, me, whole, busyId, onAct, onAdd, pageKey, empty }) {
  const { items, pager } = usePaged(pageKey, list);
  if (!list.length) return empty;
  return (
    <>
      <ul className="queue">
        {items.map((t) => (
          <li key={t.id}>
            <QueueRow t={t} me={me} whole={whole} busy={busyId === t.id} onAct={onAct} onAdd={onAdd} />
          </li>
        ))}
      </ul>
      {pager}
    </>
  );
}

function QueueRow({ t, me, whole, busy, onAct, onAdd }) {
  const mine = t.items.map((i, index) => ({ ...i, index })).filter((i) => i.staffId === me);
  const running = mine.find((i) => i.status === 'in_progress');
  const next = mine.find((i) => i.status === 'waiting');
  const open = !['cancelled', 'missed'].includes(t.status);
  const all = mine.filter((i) => i.status === (running ? 'in_progress' : 'waiting')).length > 1 ? ' all' : '';
  return (
    <div className="q-row">
      <span className="q-no num">{tokenNo(t)}</span>
      <div className="q-info">
        <b>
          {t.customer.name} <small>{t.customer.mobile}</small>
          {t.offer && (
            <span className="offer-tag" title={t.offer.title}>
              <Icon name="gift" /> {t.offer.code || t.offer.title}
            </span>
          )}
        </b>
        <span className="q-services">
          {mine.map((i) => (
            <span key={i.index}>
              {i.serviceName}{' '}
              {!whole && open && i.status === 'waiting' ? (
                <Button size="sm" variant="go" icon="play" busy={busy} onClick={() => onAct(t.id, 'start', i.index)}>
                  Start
                </Button>
              ) : !whole && open && i.status === 'in_progress' ? (
                <Button size="sm" variant="danger" icon="stop" busy={busy} onClick={() => onAct(t.id, 'finish', i.index)}>
                  Finish
                </Button>
              ) : (
                <Pill status={i.status} />
              )}
            </span>
          ))}
        </span>
        {next && !running && (
          <small className="q-wait">
            <Icon name="clock" /> {t.wait ? `Waits ~${waitText(t.wait)} · ${t.ahead} ahead` : 'Next in line'}
          </small>
        )}
      </div>
      <div className="q-actions">
        {/* Whole tokens: one Start / Finish for all of this staff member's services on the token. */}
        {whole && running ? (
          <Button variant="danger" icon="stop" busy={busy} onClick={() => onAct(t.id, 'finish')}>
            Finish{all}
          </Button>
        ) : whole && next ? (
          <Button variant="go" icon="play" busy={busy} onClick={() => onAct(t.id, 'start')}>
            Start{all}
          </Button>
        ) : null}
        {t.status !== 'cancelled' && t.status !== 'missed' && (
          <Button variant="quiet" icon="plus" onClick={() => onAdd(t)} title="Add services the customer asked for">
            Add service
          </Button>
        )}
        <Button
          variant="quiet"
          className="icon-only"
          icon="eye"
          aria-label="Open token"
          onClick={() => navigate('/t/' + t.id)}
        />
      </div>
    </div>
  );
}
