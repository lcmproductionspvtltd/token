/**
 * Ticket QR proof, end to end, the way it happens in a shop:
 *   1. a customer books a token, 2. opens their ticket and downloads the JPG,
 *   3. the QR in that picture is decoded by the same decoder the staff scanner uses,
 *   4. staff "scan" it: first scan starts the service, second scan finishes it.
 *   BASE=http://localhost:3999 node tests/ui/qr-ticket-proof.js
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { execSync } = require('child_process');
const { login } = require('../helpers/session');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const BASE = process.env.BASE || 'http://localhost:3999';
const DB = process.env.DATABASE_URL || 'postgres://bquee:bquee-dev-pass@127.0.0.1:5432/bquee_test';
const api = async (method, url, body, token) => {
  const r = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
/** Picture file → pixels the decoder reads (via Python Pillow). */
function pixels(file) {
  const raw = file + '.rgba';
  const size = execSync(
    `python3 -c "from PIL import Image;im=Image.open('${file}').convert('RGBA');open('${raw}','wb').write(im.tobytes());print(im.size[0],im.size[1])"`,
  )
    .toString()
    .trim()
    .split(' ')
    .map(Number);
  return { data: new Uint8ClampedArray(fs.readFileSync(raw)), width: size[0], height: size[1] };
}

(async () => {
  const steps = [];
  const step = (ok, text) => steps.push((ok ? '✓ ' : '✗ ') + text);
  const { QRDecode } = await import(
    pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'lib', 'qr-decoder.js')).href
  );

  const ids = JSON.parse(
    execSync(
      `psql ${DB} -At -c "select json_build_object('b',st.branch_id,'staff',st.id,'svc',(select service_id from staff_services where staff_id=st.id limit 1)) from users u join staff st on st.id=u.staff_id where u.username='staff'"`,
    ).toString(),
  );
  const booked = await api('POST', '/api/public/book', {
    branchId: ids.b,
    name: 'QR Proof',
    mobile: '9876512345',
    items: [{ serviceId: ids.svc, staffId: ids.staff }],
  });
  step(booked.status === 200, `1. customer booked a token (id ${booked.data.id})`);

  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await page.goto(BASE + '/t/' + booked.data.id);
  await page.waitForSelector('.tp-preview img, button img', { timeout: 15000 });
  await page.waitForTimeout(800);
  const shot = '/tmp/qr-proof-screen.png';
  await page.locator('button:has(img)').first().screenshot({ path: shot });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download JPG/ }).click(),
  ]);
  const jpg = '/tmp/qr-proof-ticket.jpg';
  await download.saveAs(jpg);
  await browser.close();
  step(
    fs.statSync(jpg).size > 5000,
    `2. ticket shown on the phone and downloaded as JPG (${Math.round(fs.statSync(jpg).size / 1024)} KB)`,
  );

  const fromScreen = QRDecode.decode(pixels(shot));
  const fromJpg = QRDecode.decode(pixels(jpg));
  const want = '/t/' + booked.data.id;
  step(fromScreen && fromScreen.includes(want), `3a. QR read from the phone screen: ${fromScreen}`);
  step(fromJpg && fromJpg.includes(want), `3b. QR read from the downloaded JPG: ${fromJpg}`);

  const staff = (await api('POST', '/api/login', { login: 'staff', password: 'Staff@123' })).data.token;
  const id = (fromJpg || '').split('/t/')[1];
  const first = await api('POST', `/api/token/${id}/next`, {}, staff);
  step(
    first.status === 200 && first.data.token.status === 'serving',
    `4a. staff scan #1 → service started (status: ${first.data.token && first.data.token.status})`,
  );
  const second = await api('POST', `/api/token/${id}/next`, {}, staff);
  step(
    second.status === 200 && second.data.token.status === 'done',
    `4b. staff scan #2 → service finished (status: ${second.data.token && second.data.token.status})`,
  );
  const owner = await login(BASE, 'owner', 'Owner@123'); // includes two-step sign-in
  const list = (await api('GET', '/api/owner/tokens', null, owner)).data;
  const row = (Array.isArray(list) ? list : list.tokens || []).find((t) => t.id === id);
  step(row && row.status === 'done', `5. the owner's token list shows it as ${row ? row.status : 'missing'}`);

  console.log('Ticket QR proof:');
  steps.forEach((s) => console.log('  ' + s));
  process.exitCode = steps.some((s) => s.startsWith('✗')) ? 1 : 0;
})();
