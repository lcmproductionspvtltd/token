'use strict';

/**
 * Package prices in the visitor's own currency – self-contained, no outside service.
 *
 * BQuee knows every currency (src/services/world.js). In Admin → Website the super admin:
 *   - lists the currencies they sell in, each with its rate (1 US$ = 3.6725 AED, 88 ₹, 0.79 £ …);
 *   - gives each package its main price ("₹999", "Free", "Talk to us") and, optionally, fixed prices
 *     ("₹999, AED 149, $39, £35").
 * A visitor sees, in this order:
 *   1. the package's fixed price for their currency;
 *   2. otherwise its US$ price converted with the super admin's rate;
 *   3. otherwise its main price converted the same way.
 * A visitor whose currency isn't in the list sees US dollars. Their country comes from their device
 * (time zone, region setting) – never from an outside service – and they can change it ("Prices in").
 * Conversions are rounded up to a tidy figure (whole units; one decimal for OMR, KWD, BHD, JOD).
 */

const world = require('./world');

const WORLD = world.CURRENCIES;
const BY_CODE = Object.fromEntries(WORLD.map((c) => [c.code, c]));
const DEFAULT_CODE = 'USD';

/** The currencies a new BQuee starts with (the Gulf currencies are fixed to the US dollar). */
const STARTER = [
  { code: 'INR', rate: 88 },
  { code: 'AED', rate: 3.6725 },
  { code: 'SAR', rate: 3.75 },
  { code: 'QAR', rate: 3.64 },
  { code: 'OMR', rate: 0.3845 },
  { code: 'KWD', rate: 0.307 },
  { code: 'BHD', rate: 0.376 },
];

/** Symbols people type, and what they mean (ambiguous ones like ¥ need the code: JPY or CNY). */
const SYMBOLS = {
  '₹': 'INR',
  '£': 'GBP',
  '€': 'EUR',
  '₩': 'KRW',
  '₪': 'ILS',
  '₦': 'NGN',
  '₱': 'PHP',
  '฿': 'THB',
  '₫': 'VND',
};

/**
 * The currencies on sale: US$ plus the super admin's list, each { code, name, symbol, decimals,
 * countries, rate }. `content.rates` is the earlier form ({ AED: 3.6725 }) and still read.
 */
function activeCurrencies(content) {
  const list = Array.isArray(content && content.currencies) ? content.currencies : STARTER;
  const legacy = (content && content.rates) || {};
  const out = [{ ...BY_CODE.USD, rate: 1 }];
  for (const item of list) {
    const meta = item && BY_CODE[String(item.code || '').toUpperCase()];
    if (!meta || meta.code === 'USD' || out.some((c) => c.code === meta.code)) continue;
    const rate = Number(legacy[meta.code]) > 0 ? Number(legacy[meta.code]) : Number(item.rate);
    if (rate > 0 && rate < 1e9) out.push({ ...meta, rate });
  }
  return out;
}

const ratesOf = (active) => Object.fromEntries(active.map((c) => [c.code, c.rate]));

/** "₹999", "Rs 999", "AED 149", "149 AED", "$39", "£35", "USD 39" → { amount, code }; else null. */
function parsePrice(text) {
  const s = String(text || '').trim();
  const m = s.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ''));
  if (!(amount > 0)) return null;
  const rest = s.replace(m[1], ' ').toUpperCase();
  const word = (rest.match(/\b[A-Z]{3}\b/g) || []).find((w) => BY_CODE[w]);
  let code = word;
  if (!code) {
    const sym = Object.keys(SYMBOLS).find((x) => rest.includes(x));
    if (sym) code = SYMBOLS[sym];
    else if (/\bRS\.?\b/.test(rest)) code = 'INR';
    else if (/\bDHS?\b|د\.إ/.test(rest)) code = 'AED';
    else if (/\$/.test(rest)) code = 'USD';
    else code = 'INR'; // the built-in prices are in rupees
  }
  return { amount, code };
}

/**
 * "₹999, AED 149, $39, £35" → { INR: 999, AED: 149, USD: 39, GBP: 35 }. Throws (with the piece it
 * couldn't read) so the super admin sees what to fix.
 */
function parseFixed(text) {
  const out = {};
  for (const piece of String(text || '')
    .split(/[;\n]|,(?!\d{3}\b)/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    const p = parsePrice(piece);
    const hasCurrency = /[A-Za-z]{3}|[₹£€₩₪₦₱฿₫$]|\bRs\b|\bDhs?\b/i.test(piece.replace(/[\d.,\s]/g, ' '));
    if (!p || !hasCurrency) throw new Error(piece);
    out[p.code] = p.amount;
  }
  return out;
}

/** A package's fixed prices: its "₹999, AED 149" text plus the earlier priceINR/priceAED… fields. */
function fixedOf(plan) {
  const out = {};
  for (const code of Object.keys(BY_CODE)) {
    const n = Number(plan && plan['price' + code]);
    if (n > 0) out[code] = n;
  }
  try {
    Object.assign(out, parseFixed(plan && plan.fixedPrices));
  } catch (err) {
    // saved text is checked when it is saved; ignore anything odd here
  }
  return out;
}

/** Converts and rounds up to a tidy figure (whole units; one decimal for the strong dinars/rials). */
function convert(amount, from, to, rates) {
  if (from === to) return amount;
  if (!(rates[from] > 0) || !(rates[to] > 0)) return 0;
  const raw = (amount / rates[from]) * rates[to];
  const f = 10 ** BY_CODE[to].decimals;
  return Math.ceil(raw * f - 1e-9) / f;
}

function format(amount, code) {
  const c = BY_CODE[code];
  return c.symbol + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/** What a package costs in `code`: a fixed price, else US$ converted, else the main price converted. */
function amountFor(plan, code, rates) {
  if (!(rates[code] > 0)) return 0;
  const fixed = fixedOf(plan);
  if (fixed[code]) return fixed[code];
  if (fixed.USD) return convert(fixed.USD, 'USD', code, rates);
  const p = parsePrice(plan && plan.price);
  if (p && rates[p.code] > 0) return convert(p.amount, p.code, code, rates);
  // A fixed price in some other currency on sale.
  const other = Object.keys(fixed).find((c) => rates[c] > 0);
  return other ? convert(fixed[other], other, code, rates) : 0;
}

/** A package's price in every currency on sale: { INR: '₹999', AED: 'AED 149', … }, or null for "Free". */
function pricesFor(plan, active) {
  const rates = ratesOf(active);
  const out = {};
  for (const c of active) {
    const n = amountFor(plan, c.code, rates);
    if (n > 0) out[c.code] = format(n, c.code);
  }
  return Object.keys(out).length ? out : null;
}

/** The currency a package's own price is written in (for a sign-up that sends no currency). */
function baseCode(plan) {
  const p = parsePrice(plan && plan.price);
  if (p) return p.code;
  return Object.keys(fixedOf(plan))[0] || 'INR';
}

/** The visitor's currency from their device's time zone / region – or US$ when it isn't on sale. */
function currencyHint({ tz, region } = {}, active) {
  const countries = [world.ZONES[String(tz || '')], String(region || '').toUpperCase()].filter(Boolean);
  for (const country of countries) {
    const c = active.find((x) => x.countries.includes(country));
    if (c) return c.code;
  }
  return DEFAULT_CODE;
}

module.exports = {
  WORLD,
  BY_CODE,
  DEFAULT_CODE,
  STARTER,
  activeCurrencies,
  ratesOf,
  parsePrice,
  parseFixed,
  fixedOf,
  convert,
  format,
  amountFor,
  pricesFor,
  baseCode,
  currencyHint,
};
