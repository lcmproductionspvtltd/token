'use strict';

/**
 * Package prices in the visitor's currency (src/services/fx.js) – self-contained, every currency:
 *   1. the package's fixed price for that currency ("₹999, AED 149, $39, £35");
 *   2. else its US$ price converted with the super admin's rate;
 *   3. else its main price converted.
 * A currency the super admin hasn't listed shows US$. The country comes from the device's time zone.
 */

const fx = require('../src/services/fx');
const world = require('../src/services/world');

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name + (detail ? ` – ${detail}` : ''));
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Built-in world data
check('about 150 currencies built in', world.CURRENCIES.length >= 150);
check('every country is covered once', new Set(world.CURRENCIES.flatMap((c) => c.countries)).size >= 240);
check(
  'time zones → countries (old names too)',
  world.ZONES['Asia/Dubai'] === 'AE' &&
    world.ZONES['Asia/Kolkata'] === 'IN' &&
    world.ZONES['Asia/Calcutta'] === 'IN' &&
    world.ZONES['Europe/London'] === 'GB' &&
    world.ZONES['Asia/Karachi'] === 'PK',
);

// Reading prices
check('₹999 → INR', same(fx.parsePrice('₹999'), { amount: 999, code: 'INR' }));
check('£35 → GBP, €40 → EUR', fx.parsePrice('£35').code === 'GBP' && fx.parsePrice('€40').code === 'EUR');
check('PKR 9,999 → PKR 9999', same(fx.parsePrice('PKR 9,999'), { amount: 9999, code: 'PKR' }));
check(
  'fixed prices text',
  same(fx.parseFixed('₹999, AED 149, $39, £35, PKR 9,999'), { INR: 999, AED: 149, USD: 39, GBP: 35, PKR: 9999 }),
);
let refused = '';
try {
  fx.parseFixed('₹999, banana');
} catch (e) {
  refused = e.message;
}
check('a piece it can’t read is named', refused === 'banana');

// Your example: you sell in ₹, AED and £ (with rates); fixed ₹999 / AED 149 / $39 for Business.
const content = {
  currencies: [
    { code: 'INR', rate: 88 },
    { code: 'AED', rate: 3.6725 },
    { code: 'SAR', rate: 3.75 },
    { code: 'GBP', rate: 0.79 },
  ],
};
const active = fx.activeCurrencies(content);
check('US$ is always on sale, first', active[0].code === 'USD' && active.length === 5);
const business = { name: 'Business', price: '₹999', fixedPrices: '₹999, AED 149, $39' };
const p = fx.pricesFor(business, active);
check('India: your fixed ₹999', p.INR === '₹999');
check('UAE: your fixed AED 149', p.AED === 'AED 149');
check('Saudi (no fixed price): $39 × 3.75 = SAR 147', p.SAR === 'SAR 147', p.SAR);
check('UK (no fixed price): $39 × 0.79 = £31', p.GBP === '£31', p.GBP);
check('only the currencies on sale are priced', Object.keys(p).sort().join() === 'AED,GBP,INR,SAR,USD');

// Which currency a visitor gets
check('Dubai time zone → AED', fx.currencyHint({ tz: 'Asia/Dubai' }, active) === 'AED');
check('London time zone → GBP', fx.currencyHint({ tz: 'Europe/London' }, active) === 'GBP');
check('Karachi (PKR not on sale) → US$', fx.currencyHint({ tz: 'Asia/Karachi' }, active) === 'USD');
check('no time zone, region IN → INR', fx.currencyHint({ region: 'in' }, active) === 'INR');

// Fallbacks
check('no fixed prices: ₹999 → AED 42', fx.pricesFor({ price: '₹999' }, active).AED === 'AED 42');
check('"Free" has no price', fx.pricesFor({ price: 'Free' }, active) === null);
check(
  'the earlier priceAED field still counts',
  fx.pricesFor({ price: '₹999', priceAED: 120 }, active).AED === 'AED 120',
);
check('sign-up amount in SAR: 147', fx.amountFor(business, 'SAR', fx.ratesOf(active)) === 147);
check(
  'a currency not on sale costs nothing (the server uses US$)',
  fx.amountFor(business, 'PKR', fx.ratesOf(active)) === 0,
);
check('earlier saved rates still apply', fx.activeCurrencies({ ...content, rates: { AED: 3.7 } })[2].rate === 3.7);
check(
  'nothing is fetched from outside',
  !/fetch\(/.test(require('fs').readFileSync(require.resolve('../src/services/fx'), 'utf8')),
);

console.log(`Prices by currency: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
