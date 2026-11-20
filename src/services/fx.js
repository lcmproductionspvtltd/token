'use strict';

/**
 * Package prices in the visitor's own currency.
 *
 * The super admin writes each home-page package price once, in any of the currencies below
 * ("₹999", "AED 149", "$39"). BQuee converts it into every other currency with exchange rates it
 * fetches twice a day from a free rate service (open.er-api.com – no key, no account) and keeps in
 * the database. If that service can't be reached, the last saved rates are used, and before the
 * first fetch the built-in rates below (the Gulf currencies are fixed to the US dollar; INR is
 * approximate). FX_URL=off switches fetching off (tests, or servers without internet).
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

/** Units per 1 US dollar, used until the first successful fetch. */
const BUILT_IN_RATES = { USD: 1, INR: 88, AED: 3.6725, SAR: 3.75, QAR: 3.64, OMR: 0.3845, KWD: 0.307, BHD: 0.376 };

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
  const raw = (amount / (r[from] || BUILT_IN_RATES[from])) * (r[to] || BUILT_IN_RATES[to]);
  const f = 10 ** BY_CODE[to].decimals;
  return Math.ceil(raw * f - 1e-9) / f;
}

function format(amount, code) {
  const c = BY_CODE[code];
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: c.decimals });
  return c.symbol + n;
}

/** A package's price in every currency: { INR: '₹999', AED: 'AED 42', … }, or null for "Free" / "Talk to us". */
function pricesFor(priceText, rates) {
  const p = parsePrice(priceText);
  if (!p) return null;
  return Object.fromEntries(CODES.map((code) => [code, format(convert(p.amount, p.code, code, rates), code)]));
}

/** The amount (a number) a business pays for a package in the currency it signed up with. */
function amountFor(priceText, code, rates) {
  const p = parsePrice(priceText);
  if (!p) return 0;
  return convert(p.amount, p.code, BY_CODE[code] ? code : p.code, rates);
}

function createFx(db, { url = 'https://open.er-api.com/v6/latest/USD', log = console } = {}) {
  let cache = null; // { rates, updatedAt }

  async function load() {
    const { rows } = await db.query("SELECT data FROM site_content WHERE key = 'fx'");
    const d = rows[0] && rows[0].data;
    cache = d && d.rates ? d : { rates: { ...BUILT_IN_RATES }, updatedAt: 0, builtIn: true };
    return cache;
  }

  async function current() {
    return cache || load();
  }

  /** Fetches fresh rates; keeps the old ones when the service is down or answers nonsense. */
  async function refresh() {
    if (!url || url === 'off') return false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const body = await res.json();
      const got = body && body.rates;
      const rates = {};
      for (const code of CODES) {
        const n = Number(got && got[code]);
        // A rate far from the built-in one is a broken answer, not a market move.
        if (!(n > 0) || n > BUILT_IN_RATES[code] * 3 || n < BUILT_IN_RATES[code] / 3)
          throw new Error(`bad ${code} rate`);
        rates[code] = n;
      }
      rates.USD = 1;
      const data = { rates, updatedAt: Date.now(), source: 'open.er-api.com' };
      await db.query(
        `INSERT INTO site_content (key, data, updated_at) VALUES ('fx', $1, now())
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [JSON.stringify(data)],
      );
      cache = data;
      return true;
    } catch (err) {
      log.error(JSON.stringify({ alert: 'fx_refresh_failed', error: String(err.message || err).slice(0, 200) }));
      return false;
    }
  }

  return {
    current,
    refresh,
    /** Fetch now and then every `everyMs` (twice a day by default). */
    start(everyMs = 12 * 60 * 60_000) {
      load()
        .then(refresh)
        .catch(() => {});
      return setInterval(() => refresh().catch(() => {}), everyMs).unref();
    },
  };
}

module.exports = {
  CURRENCIES,
  CODES,
  DEFAULT_CODE,
  BUILT_IN_RATES,
  parsePrice,
  convert,
  format,
  pricesFor,
  amountFor,
  createFx,
};
