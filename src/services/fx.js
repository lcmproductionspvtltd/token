'use strict';

/**
 * Package prices in the visitor's own currency – self-contained, no outside service.
 *
 * In Admin → Website the super admin gives each package
 *   - its main price ("₹999", "Free", "Talk to us"), and
 *   - optionally a fixed price per currency (priceUSD, priceINR, priceAED, …), e.g. ₹999, AED 149, $39,
 * and keeps a small table of rates: how much of each currency 1 US dollar is (1 US$ = 3.6725 AED).
 *
 * A visitor sees, in this order:
 *   1. the fixed price for their currency, when the super admin set one;
 *   2. otherwise the package's US$ price converted with the super admin's rate;
 *   3. otherwise the main price converted the same way.
 * Conversions are rounded up to a tidy figure (whole units; one decimal for OMR, KWD and BHD).
 */

/** The currencies BQuee shows. `countries` = ISO country codes that see that currency. */
const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian rupee', countries: ['IN'], decimals: 0 },
  { code: 'AED', symbol: 'AED ', name: 'UAE dirham', countries: ['AE'], decimals: 0 },
  { code: 'SAR', symbol: 'SAR ', name: 'Saudi riyal', countries: ['SA'], decimals: 0 },
  { code: 'QAR', symbol: 'QAR ', name: 'Qatari riyal', countries: ['QA'], decimals: 0 },
  { code: 'OMR', symbol: 'OMR ', name: 'Omani rial', countries: ['OM'], decimals: 1 },
  { code: 'KWD', symbol: 'KWD ', name: 'Kuwaiti dinar', countries: ['KW'], decimals: 1 },
  { code: 'BHD', symbol: 'BHD ', name: 'Bahraini dinar', countries: ['BH'], decimals: 1 },
  { code: 'USD', symbol: '$', name: 'US dollar', countries: [], decimals: 0 }, // everyone else
];
const CODES = CURRENCIES.map((c) => c.code);
const BY_CODE = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));
const DEFAULT_CODE = 'USD';

/** Units per 1 US dollar until the super admin changes them (the Gulf currencies are fixed to the dollar). */
const BUILT_IN_RATES = { USD: 1, INR: 88, AED: 3.6725, SAR: 3.75, QAR: 3.64, OMR: 0.3845, KWD: 0.307, BHD: 0.376 };

/** The super admin's rates, each checked; anything missing or odd falls back to the built-in rate. */
function ratesFrom(saved) {
  const out = { ...BUILT_IN_RATES };
  for (const code of CODES) {
    const n = Number(saved && saved[code]);
    if (code !== 'USD' && n > 0 && n < 1_000_000) out[code] = n;
  }
  return out;
}

/** "₹999", "Rs 999", "AED 149", "149 AED", "$39", "USD 39" → { amount, code }; anything else → null. */
function parsePrice(text) {
  const s = String(text || '').trim();
  const m = s.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ''));
  if (!(amount > 0)) return null;
  const rest = s.replace(m[1], ' ').toUpperCase();
  let code = CODES.find((c) => new RegExp(`\\b${c}\\b`).test(rest));
  if (!code) {
    if (/₹|\bRS\.?\b/.test(rest)) code = 'INR';
    else if (/\bDHS?\b|د\.إ/.test(rest)) code = 'AED';
    else if (/\$/.test(rest)) code = 'USD';
    else code = 'INR'; // the built-in prices are in rupees
  }
  return { amount, code };
}

/** Converts and rounds up to a tidy figure (whole units; one decimal for OMR, KWD and BHD). */
function convert(amount, from, to, rates) {
  if (from === to) return amount;
  const r = rates || BUILT_IN_RATES;
  const raw = (amount / r[from]) * r[to];
  const f = 10 ** BY_CODE[to].decimals;
  return Math.ceil(raw * f - 1e-9) / f;
}

function format(amount, code) {
  const c = BY_CODE[code];
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return c.symbol + n;
}

/** A package's fixed price in one currency (a number > 0), or 0 when none was set. */
const fixed = (plan, code) => {
  const n = Number(plan && plan['price' + code]);
  return n > 0 ? n : 0;
};

/** What a package costs in `code`: a fixed price, else US$ converted, else the main price converted. */
function amountFor(plan, code, rates) {
  if (!BY_CODE[code]) return 0;
  const own = fixed(plan, code);
  if (own) return own;
  const usd = fixed(plan, 'USD');
  if (usd) return convert(usd, 'USD', code, rates);
  const p = parsePrice(plan && plan.price);
  return p ? convert(p.amount, p.code, code, rates) : 0;
}

/** A package's price in every currency: { INR: '₹999', AED: 'AED 149', … }, or null for "Free" / "Talk to us". */
function pricesFor(plan, rates) {
  const anyFixed = CODES.some((c) => fixed(plan, c));
  if (!anyFixed && !parsePrice(plan && plan.price)) return null;
  return Object.fromEntries(CODES.map((code) => [code, format(amountFor(plan, code, rates), code)]));
}

/** The currency a package's own price is written in (for a sign-up that sends no currency). */
function baseCode(plan) {
  const p = parsePrice(plan && plan.price);
  if (p) return p.code;
  return CODES.find((c) => fixed(plan, c)) || 'INR';
}

module.exports = {
  CURRENCIES,
  CODES,
  DEFAULT_CODE,
  BUILT_IN_RATES,
  ratesFrom,
  parsePrice,
  convert,
  format,
  amountFor,
  pricesFor,
  baseCode,
};
