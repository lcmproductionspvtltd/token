/*
 * BQuee service worker – makes the site installable and keeps it usable on a bad connection.
 * Pages and the app bundle: network first (always fresh), cached copy when offline.
 * Fonts, icons and images: cache first. The API is never cached (queues must be live).
 */
const VERSION = 'bquee-v4';
const SHELL = [
  '/',
  '/app/app.js',
  '/app/app.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/img/favicon.png',
  '/img/brand/bquee-logo.png',
  '/img/brand/bquee-logo-light.png',
  '/img/brand/bquee-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackUrl || request, response.clone());
    return response;
  } catch (err) {
    const cached = (await cache.match(fallbackUrl || request)) || (fallbackUrl && (await cache.match('/')));
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Every page is the same single-page app shell.
  if (req.mode === 'navigate') return event.respondWith(networkFirst(req, '/'));
  if (/^\/(fonts|icons|img|uploads)\//.test(url.pathname)) return event.respondWith(cacheFirst(req));
  if (url.pathname.startsWith('/app/') || url.pathname === '/manifest.webmanifest')
    return event.respondWith(networkFirst(req));
});
