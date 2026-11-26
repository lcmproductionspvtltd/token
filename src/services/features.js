'use strict';

/**
 * Per-business menus and features, controlled by the super admin.
 * Stored as JSON on the business; anything not stored uses the default below,
 * so existing businesses keep everything they have today.
 */

/** Owner menus that can be switched off. Overview is always on. */
const MENUS = ['tokens', 'reports', 'branches', 'services', 'staff', 'offers', 'reviews', 'settings'];

const FLAGS = {
  maskContacts: false, // hide customers' mobile numbers and emails from the owner and staff
  reportExport: true, // Excel (CSV) export in reports
  staffReports: true, // staff see their own reports
  appButtons: true, // "Get the BQuee app" (Google Play / App Store) buttons on the business page
};

const MENU_LABELS = {
  tokens: 'Tokens',
  reports: 'Reports',
  branches: 'Branches & QR',
  services: 'Services',
  staff: 'Staff',
  offers: 'Offers',
  reviews: 'Reviews',
  settings: 'Business profile',
};

function featuresOf(stored) {
  const f = stored && typeof stored === 'object' ? stored : {};
  const menus = {};
  for (const m of MENUS) menus[m] = !(f.menus && f.menus[m] === false);
  const out = { menus };
  for (const [k, def] of Object.entries(FLAGS)) out[k] = typeof f[k] === 'boolean' ? f[k] : def;
  return out;
}

/** Cleans input from the admin into the stored shape. */
function cleanFeatures(input, current) {
  const base = featuresOf(current);
  const f = input && typeof input === 'object' ? input : {};
  const menus = { ...base.menus };
  if (f.menus && typeof f.menus === 'object')
    for (const m of MENUS) if (typeof f.menus[m] === 'boolean') menus[m] = f.menus[m];
  const out = { menus };
  for (const k of Object.keys(FLAGS)) out[k] = typeof f[k] === 'boolean' ? f[k] : base[k];
  return out;
}

module.exports = { MENU_LABELS, featuresOf, cleanFeatures };
