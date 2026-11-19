// Dev tool (needs Playwright + Chrome): node tests/ui/responsive-audit.js while the server runs on :3999 with demo data.
// Responsive audit: every page at many widths; reports elements that stick out of the screen
// (ignoring intentional horizontal scrollers) and page-level sideways scrolling.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { uiLogin } = require('../helpers/session');
const B = 'http://localhost:3999';
const WIDTHS = [320, 360, 390, 480, 600, 768, 900, 1024, 1280, 1440, 1920];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const salon = await (await fetch(B + '/api/public/salon/lotus-salon')).json();
  const br = salon.branches[0].id;
  const brData = await (await fetch(B + '/api/public/branch/' + br)).json();
  const tk = await (
    await fetch(B + '/api/public/book', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        branchId: br,
        name: 'Audit Person With A Long Name',
        mobile: '9000000777',
        items: [{ serviceId: brData.services[0].id, staffId: 'any' }],
      }),
    })
  ).json();
  const groups = [
    [null, ['/', '/signup', '/login', '/s/lotus-salon/login', '/b/' + br, '/b/' + br + '/book', '/t/' + tk.id]],
    [
      ['owner', 'Owner@123'],
      [
        '/owner',
        '/owner?tab=tokens',
        '/owner?tab=branches',
        '/owner?tab=services',
        '/owner?tab=staff',
        '/owner?tab=offers',
        '/owner?tab=reviews',
        '/owner?tab=settings',
        '/owner?tab=reports',
        '/owner?tab=support',
        '/t/' + tk.id,
      ],
    ],
    [
      ['staff', 'Staff@123'],
      ['/staff', '/staff?tab=done', '/staff?tab=reports'],
    ],
    [
      ['admin', 'Admin@123'],
      [
        '/admin',
        '/admin?tab=team',
        '/admin?tab=services',
        '/admin?tab=categories',
        '/admin?tab=reports',
        '/admin?tab=site',
        '/admin?tab=support',
      ],
    ],
  ];
  const problems = [];
  for (const [cred, paths] of groups) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push('JS error ' + p.url() + ': ' + e.message));
    if (cred) {
      await p.goto(B + '/login');
      await uiLogin(p, cred[0], cred[1]); // includes two-step sign-in
      await p.waitForTimeout(500);
    }
    for (const path of paths) {
      for (const w of WIDTHS) {
        await p.setViewportSize({ width: w, height: 900 });
        await p.goto(B + path, { waitUntil: 'networkidle' });
        await p.waitForTimeout(250);
        const r = await p.evaluate(() => {
          const out = [];
          const scrollW = document.documentElement.scrollWidth - innerWidth;
          if (scrollW > 1) out.push('page scrolls sideways by ' + scrollW + 'px');
          // Inside any scrolling/clipping box that itself fits on screen → fine by design.
          const contained = (el) => {
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const s = getComputedStyle(a);
              if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
                const r = a.getBoundingClientRect();
                if (r.right <= innerWidth + 1 && r.left >= -1) return true;
              }
            }
            return false;
          };
          for (const el of document.querySelectorAll('body *')) {
            const rc = el.getBoundingClientRect();
            if (!rc.width || !rc.height) continue;
            if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
            if (rc.right > innerWidth + 1 || rc.left < -1) {
              if (contained(el)) continue;
              if (el.closest('.ld-hero-photo, .confetti, .side')) continue;
              out.push(
                'sticks out: ' +
                  el.tagName.toLowerCase() +
                  '.' +
                  String(el.className).split(' ').slice(0, 2).join('.') +
                  ' (' +
                  Math.round(rc.left) +
                  '…' +
                  Math.round(rc.right) +
                  ')',
              );
              if (out.length > 3) break;
            }
          }
          return out;
        });
        for (const x of r) problems.push(`${path} @${w}px: ${x}`);
      }
    }
    await ctx.close();
  }
  const uniq = [...new Set(problems)];
  console.log(uniq.length ? uniq.join('\n') : 'No responsive problems found');
  await b.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
