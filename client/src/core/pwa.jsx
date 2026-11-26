/*
 * Installable app (PWA): service worker, per-salon manifest, and the "Install app" banner.
 * Android / desktop Chrome, Edge, Samsung Internet: one-tap install via beforeinstallprompt.
 * iPhone / iPad (Safari, Chrome): no install prompt exists, so we show Share → Add to Home Screen.
 */

import { useEffect, useState } from 'react';
import { Button, Dialog, Icon } from './ui.jsx';

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    try {
      localStorage.setItem('bquee-installed', '1');
    } catch {}
    notify();
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

const isStandalone = () =>
  (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) ||
  navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Point the page's manifest (and iOS home-screen title) at one salon branch, or back to BQuee. */
export function useAppManifest(branchId, appName) {
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    const title = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (link)
      link.setAttribute(
        'href',
        branchId ? '/api/public/manifest/' + encodeURIComponent(branchId) : '/manifest.webmanifest',
      );
    // Salon pages set their own title once loaded; elsewhere it's BQuee.
    if (title && (appName || !branchId)) title.setAttribute('content', appName || 'BQuee');
  }, [branchId, appName]);
}

const DISMISS_KEY = 'bquee-install-dismissed';

// Saved settings used the old product name before; carry them over once.
try {
  for (const [from, to] of [
    ['salonq-install-dismissed', DISMISS_KEY],
    ['salonq-installed', 'bquee-installed'],
  ]) {
    const old = localStorage.getItem(from);
    if (old !== null) {
      if (localStorage.getItem(to) === null) localStorage.setItem(to, old);
      localStorage.removeItem(from);
    }
  }
} catch {
  // private mode – nothing saved to carry over
}
const recentlyDismissed = () => {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 7 * 864e5;
  } catch {
    return false;
  }
};

/** Bottom banner offering to install the app. Hidden once installed, or for a week after "Not now". */
const appTitle = () => (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || 'BQuee';

export function InstallBanner({ name: fixedName }) {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false); // small delay so it never covers the first look
  const [hidden, setHidden] = useState(recentlyDismissed);
  const [howTo, setHowTo] = useState(false);

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    const t = setTimeout(() => setReady(true), 3500);
    return () => {
      listeners.delete(fn);
      clearTimeout(t);
    };
  }, []);

  const name = fixedName || appTitle();
  const ios = isIOS();
  const can = !!deferred || ios;
  if (!ready || hidden || isStandalone() || !can) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setHidden(true);
  };
  const install = async () => {
    if (!deferred) return setHowTo(true);
    const prompt = deferred;
    deferred = null;
    prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (!choice || choice.outcome !== 'accepted') dismiss();
    else setHidden(true);
  };

  return (
    <>
      <div className="install-banner" role="region" aria-label="Install app">
        <img src="/icons/icon-192.png" alt="" width="44" height="44" />
        <div className="install-text">
          <b>Install {name}</b>
          <small>{ios ? 'Add to Home Screen – opens like an app' : 'Opens like an app from your home screen'}</small>
        </div>
        <Button size="sm" variant="primary" icon="download" onClick={install}>
          Install
        </Button>
        <button type="button" className="install-close" aria-label="Not now" onClick={dismiss}>
          <Icon name="x" />
        </button>
      </div>
      {howTo && (
        <Dialog
          title={'Install ' + name}
          onClose={() => setHowTo(false)}
          width={420}
          footer={
            <Button
              variant="primary"
              onClick={() => {
                setHowTo(false);
                dismiss();
              }}
            >
              Got it
            </Button>
          }
        >
          <ol className="install-steps">
            <li>
              <span className="step-ico">
                <Icon name="share" />
              </span>
              <span>
                Tap <b>Share</b> in the browser bar (the square with an arrow).
              </span>
            </li>
            <li>
              <span className="step-ico">
                <Icon name="addsq" />
              </span>
              <span>
                Scroll and tap <b>Add to Home Screen</b>.
              </span>
            </li>
            <li>
              <span className="step-ico">
                <Icon name="phoneapp" />
              </span>
              <span>
                Tap <b>Add</b>. {name} now opens full screen from your Home Screen.
              </span>
            </li>
          </ol>
        </Dialog>
      )}
    </>
  );
}
