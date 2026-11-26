/*
 * The bell in every dashboard's top bar (super admin, BQuee team, owners, staff).
 *
 * Light on the server: it asks "anything after #id?" every 30 seconds while the page is in front and
 * every 2 minutes while it is in the background; the usual answer is a tiny empty list. With desktop
 * alerts switched on (the browser asks once), new ones also pop up outside the page.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../core/api.js';
import { navigate } from '../core/router.jsx';
import { Icon, toast } from '../core/ui.jsx';

const FRONT_MS = 30_000;
const BACK_MS = 120_000;
const canAlert = () => typeof window !== 'undefined' && 'Notification' in window;

/** "just now", "5 min ago", "3 h ago", "2 days ago" */
export function timeAgo(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d + ' days ago';
}

export function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState(canAlert() ? Notification.permission : 'unsupported');
  const last = useRef(0);
  const loaded = useRef(false);
  const ref = useRef(null);

  // The "anything new?" loop.
  useEffect(() => {
    let timer = null;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await api('GET', '/api/notifications' + (last.current ? '?after=' + last.current : ''));
        if (stopped) return;
        if (r.items && r.items.length) {
          const fresh = r.items;
          setItems((old) => [...fresh, ...old.filter((o) => !fresh.some((f) => f.id === o.id))].slice(0, 50));
          last.current = Math.max(last.current, fresh[0].id);
          if (loaded.current) announce(fresh);
        }
        if (typeof r.unread === 'number') setUnread(r.unread);
        if (!last.current && r.last) last.current = r.last;
        loaded.current = true;
      } catch (err) {
        /* offline or signed out – the page itself shows that; try again later */
      }
      if (!stopped) timer = setTimeout(tick, document.hidden ? BACK_MS : FRONT_MS);
    };
    // Back to the page: check at once instead of waiting.
    const onShow = () => {
      if (document.hidden || stopped) return;
      clearTimeout(timer);
      tick();
    };
    tick();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  function announce(fresh) {
    const newest = fresh[0];
    if (document.hidden && canAlert() && Notification.permission === 'granted') {
      try {
        for (const n of fresh.slice(0, 3)) {
          const alert = new Notification(n.title, {
            body: n.body,
            icon: '/img/brand/bquee-icon.png',
            tag: 'bq-' + n.id,
          });
          alert.onclick = () => {
            window.focus();
            if (n.link) navigate(n.link);
            alert.close();
          };
        }
      } catch (err) {
        /* some browsers only allow alerts from an installed app */
      }
    } else if (!document.hidden) {
      toast(newest.title + (fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''));
    }
  }

  const markRead = async () => {
    if (!unread) return;
    setUnread(0);
    try {
      await api('POST', '/api/notifications/read', { upTo: last.current });
    } catch (err) {
      /* the count comes back on the next check */
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markRead();
  };

  const askAlerts = async () => {
    try {
      setAlerts(await Notification.requestPermission());
    } catch (err) {
      setAlerts('denied');
    }
  };

  const go = (n) => {
    setOpen(false);
    if (n.link && n.link.startsWith('/')) navigate(n.link);
  };

  return (
    <div className="bell" ref={ref}>
      <button
        type="button"
        className="icon-btn bell-btn"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
      >
        <Icon name="bell" />
        {unread > 0 && <em className="bell-count num">{unread > 99 ? '99+' : unread}</em>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            {alerts === 'default' && (
              <button type="button" className="bell-alerts" onClick={askAlerts}>
                Turn on desktop alerts
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="bell-empty">Nothing yet. New tokens, messages and updates show up here.</p>
          ) : (
            <ul className="bell-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => go(n)} className={'bell-item k-' + n.kind}>
                    <b>{n.title}</b>
                    {n.body && <span>{n.body}</span>}
                    <small>{timeAgo(n.at)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
