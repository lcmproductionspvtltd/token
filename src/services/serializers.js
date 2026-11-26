'use strict';

/** Database rows → JSON shapes used by the web app. */

const { toMillis, today } = require('../utils/time');

const salonPublic = (s) => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  tagline: s.tagline,
  phone: s.phone,
  address: s.address,
  currency: s.currency,
  color: s.brand_color,
  logo: s.logo_url,
  // 'single' skips that step of the customer booking form.
  serviceMode: s.service_mode === 'single' ? 'single' : 'multiple',
  staffMode: s.staff_mode === 'single' ? 'single' : 'multiple',
  // 'whole': one Start / Finish for all of a token's services; 'perService': each on its own.
  tokenFlow: s.token_flow === 'whole' ? 'whole' : 'perService',
});

const salonProfile = (s) => ({
  ...salonPublic(s),
  cover: s.cover_url,
  about: s.about,
  hours: s.hours,
  whatsapp: s.whatsapp,
  instagram: s.instagram,
  email: s.email,
  facebook: s.facebook || '',
  youtube: s.youtube || '',
  x: s.x_handle || '',
  website: s.website || '',
  mapUrl: s.map_url || '',
});

const branch = (b) => ({
  id: b.id,
  name: b.name,
  prefix: b.token_prefix,
  address: b.address,
  phone: b.phone,
  active: b.is_active,
});

/** branchPrices: { branchId: price } for branches that charge a different price than `price`. */
const service = (s, branchIds = [], branchPrices = {}) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  description: s.description,
  duration: s.duration_min,
  price: Number(s.price),
  image: s.image_url,
  branchIds,
  branchPrices: Object.fromEntries(Object.entries(branchPrices || {}).map(([k, p]) => [k, Number(p)])),
  active: s.is_active,
});

const offer = (o) => ({
  id: o.id,
  title: o.title,
  badge: o.badge,
  description: o.description,
  code: o.promo_code,
  validTill: o.valid_until || '',
  theme: o.theme,
  image: o.image_url,
  active: o.is_active,
  expired: !!o.valid_until && o.valid_until < today(),
  discountType: o.discount_type || 'none',
  discountValue: Number(o.discount_value || 0),
});

/** Money off a subtotal for a discount ("percent" of it, or a "flat" amount, never more than it). */
function discountFor(type, value, subtotal) {
  const v = Number(value || 0);
  if (type === 'percent') return Math.round(subtotal * Math.min(v, 100)) / 100;
  if (type === 'flat') return Math.min(v, subtotal);
  return 0;
}

const testimonial = (t) => ({
  id: t.id,
  name: t.client_name,
  label: t.label,
  text: t.quote,
  rating: t.rating,
  photo: t.photo_url,
  active: t.is_active,
});

const tokenItem = (i) => ({
  serviceId: i.service_id,
  serviceName: i.service_name,
  staffId: i.staff_id,
  staffName: i.staff_name,
  duration: i.duration_min,
  price: Number(i.price),
  status: i.status,
  startedAt: toMillis(i.started_at),
  endedAt: toMillis(i.ended_at),
});

function maskMobile(mobile) {
  const d = String(mobile || '');
  return d.length <= 5 ? '•••' : d.slice(0, 2) + '•'.repeat(Math.max(3, d.length - 5)) + d.slice(-3);
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  return domain ? local.slice(0, 2) + '•••@' + domain : '';
}

/** `mask: true` hides the customer's contact details (public token page). */
function token(t, { mask = false } = {}) {
  const items = (t.items || []).map(tokenItem);
  const subtotal = items.reduce((a, i) => a + i.price, 0);
  const doneSubtotal = items.filter((i) => i.status === 'done').reduce((a, i) => a + i.price, 0);
  const discount = discountFor(t.discount_type, t.discount_value, subtotal);
  return {
    id: t.id,
    salonId: t.salon_id,
    branchId: t.branch_id,
    date: t.token_date,
    number: t.number,
    prefix: t.prefix,
    customer: {
      name: t.customer_name,
      mobile: mask ? maskMobile(t.customer_mobile) : t.customer_mobile,
      email: mask ? maskEmail(t.customer_email) : t.customer_email,
    },
    items,
    status: t.status,
    // Amounts after the offer discount (if any). doneTotal = what completed services come to.
    subtotal,
    discount,
    total: subtotal - discount,
    doneTotal: doneSubtotal - discountFor(t.discount_type, t.discount_value, doneSubtotal),
    createdAt: toMillis(t.created_at),
    offer: t.offer_title
      ? {
          id: t.offer_id || '',
          title: t.offer_title,
          code: t.offer_code,
          discountType: t.discount_type || 'none',
          discountValue: Number(t.discount_value || 0),
        }
      : null,
  };
}

module.exports = { salonPublic, salonProfile, branch, service, offer, testimonial, token, discountFor, maskMobile };
