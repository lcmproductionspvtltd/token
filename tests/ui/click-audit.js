/**
 * Click audit: signs in as each role, opens every menu page and presses every safe button,
 * then reports JavaScript errors, failed server calls (5xx) and buttons that crashed the page.
 *   BASE=http://localhost:3999 node tests/ui/click-audit.js
 * Needs the demo data (SEED_DEMO_DATA=1) and Playwright.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { uiLogin } = require('../helpers/session');

const BASE = process.env.BASE || 'http://localhost:3999';
// Buttons that would delete, sign out, cancel or leave – skipped so the audit can keep going.
const SKIP =
  /lost phone|new backup codes|sign out all|make new codes|delete|remove|sign out|log ?out|cancel token|reset|disable|deactivate|turn off|^cancel$|close ticket|resolve|end|finish|start|mark|install|download|print|share|copy|whatsapp|call|directions|instagram|open my page|scan/i;

const report = { pages: 0, clicks: 0, dialogs: 0, problems: [] };

async function audit(browser, label, login, pages, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.grantPermissions([]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(1500); // a button that vanished after a re-render is skipped quickly
  const problem = (what) => report.problems.push(`[${label} ${width}px] ${what}`);
  page.on('pageerror', (e) => problem('JS error: ' + e.message));
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
      const kind = name.split(' ')[0].toLowerCase();
      if ((seen.get(kind) || 0) >= 2) continue;
      seen.set(kind, (seen.get(kind) || 0) + 1);
      pressed++;
      const before = page.url();
      try {
        await btn.click({ timeout: 2000 });
        report.clicks++;
        await page.waitForTimeout(350);
        const dialog = page.locator('[role=dialog]:visible, .dialog:visible');
        if (await dialog.count()) {
          report.dialogs++;
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
    ['visitor', null, ['/', '/login', '/signup', `/b/${ids.b}`, `/b/${ids.b}/book`, `/s/${ids.s}`, `/t/${ids.t}`]],
    [
      'super admin',
      ['admin', 'Admin@123'],
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
    ['staff', ['staff', 'Staff@123'], ['/staff']],
  ];
  for (const width of [1280, 390])
    for (const [label, login, pages] of sets) await audit(browser, label, login, pages, width);
  await browser.close();
  console.log(
    `Click audit: ${report.pages} pages, ${report.clicks} buttons pressed, ${report.dialogs} dialogs opened and closed, ${report.problems.length} problems`,
  );
  [...new Set(report.problems)].forEach((p) => console.log('  ✗ ' + p));
  process.exitCode = report.problems.length ? 1 : 0;
})();
