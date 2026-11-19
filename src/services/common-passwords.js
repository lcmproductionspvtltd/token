'use strict';

/**
 * Passwords that appear at the top of every leaked-password list. Refused for all accounts.
 * Compared case-insensitively, also with the trailing digits/symbols stripped
 * (so "Password123!" is caught by "password").
 */
const WORDS = `
password passw0rd p@ssword p@ssw0rd pass1234 password1 qwerty qwertyuiop qwerty123 asdfgh asdfghjkl
zxcvbnm 1q2w3e4r 1qaz2wsx qazwsx abc123 abcd1234 iloveyou letmein welcome welcome1 admin administrator
admin123 root toor login master monkey dragon football baseball sunshine shadow superman batman princess
trustno1 freedom whatever starwars hello hello123 charlie michael jennifer jordan secret secret123
changeme default guest test test1234 testing user user1234 india india123 bquee salon salonq tokenq
owner staff business mypassword newpassword computer internet samsung iphone google facebook
`
  .trim()
  .split(/\s+/);
const NUMBERS = [
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '00000000',
  '87654321',
  '12341234',
  '11223344',
  '12121212',
  '123123123',
  '98765432',
  '99999999',
  '88888888',
  '147258369',
  '159753',
];

const set = new Set([...WORDS, ...NUMBERS]);

function isCommonPassword(password) {
  const p = String(password || '').toLowerCase();
  if (set.has(p)) return true;
  const core = p.replace(/[\d\W_]+$/, '').replace(/^[\d\W_]+/, '');
  if (core.length >= 3 && set.has(core)) return true;
  if (/^(.)\1+$/.test(p)) return true; // "aaaaaaaa"
  return /^\d+$/.test(p) && '01234567890123456789'.includes(p); // runs like 23456789
}

module.exports = { isCommonPassword };
