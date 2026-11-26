/* Tiny History-API router: navigate(), <Link>, useLocation(). */

import { useEffect, useSyncExternalStore } from 'react';

const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('popstate', notify);

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const snapshot = () => location.pathname + location.search;

export function useLocation() {
  const href = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(href, location.origin);
  return { path: url.pathname.replace(/\/+$/, '') || '/', query: url.searchParams };
}

export function navigate(to, { replace = false, keepScroll = false } = {}) {
  if (to === snapshot()) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', to);
  notify();
  if (!keepScroll) window.scrollTo(0, 0);
}

export function Link({ to, children, onClick, ...rest }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        if (onClick) onClick(e);
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Redirect while rendering. */
export function Redirect({ to }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}
