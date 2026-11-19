'use strict';

/** Input helpers used by the route handlers. Each returns a clean value or throws a 400 error. */

const { badRequest } = require('../http/errors');

/** Text input: a string (a number or true/false is turned into text). Lists and objects are refused. */
function text(value, max = 200) {
  if (value !== null && typeof value === 'object') throw badRequest('Invalid value');
  return String(value == null ? '' : value)
    .trim()
    .slice(0, max);
}

function required(value, label) {
  if (value === '' || value == null) throw badRequest(`${label} is required`);
  return value;
}

function email(value) {
  const v = text(value, 120).toLowerCase();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw badRequest('Enter a valid email address');
  return v;
}

function mobile(value) {
  const v = text(value, 20);
  if (!/^[0-9+\-\s()]{7,20}$/.test(v)) throw badRequest('Enter a valid mobile number');
  return v;
}

function date(value, label = 'date') {
  const v = text(value, 10);
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest(`Invalid ${label}`);
  return v || null;
}

function integer(value, min, max, fallback) {
  if (value !== null && typeof value === 'object') throw badRequest('Invalid number');
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** An amount of money: empty = 0; otherwise a number from 0 to 1,00,00,00,000 (2 decimals). */
function money(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'object' || typeof value === 'boolean') throw badRequest('Enter a valid amount');
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw badRequest('Enter a valid amount');
  return Math.round(n * 100) / 100;
}

/** Booleans from forms: anything but an explicit `false` counts as true. */
const flag = (value) => value !== false;

const idList = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string').slice(0, 200) : []);

const username = (value) => text(value, 60).toLowerCase().replace(/\s+/g, '');

const slugify = (value) =>
  text(value, 60)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'salon';

const hexColor = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);

module.exports = { text, required, email, mobile, date, integer, money, flag, idList, username, slugify, hexColor };
