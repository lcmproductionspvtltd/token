/* Formatting helpers: dates, money, waits, token numbers, statuses, the salon brand colour. */

const pad = (n) => String(n).padStart(2, '0');

/** Local date as YYYY-MM-DD. */
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => isoDate(new Date());

export function addYears(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return isoDate(d);
}

export const money = (value, currency) =>
  (currency || '₹') + Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Minutes → "No wait", "25 min", "1 h 10 min". */
export function waitText(minutes) {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m === 0) return 'No wait';
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

export const clock = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export function dayText(iso) {
  if (!iso) return '';
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (err) {
    return iso;
  }
}

export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Token number as printed: "A-007" or "#007". */
export const tokenNo = (t) => (t.prefix ? `${t.prefix}-` : '#') + String(t.number).padStart(3, '0');

const STATUS = {
  waiting: 'Waiting',
  serving: 'In service',
  in_progress: 'In service',
  done: 'Completed',
  cancelled: 'Cancelled',
  missed: 'Expired',
};
export const statusLabel = (s) => STATUS[s] || s;

/** Statuses after which a token never changes again. */
export const FINAL = ['done', 'cancelled', 'missed'];

export const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function hashHue(text) {
  let h = 0;
  for (const ch of String(text || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export const DEFAULT_BRAND = '#7b2c9e';
export const validColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : DEFAULT_BRAND);

/** Applies a salon's brand colour to the whole app (every tint is derived from it in CSS). */
export function applyBrand(color) {
  const c = validColor(color);
  document.documentElement.style.setProperty('--brand', c);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = c;
}

/**
 * Browser tab icon. A business's customer pages show its logo; everywhere else (and for a
 * business with no logo) it is the BQuee logo from index.html.
 *   useEffect(() => (setFavicon(salon.logo), () => setFavicon('')), [salon.logo]);
 */
export function setFavicon(url) {
  document.querySelectorAll('link[rel="icon"]').forEach((link) => {
    if (!link.dataset.bquee) link.dataset.bquee = link.getAttribute('href');
    link.href = url || link.dataset.bquee;
    // The logo can be PNG, JPEG or WebP, so let the browser read the type from the file.
    if (url) link.removeAttribute('type');
    else if (/\.png/.test(link.dataset.bquee)) link.type = 'image/png';
  });
}

/** Category name → icon. */
export function categoryIcon(text) {
  const c = String(text || '').toLowerCase();
  if (/hair|cut|colou?r|beard|shave|style/.test(c)) return 'scissors';
  if (/beauty|skin|face|facial|makeup|tan|bridal/.test(c)) return 'smile';
  if (/spa|massage|relax|body|wellness/.test(c)) return 'lotus';
  if (/nail|hand|mani|pedi/.test(c)) return 'hand';
  if (/consult|doctor|clinic|health|check/.test(c)) return 'user';
  if (/express|quick|fast|priority/.test(c)) return 'bolt';
  if (/desk|document|bill|pay|enquiry|info/.test(c)) return 'list';
  return 'tag';
}

/** Money off a subtotal for an offer discount (mirrors the server). */
export function offerDiscount(offer, subtotal) {
  if (!offer) return 0;
  const v = Number(offer.discountValue || 0);
  if (offer.discountType === 'percent') return Math.round(subtotal * Math.min(v, 100)) / 100;
  if (offer.discountType === 'flat') return Math.min(v, subtotal);
  return 0;
}

/** Short label for an offer's discount, e.g. "20% off" or "₹100 off". */
export function offerLabel(offer, currency) {
  if (!offer || !offer.discountType || offer.discountType === 'none') return '';
  return offer.discountType === 'percent'
    ? Number(offer.discountValue) + '% off'
    : money(offer.discountValue, currency) + ' off';
}

export const telLink = (phone) => 'tel:' + String(phone || '').replace(/[^0-9+]/g, '');
export const waLink = (num) => 'https://wa.me/' + String(num || '').replace(/[^0-9]/g, '');
export const igLink = (handle) => socialLink('instagram', handle);
const mapLink = (address) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address || '');

/**
 * Turns what an owner typed (a full link, "facebook.com/x", "@handle" or "handle") into a safe
 * https link. Anything that isn't a web address becomes a link on the right site.
 */
const SOCIAL_SITES = {
  instagram: 'https://instagram.com/',
  facebook: 'https://facebook.com/',
  youtube: 'https://youtube.com/@',
  x: 'https://x.com/',
};
export function socialLink(kind, value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(v)) return 'https://' + v;
  if (kind === 'website') return 'https://' + v.replace(/^\/+/, '');
  return (SOCIAL_SITES[kind] || 'https://') + v.replace(/^@/, '');
}
/** Short label for a social link: "@handle" or the bare domain. */
export function socialLabel(kind, value) {
  const v = String(value || '')
    .trim()
    .replace(/\/+$/, '');
  if (kind === 'website') return v.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const last = v.split('/').pop().replace(/^@/, '');
  return last ? '@' + last : v;
}
/** The owner's own Google Maps link if it's a web link, otherwise a search for the address. */
export const directionsLink = (salon, address) =>
  /^https:\/\//i.test(salon.mapUrl || '')
    ? salon.mapUrl
    : mapLink(salon.name + ', ' + (address || salon.address || ''));
