/**
 * Click audit: signs in as each role, opens every menu page and presses every safe button,
 * then reports JavaScript errors, failed server calls (5xx), buttons that crashed the page, and
 * layout problems on every page and in every dialog: sideways scrolling, things sticking out of
 * the screen or the dialog, and buttons with no visible label.
 *   BASE=http://localhost:3999 node tests/ui/click-audit.js
 *   WIDTHS=360,768 BASE=… node tests/ui/click-audit.js   (screen widths to test; default 1280,390)
 *   ONLY=owner,staff …                                    (only these roles: visitor, admin, owner, staff)
 *   MAIL_LOG_FILE=… (the same file the server writes emails to): owners’ emailed sign-in codes are read there
 * Needs the demo data (SEED_DEMO_DATA=1) and Playwright.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { uiLogin } = require('../helpers/session');

const BASE = process.env.BASE || 'http://localhost:3999';
// Buttons that would delete, sign out, cancel or leave – skipped so the audit can keep going.
const SKIP =
  /lost phone|new backup codes|sign out all|make new codes|delete|remove|sign out|log ?out|cancel token|reset|disable|deactivate|turn off|^cancel$|close ticket|resolve|end|finish|start|mark|install|download|print|share|copy|whatsapp|call|directions|instagram|open my page|scan from photo|^(open|close) menu$/i;

const report = { pages: 0, clicks: 0, dialogs: 0, problems: [] };

/**
 * Runs in the page: returns layout problems inside `scope` (a CSS selector, or the whole page).
 * Things inside a box that scrolls sideways on purpose (card rails, wide tables) are fine.
 */
function layoutProblems(scope) {
  const out = [];
  const W = document.documentElement.clientWidth;
  const root = scope ? document.querySelector(scope) : document.body;
  if (!root) return out;
  if (!scope && document.documentElement.scrollWidth > W + 1)
    out.push(`page scrolls sideways by ${document.documentElement.scrollWidth - W}px`);
  const describe = (el) => {
    const t = (el.getAttribute('aria-label') || el.innerText || el.placeholder || el.value || '').trim();
    return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + (t ? ` "${t.slice(0, 40).replace(/\s+/g, ' ')}"` : '');
  };
  const scrollsSideways = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if ((o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') && a.scrollWidth > a.clientWidth + 1) return true;
    }
    return false;
  };
  const box = scope ? root.getBoundingClientRect() : { left: 0, right: W };
  if (scope && (box.right > W + 1 || box.left < -1)) out.push(`dialog is wider than the screen (${Math.round(box.width)}px)`);
  for (const el of root.querySelectorAll('button, a, input, select, textarea, h1, h2, h3, p, label, img')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.left >= W || r.right <= 0) continue; // a closed slide-in menu waiting off screen
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.position === 'fixed' && !scope) continue;
    if (el.closest('[aria-hidden="true"], .sr-only, .hp')) continue;
    if ((r.right > Math.min(W, box.right) + 1 || r.left < Math.max(0, box.left) - 1) && !scrollsSideways(el))
      out.push('sticks out: ' + describe(el));
    if (el.tagName === 'BUTTON' && !el.innerText.trim() && !el.getAttribute('aria-label') && !el.title && !el.querySelector('svg, img'))
      out.push('button with no label: ' + describe(el));
  }
  return [...new Set(out)].slice(0, 8);
}

async function audit(browser, label, login, pages, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.grantPermissions([]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(1500); // a button that vanished after a re-render is skipped quickly
  const problem = (what) => report.problems.push(`[${label} ${width}px] ${what}`);
  page.on('pageerror', (e) => problem('JS error: ' + e.message));
  // A blocked inline style or script (Content-Security-Policy) is a problem too.
  page.on(
    'console',
    (m) =>
      /Content Security Policy|Refused to (apply|execute|load)/i.test(m.text()) &&
      problem('CSP: ' + m.text().slice(0, 160)),
  );
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/camera|getUserMedia|Permission|favicon|net::ERR/i.test(m.text()) &&
      problem('console: ' + m.text().slice(0, 160)),
  );
  page.on('response', (r) => r.status() >= 500 && problem(`server ${r.status()} on ${r.url().replace(BASE, '')}`));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  if (login) {
    await page.goto(BASE + '/login', { timeout: 15000 });
    await uiLogin(page, login[0], login[1]); // includes two-step sign-in
    await page.waitForTimeout(800);
  }
  for (const path of pages) {
    await page.goto(BASE + path, { timeout: 15000 });
    await page.waitForTimeout(1200);
    report.pages++;
    process.stdout.write(`  ${label} ${width}px ${path}\n`);
    for (const p of await page.evaluate(layoutProblems, null)) problem(`${path}: ${p}`);
    const count = await page.locator('button:visible').count();
    const seen = new Map(); // same kind of button (e.g. "Edit …" on every row): press at most 2
    let pressed = 0;
    for (let i = 0; i < count && pressed < 45; i++) {
      const btn = page.locator('button:visible').nth(i);
      let name = '';
      try {
        name = ((await btn.getAttribute('aria-label')) || (await btn.innerText()) || '').trim().replace(/\s+/g, ' ');
      } catch {
        continue;
      }
      if (!name || SKIP.test(name) || (await btn.isDisabled().catch(() => true))) continue;
      const bb = await btn.boundingBox().catch(() => null);
      if (!bb || bb.x >= width || bb.x + bb.width <= 0) continue; // in a closed slide-in menu
      const kind = name.split(' ')[0].toLowerCase();
      if ((seen.get(kind) || 0) >= 2) continue;
      seen.set(kind, (seen.get(kind) || 0) + 1);
      pressed++;
      const before = page.url();
      try {
        await btn.click({ timeout: 2000 });
        if (process.env.DEBUG) console.log('    pressed', name);
        report.clicks++;
        await page.waitForTimeout(350);
        const dialog = page.locator('[role=dialog]:visible, .dialog:visible');
        if (await dialog.count()) {
          report.dialogs++;
          await page.waitForTimeout(300);
          const sel = (await page.locator('[role=dialog]:visible').count()) ? '[role=dialog]' : '.dialog';
          for (const p of await page.evaluate(layoutProblems, sel)) problem(`${path} dialog after "${name}": ${p}`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(250);
          if (await dialog.count()) {
            const close = page
              .locator('[role=dialog] button[aria-label="Close"], .dialog button[aria-label="Close"]')
              .first();
            if (await close.count()) await close.click({ timeout: 1000 }).catch(() => {});
          }
        }
        const blank =
          (
            await page
              .locator('#root')
              .innerText()
              .catch(() => '')
          ).trim().length < 5;
        if (blank) problem(`page went blank after "${name}" on ${path}`);
      } catch (e) {
        // A button that disappeared after an earlier click (lists re-render) is fine.
        if (process.env.DEBUG) console.log('    skip', name, '–', e.message.split('\n')[0]);
      }
      if (page.url() !== before) {
        await page.goto(BASE + path, { timeout: 15000 });
        await page.waitForTimeout(900);
      }
    }
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const { execSync } = require('child_process');
  const db = process.env.DATABASE_URL || 'postgres://bquee:bquee-dev-pass@127.0.0.1:5432/bquee_test';
  const ids = JSON.parse(
    execSync(
      `psql ${db} -At -c "select json_build_object('b',(select id from branches order by created_at limit 1),'s',(select slug from salons limit 1),'t',(select id from tokens limit 1))"`,
    ).toString(),
  );
  const tabs = (role, list) => list.map((t) => `/${role}${t ? '?tab=' + t : ''}`);
  const sets = [
    [
      'visitor',
      null,
      ['/', '/login', '/signup', '/terms', '/privacy', `/b/${ids.b}`, `/b/${ids.b}/book`, `/s/${ids.s}`, `/t/${ids.t}`],
    ],
    [
      'super admin',
      ['admin', process.env.ADMIN_PASSWORD || 'Admin@12345-bq'],
      tabs('admin', ['', 'categories', 'services', 'customers', 'support', 'reports', 'team', 'site']),
    ],
    [
      'owner',
      ['owner', 'Owner@123'],
      tabs('owner', [
        '',
        'tokens',
        'reports',
        'branches',
        'services',
        'staff',
        'offers',
        'reviews',
        'settings',
        'support',
      ]),
    ],
    ['staff', ['staff', 'Staff@123'], tabs('staff', ['', 'done', 'reports'])],
  ];
  const widths = (process.env.WIDTHS || '1280,390').split(',').map(Number);
  for (const width of widths)
    for (const [label, login, pages] of sets)
      if (!process.env.ONLY || process.env.ONLY.split(',').includes(label.split(' ').pop()))
        await audit(browser, label, login, pages, width);
  await browser.close();
  console.log(
    `Click audit: ${report.pages} pages, ${report.clicks} buttons pressed, ${report.dialogs} dialogs opened and closed, ${report.problems.length} problems`,
  );
  [...new Set(report.problems)].forEach((p) => console.log('  ✗ ' + p));
  process.exitCode = report.problems.length ? 1 : 0;
})();
