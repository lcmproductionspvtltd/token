'use strict';

/**
 * Load / soak test (audit section 5): many visitors at once for a while, like a busy morning.
 * Each virtual visitor opens the home page data, a business page, its live queue and the booking form
 * data, and some book a token. At the end: requests per second, response times (p50/p95/p99) and errors.
 *
 *   node tests/load/soak.js                          # 50 visitors for 60 s against http://localhost:3999
 *   BASE=https://staging.example USERS=200 SECONDS=600 node tests/load/soak.js
 *
 * Run it against a test copy, never the live site. Passes when there are no server errors (5xx) or failed
 * connections and p95 stays under MAX_P95_MS (default 800 ms). Booking limits (429) are expected and counted
 * separately.
 */

const BASE = (process.env.BASE || 'http://localhost:3999').replace(/\/$/, '');
const USERS = Number(process.env.USERS) || 50;
const SECONDS = Number(process.env.SECONDS) || 60;
const MAX_P95_MS = Number(process.env.MAX_P95_MS) || 800;

const times = [];
const counts = { ok: 0, limited: 0, client: 0, server: 0, failed: 0 };

async function call(method, path, body) {
  const started = performance.now();
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => null);
    times.push(performance.now() - started);
    if (r.status < 400) counts.ok++;
    else if (r.status === 429) counts.limited++;
    else if (r.status < 500) counts.client++;
    else counts.server++;
    return data;
  } catch (err) {
    counts.failed++;
    return null;
  }
}

async function findBusiness() {
  const xml = await (await fetch(BASE + '/sitemap.xml')).text();
  const slug = (xml.match(/\/s\/([^<]+)<\/loc>/) || [])[1];
  if (!slug) throw new Error('No live business in the sitemap – load demo data first.');
  const biz = await (await fetch(BASE + '/api/public/salon/' + slug)).json();
  return { slug, branch: biz.branches[0].id };
}

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

(async () => {
  const { slug, branch } = await findBusiness();
  console.log(`Load test: ${USERS} visitors for ${SECONDS} s against ${BASE} (business ${slug})`);
  const until = Date.now() + SECONDS * 1000;
  const booking = await call('GET', `/api/public/branch/${branch}`);
  const service = booking && booking.services && booking.services[0];

  async function visitor(n) {
    while (Date.now() < until) {
      await call('GET', '/api/public/site');
      await call('GET', `/api/public/salon/${slug}`);
      await call('GET', `/api/public/branch/${branch}/queue`);
      await call('GET', `/api/public/branch/${branch}`);
      if (service && n % 10 === 0)
        await call('POST', '/api/public/book', {
          branchId: branch,
          name: 'Load test ' + n,
          mobile: '9' + String(100000000 + Math.floor(Math.random() * 899999999)),
          items: [{ serviceId: service.id, staffId: 'any' }],
        });
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: USERS }, (_, i) => visitor(i)));
  const secs = (Date.now() - t0) / 1000;
  const sorted = times.sort((a, b) => a - b);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const p95 = pct(sorted, 95);
  console.log(`Requests: ${total} (${(total / secs).toFixed(0)} per second)`);
  console.log(
    `Response time: p50 ${pct(sorted, 50).toFixed(0)} ms · p95 ${p95.toFixed(0)} ms · p99 ${pct(sorted, 99).toFixed(0)} ms`,
  );
  console.log(
    `Answers: ${counts.ok} ok · ${counts.limited} limited (429, expected) · ${counts.client} other 4xx · ${counts.server} server errors · ${counts.failed} failed connections`,
  );
  const passed = counts.server === 0 && counts.failed === 0 && p95 <= MAX_P95_MS;
  console.log(passed ? `PASS (p95 ≤ ${MAX_P95_MS} ms, no server errors)` : 'FAIL');
  process.exitCode = passed ? 0 : 1;
})().catch((err) => {
  console.error('Load test could not run:', err.message);
  process.exitCode = 1;
});
