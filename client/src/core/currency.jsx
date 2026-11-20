// Which currency to show package prices in: the visitor's country, guessed from the device's time
// zone and language region (no outside service), or the one they picked in the "Prices in" menu.

import { useEffect, useState } from 'react';

const ZONES = {
  'Asia/Dubai': 'AE',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Riyadh': 'SA',
  'Asia/Qatar': 'QA',
  'Asia/Muscat': 'OM',
  'Asia/Kuwait': 'KW',
  'Asia/Bahrain': 'BH',
};
const KEY = 'bq_currency';

function deviceCountries() {
  const out = [];
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ZONES[zone]) out.push(ZONES[zone]);
  } catch (e) {}
  for (const lang of (typeof navigator !== 'undefined' && navigator.languages) || []) {
    const m = /[-_]([A-Za-z]{2})$/.exec(lang);
    if (m) out.push(m[1].toUpperCase());
  }
  return out;
}

export function guessCurrency(currencies, fallback) {
  for (const country of deviceCountries()) {
    const c = currencies.find((x) => (x.countries || []).includes(country));
    if (c) return c.code;
  }
  return fallback;
}

/** [code, setCode] – remembered in this browser when the visitor picks one. */
export function useCurrency(site) {
  const currencies = (site && site.currencies) || [];
  const [code, setCode] = useState('');
  useEffect(() => {
    if (!currencies.length || code) return;
    let saved = '';
    try {
      saved = localStorage.getItem(KEY) || '';
    } catch (e) {}
    setCode(
      currencies.some((c) => c.code === saved) ? saved : guessCurrency(currencies, site.defaultCurrency || 'USD'),
    );
  }, [currencies.length]);
  const pick = (next) => {
    setCode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
  };
  return [code, pick];
}

/** A package's price in that currency ("AED 42"), or its own text ("Free", "Talk to us"). */
export const priceIn = (plan, code) => (plan.prices && plan.prices[code]) || plan.price;

/** The "Prices in" menu. */
export function CurrencyPicker({ site, code, onPick, className = '' }) {
  const currencies = (site && site.currencies) || [];
  if (!currencies.length || !code) return null;
  return (
    <label className={'currency-pick ' + className}>
      <span>Prices in</span>
      <select value={code} onChange={(e) => onPick(e.target.value)} aria-label="Currency">
        {currencies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} ({c.code})
          </option>
        ))}
      </select>
    </label>
  );
}
