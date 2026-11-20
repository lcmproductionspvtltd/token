'use strict';

/**
 * Package prices in the visitor's currency (src/services/fx.js):
 *   - reading "₹999", "AED 149", "$39"; "Free" / "Talk to us" stay text
 *   - converting with tidy rounding (whole units; one decimal for OMR, KWD, BHD)
 *   - fetching rates from a (local, fake) rate service, keeping the old rates on a broken answer
 */

const http = require('http');
const { createPool } = require('../src/db/postgres');
const { migrate } = require('../src/db/migrate');
const fx = require('../src/services/fx');

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name + (detail ? ` – ${detail}` : ''));
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}
const quiet = { error() {}, warn() {}, log() {} };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  // Reading prices
  check('₹999 → INR 999', same(fx.parsePrice('₹999'), { amount: 999, code: 'INR' }));
  check('Rs. 1,499 → INR 1499', same(fx.parsePrice('Rs. 1,499'), { amount: 1499, code: 'INR' }));
  check('AED 149 → AED', same(fx.parsePrice('AED 149'), { amount: 149, code: 'AED' }));
  check('149 Dhs → AED', same(fx.parsePrice('149 Dhs'), { amount: 149, code: 'AED' }));
  check('$39.50 → USD', same(fx.parsePrice('$39.50'), { amount: 39.5, code: 'USD' }));
  check('SAR 150 → SAR', same(fx.parsePrice('SAR 150'), { amount: 150, code: 'SAR' }));
  check('"Free" has no price', fx.parsePrice('Free') === null && fx.pricesFor('Free') === null);
  check('"Talk to us" has no price', fx.pricesFor('Talk to us') === null);

  // Converting (built-in rates: 1 USD = 88 INR = 3.6725 AED = 0.307 KWD)
  const r = fx.BUILT_IN_RATES;
  check('same currency is unchanged', fx.convert(999, 'INR', 'INR', r) === 999);
  check('₹999 → AED 42 (rounded up to a whole dirham)', fx.convert(999, 'INR', 'AED', r) === 42);
  check('₹999 → $12', fx.convert(999, 'INR', 'USD', r) === 12);
  check('₹999 → KWD 3.5 (one decimal)', fx.convert(999, 'INR', 'KWD', r) === 3.5);
  check('AED 149 → ₹3571', fx.convert(149, 'AED', 'INR', r) === 3571);
  const p = fx.pricesFor('₹999', r);
  check('a price in all 8 currencies', p && Object.keys(p).length === 8 && p.INR === '₹999' && p.AED === 'AED 42');
  check('big numbers get commas', fx.pricesFor('AED 1000', r).INR === '₹23,962');
  check('sign-up amount in the chosen currency', fx.amountFor('₹999', 'SAR', r) === 43);
  check('unknown currency → the price’s own', fx.amountFor('₹999', 'XYZ', r) === 999);
  check(
    'every GCC country + India has its currency',
    ['AE', 'IN', 'SA', 'QA', 'OM', 'KW', 'BH'].every((c) => fx.CURRENCIES.some((x) => x.countries.includes(c))),
  );

  // Fetching rates (a local stand-in for the rate service)
  if (!process.env.TEST_DATABASE_URL) {
    console.log('(no TEST_DATABASE_URL – skipping the rate-fetch checks)');
  } else {
    const db = createPool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
    await migrate(db);
    await db.query("DELETE FROM site_content WHERE key = 'fx'");
    let answer = { result: 'success', rates: { ...r, INR: 90, AED: 3.6725 } };
    const server = http.createServer((req, res) => res.end(JSON.stringify(answer)));
    await new Promise((ok) => server.listen(0, ok));
    const url = `http://127.0.0.1:${server.address().port}/latest`;

    const rates = fx.createFx(db, { url, log: quiet });
    check('before any fetch: built-in rates', (await rates.current()).rates.INR === 88);
    check('a good answer is saved', (await rates.refresh()) === true && (await rates.current()).rates.INR === 90);
    const fresh = fx.createFx(db, { url: 'off', log: quiet });
    check('another server reads the saved rates', (await fresh.current()).rates.INR === 90);

    answer = { result: 'success', rates: { ...r, INR: 9000 } }; // nonsense
    check('a broken answer is refused', (await rates.refresh()) === false);
    check('…and the old rates stay', (await rates.current()).rates.INR === 90);
    answer = { result: 'error' };
    check(
      'an error answer keeps the old rates',
      (await rates.refresh()) === false && (await rates.current()).rates.INR === 90,
    );
    check('FX_URL=off never fetches', (await fresh.refresh()) === false);

    server.close();
    await db.query("DELETE FROM site_content WHERE key = 'fx'");
    await db.end();
  }

  console.log(`Prices by currency: ${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
})().catch((e) => {
  console.error('Currency test crashed:', e);
  process.exit(1);
});
