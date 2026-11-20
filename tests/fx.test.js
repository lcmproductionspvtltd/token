'use strict';

/**
 * Package prices in the visitor's currency (src/services/fx.js) – self-contained:
 *   1. the package's fixed price for that currency, when the super admin set one;
 *   2. else its US$ price converted with the super admin's rate;
 *   3. else its main price converted.
 * Also: reading "₹999" / "AED 149" / "$39", tidy rounding, and the rates the super admin types.
 */

const fx = require('../src/services/fx');

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name + (detail ? ` – ${detail}` : ''));
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const r = fx.BUILT_IN_RATES; // 1 USD = 88 INR = 3.6725 AED = 3.75 SAR = 0.307 KWD

// Reading prices
check('₹999 → INR 999', same(fx.parsePrice('₹999'), { amount: 999, code: 'INR' }));
check('Rs. 1,499 → INR 1499', same(fx.parsePrice('Rs. 1,499'), { amount: 1499, code: 'INR' }));
check('AED 149 → AED', same(fx.parsePrice('AED 149'), { amount: 149, code: 'AED' }));
check('$39.50 → USD', same(fx.parsePrice('$39.50'), { amount: 39.5, code: 'USD' }));
check('"Free" has no price', fx.parsePrice('Free') === null && fx.pricesFor({ price: 'Free' }, r) === null);

// Your example: fixed prices for India, UAE and US$ – a Saudi visitor gets the US$ price in riyals.
const business = { name: 'Business', price: '₹999', priceINR: 999, priceAED: 149, priceUSD: 39 };
const p = fx.pricesFor(business, r);
check('India sees the fixed ₹999', p.INR === '₹999');
check('UAE sees the fixed AED 149 (not converted)', p.AED === 'AED 149');
check('US$ visitors see the fixed $39', p.USD === '$39');
check('Saudi (no fixed price) sees $39 × 3.75 = SAR 147', p.SAR === 'SAR 147', p.SAR);
check('Kuwait sees $39 × 0.307 = KWD 12 (one decimal, rounded up)', p.KWD === 'KWD 12', p.KWD);
check('all 8 currencies are priced', Object.keys(p).length === 8);

// The super admin's own rate is used for the conversion.
const myRates = fx.ratesFrom({ SAR: '3.80', INR: 90, AED: 'nonsense', USD: 5 });
check('a typed rate replaces the built-in one', myRates.SAR === 3.8 && myRates.INR === 90);
check('a bad rate keeps the built-in one; US$ is always 1', myRates.AED === 3.6725 && myRates.USD === 1);
check('Saudi price follows the new rate: $39 × 3.80 = SAR 149', fx.pricesFor(business, myRates).SAR === 'SAR 149');

// No US$ price → the main price is converted.
const plain = { name: 'Plain', price: '₹999' };
check('no fixed prices: ₹999 → AED 42', fx.pricesFor(plain, r).AED === 'AED 42');
check('no fixed prices: ₹999 → $12', fx.pricesFor(plain, r).USD === '$12');
check(
  'only a US$ price: "Talk to us" main text, $50 → ₹4,400',
  fx.pricesFor({ price: 'Talk to us', priceUSD: 50 }, r).INR === '₹4,400',
);

// What a business is charged at sign-up (the same rule, as a number).
check('sign-up in SAR: 147', fx.amountFor(business, 'SAR', r) === 147);
check('sign-up in AED: the fixed 149', fx.amountFor(business, 'AED', r) === 149);
check('unknown currency → 0 (the server then uses the package’s own)', fx.amountFor(business, 'XYZ', r) === 0);
check(
  'the package’s own currency (no currency sent)',
  fx.baseCode(business) === 'INR' && fx.baseCode({ priceAED: 99 }) === 'AED',
);
check(
  'every GCC country + India has its currency',
  ['AE', 'IN', 'SA', 'QA', 'OM', 'KW', 'BH'].every((c) => fx.CURRENCIES.some((x) => x.countries.includes(c))),
);
check(
  'nothing is fetched from outside (no fetch in the service)',
  !/fetch\(/.test(require('fs').readFileSync(require.resolve('../src/services/fx'), 'utf8')),
);

console.log(`Prices by currency: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
