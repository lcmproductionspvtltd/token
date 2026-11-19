/* Token page: the ticket, live waiting time, staff start/finish, JPG/PDF downloads. */

import { useEffect, useState } from 'react';
import { api, currentUser, homeFor, rememberToken } from '../core/api.js';
import { FINAL, applyBrand, setFavicon, dayText, todayStr, tokenNo, waitText } from '../core/format.js';
import { AddServiceDialog } from '../dash/AddServiceDialog.jsx';
import { navigate } from '../core/router.jsx';
import { Dialog, ErrorPage, Icon, LinkButton, PageLoader, toast, useInterval, useLoad } from '../core/ui.jsx';
import { downloadToken, drawToken } from '../lib/token-image.js';
import { PillHeader } from './PillHeader.jsx';
import { StatusBanner, TicketPreview, TicketActions, StaffActionBar, ServicesPanel, Confetti } from './TokenParts.jsx';

export function TokenPage({ id, query }) {
  const url = '/api/public/token/' + encodeURIComponent(id);
  const load = useLoad(() => api('GET', url), [id]);
  const d = load.data;
  const live = d && !FINAL.includes(d.token.status);
  useInterval(load.reload, 15000, !!live);

  // The tab shows the business's logo; leaving puts the BQuee logo back.
  const logo = d ? d.salon.logo : '';
  useEffect(() => (setFavicon(logo), () => setFavicon('')), [logo]);

  useEffect(() => {
    if (!d) return;
    applyBrand(d.salon.color);
    rememberToken({
      id: d.token.id,
      number: d.token.number,
      label: tokenNo(d.token),
      salon: d.salon.name,
      salonId: d.token.salonId,
      date: d.token.date,
    });
    document.title = tokenNo(d.token) + ' · ' + d.salon.name;
  }, [d && d.token.id, d && d.salon.color]);

  if (load.error && !d) return <ErrorPage message={load.error.message} />;
  if (!d) return <PageLoader />;
  return <TokenView d={d} setD={load.setData} refresh={load.reload} isNew={query.get('new') === '1'} />;
}

function TokenView({ d, setD, refresh, isNew }) {
  const t = d.token;
  const s = d.salon;
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [preview, setPreview] = useState(null); // data URL of the drawn token
  const [zoom, setZoom] = useState(false);
  const [saving, setSaving] = useState('');

  // The on-page token is the same drawing that the JPG and PDF downloads use.
  useEffect(() => {
    let alive = true;
    drawToken(d)
      .then((cv) => alive && setPreview(cv.toDataURL('image/png')))
      .catch(() => alive && setPreview(''));
    return () => {
      alive = false;
    };
  }, [d]);

  const save = async (kind) => {
    setSaving(kind);
    await downloadToken(d, kind);
    setSaving('');
    toast(kind === 'pdf' ? 'Token saved as PDF' : 'Token saved as image');
  };
  const user = currentUser();
  const canAct = user && (user.role === 'staff' || user.role === 'owner') && user.salonId === t.salonId;
  const mineItem = (it) => canAct && (user.role === 'owner' || it.staffId === user.staffId);
  const fresh = isNew && t.status === 'waiting';
  const subtotal = t.items.reduce((a, i) => a + i.price, 0);
  const discount = t.discount || 0;
  const total = t.total != null ? t.total : subtotal;

  useEffect(() => setUpdatedAt(Date.now()), [d]);

  const act = async (action, index) => {
    setBusy(true);
    try {
      const r = await api('POST', '/api/token/' + t.id + '/' + action, index != null ? { index } : {});
      setD(r);
      toast(r.message || 'Updated');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const editable = canAct && !['cancelled', 'missed'].includes(t.status) && t.date === todayStr();
  const removeItem = async (index) => {
    setBusy(true);
    try {
      const r = await api('POST', '/api/token/' + t.id + '/remove-service', { index });
      setD(r);
      toast(r.message);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  const mine = canAct && !['cancelled', 'done', 'missed'].includes(t.status) ? t.items.filter(mineItem) : [];
  const running = mine.find((i) => i.status === 'in_progress');
  const nextUp = mine.find((i) => i.status === 'waiting');

  const waitValue =
    t.status === 'waiting' ? waitText(d.wait) : t.status === 'serving' ? 'Now' : t.status === 'done' ? 'Done' : '—';
  const sub =
    t.status === 'missed'
      ? `It was valid on ${dayText(t.date)}. Book a new token for today.`
      : fresh
        ? 'Keep this page open or download your token. The waiting time updates by itself.'
        : t.status === 'waiting'
          ? d.ahead
            ? `${d.ahead === 1 ? '1 person is' : d.ahead + ' people are'} ahead of you.`
            : 'You’re next in line.'
          : t.status === 'serving'
            ? 'Your service has started. Enjoy!'
            : `${s.name} · ${d.branch.name || ''}`;

  return (
    <div className="tp">
      <PillHeader
        salon={s}
        sub={d.branch.name}
        onBack={() => navigate('/b/' + t.branchId)}
        backLabel="Back to business"
      >
        <button
          type="button"
          className="ld-nav-icon"
          aria-label="Refresh"
          title="Refresh"
          onClick={async () => {
            await refresh();
            toast('Up to date');
          }}
        >
          <Icon name="refresh" />
        </button>
      </PillHeader>

      {fresh && <Confetti />}
      {zoom && preview && (
        <Dialog
          title={'Token ' + tokenNo(t)}
          onClose={() => setZoom(false)}
          width={560}
          className="tp-zoom"
          focusFirst={false}
        >
          <img src={preview} alt={'Token ' + tokenNo(t)} className="tp-zoom-img" />
        </Dialog>
      )}
      {adding && (
        <AddServiceDialog token={t} currency={s.currency} onClose={() => setAdding(false)} onDone={(r) => setD(r)} />
      )}

      <main className="tp-wrap">
        <StatusBanner t={t} d={d} fresh={fresh} sub={sub} waitValue={waitValue} />

        <div className="tp-layout">
          <TicketPreview t={t} s={s} preview={preview} onZoom={() => setZoom(true)} />

          <TicketActions t={t} saving={saving} onSave={save} />

          <div className="tp-panel-area">
            {(running || nextUp) && (
              <StaffActionBar t={t} user={user} running={running} nextUp={nextUp} busy={busy} act={act} />
            )}

            <ServicesPanel
              t={t}
              d={d}
              s={s}
              busy={busy}
              act={act}
              mineItem={mineItem}
              editable={editable}
              removeItem={removeItem}
              onAdd={() => setAdding(true)}
              discount={discount}
              subtotal={subtotal}
              total={total}
              updatedAt={updatedAt}
            />

            <nav className="tp-links">
              {canAct && (
                <LinkButton to={homeFor(user)} size="sm" variant="soft" icon="back">
                  Back to dashboard
                </LinkButton>
              )}
            </nav>
          </div>
        </div>
      </main>
    </div>
  );
}
