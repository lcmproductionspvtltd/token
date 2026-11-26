'use strict';

/**
 * 6-digit codes sent by email (src/services/mailer.js):
 *   signup / customer-signup     – prove the email at sign-up
 *   verify / customer-verify     – "confirm my email" for an existing account
 *   reset / customer-reset       – forgot password
 *   login                        – business owner sign-in (every time), and any account after too
 *                                  many wrong passwords
 *   customer-login               – customer sign-in in the BQuee app (every time)
 *
 * A code is stored only as a hash, works once, for 15 minutes, and allows 5 wrong tries; asking for a
 * new one replaces the old one. Each code has an id (`ticket`) that the website/app keeps while the
 * person types the code; checks need the ticket, the code and the same purpose (and email).
 */

const crypto = require('crypto');
const { badRequest, HttpError } = require('../http/errors');
const { newId } = require('../utils/ids');

const MINUTES = 15;
const MAX_TRIES = 5;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const codeHash = (id, code) => sha256(`${id}:${String(code).replace(/\s/g, '')}`);

const TEXTS = {
  signup: ['Your BQuee sign-up code', 'Use this code to confirm your email and finish signing up your business'],
  'customer-signup': ['Your BQuee sign-up code', 'Use this code to confirm your email and create your BQuee account'],
  verify: ['Confirm your email for BQuee', 'Use this code to confirm the email of your BQuee account'],
  'customer-verify': ['Confirm your email for BQuee', 'Use this code to confirm the email of your BQuee account'],
  reset: ['Reset your BQuee password', 'Use this code to choose a new password for your BQuee account'],
  'customer-reset': ['Reset your BQuee password', 'Use this code to choose a new password for your BQuee account'],
  login: ['Your BQuee sign-in code', 'There were many wrong passwords on your account, so signing in needs this code too'],
  'customer-login': ['Your BQuee sign-in code', 'Use this code to finish signing in to your BQuee account'],
  // wording only (purpose stays "login"): the normal business owner sign-in
  signin: ['Your BQuee sign-in code', 'Use this code to finish signing in to BQuee'],
};

function createEmailCodes(db, mailer) {
  const unavailable = () => new HttpError(503, 'Email codes are not available right now. Please contact BQuee support.');

  return {
    MINUTES,
    get ready() {
      return mailer.ready;
    },

    /**
     * Creates a code and emails it. Returns the ticket. `background: true` returns as soon as the code
     * is saved and sends afterwards (a failure is only logged) – for answers that must take the same
     * time whether or not an account exists.
     */
    async send(purpose, email, subjectId = null, { background = false, log = console, wording = purpose } = {}) {
      if (!TEXTS[purpose]) throw new Error('Unknown code purpose ' + purpose);
      if (!mailer.ready) throw unavailable();
      const to = String(email || '')
        .trim()
        .toLowerCase();
      const id = newId(16);
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      await db.query('DELETE FROM email_codes WHERE (purpose = $1 AND email = $2) OR expires_at < now()', [
        purpose,
        to,
      ]);
      await db.query(
        `INSERT INTO email_codes (id, purpose, email, code_hash, subject_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6))`,
        [id, purpose, to, codeHash(id, code), subjectId, MINUTES],
      );
      const [subject, why] = TEXTS[wording] || TEXTS[purpose];
      const mail = () =>
        mailer.send({
          to,
          subject,
          text:
            `${why}:\n\n    ${code}\n\n` +
            `The code works for ${MINUTES} minutes. If you didn't ask for it, you can ignore this email – ` +
            `nothing changes without the code.\n\nBQuee · info@bquee.com`,
        });
      const forget = () => db.query('DELETE FROM email_codes WHERE id = $1', [id]).catch(() => {});
      if (background) {
        mail().catch((err) => {
          forget();
          log.error(JSON.stringify({ alert: 'email_code_failed', purpose, error: String(err.message).slice(0, 200) }));
        });
        return id;
      }
      try {
        await mail();
      } catch (err) {
        await forget();
        throw new HttpError(503, 'We couldn’t send the email right now. Please try again in a minute.');
      }
      return id;
    },

    /**
     * Checks a code. Returns the code row ({ email, subject_id, … }) when right; throws otherwise.
     * `use: false` only checks (the code stays valid for the real step).
     */
    async check(ticket, purpose, code, { email = null, use = true } = {}) {
      const id = String(ticket || '').slice(0, 64);
      const {
        rows: [row],
      } = await db.query('SELECT * FROM email_codes WHERE id = $1 AND purpose = $2 AND expires_at > now()', [
        id,
        purpose,
      ]);
      const wanted = email === null ? null : String(email).trim().toLowerCase();
      if (!row || (wanted !== null && row.email !== wanted))
        throw badRequest('This code has expired. Ask for a new one.');
      const given = String(code || '').replace(/\s/g, '');
      const ok =
        /^\d{6}$/.test(given) &&
        crypto.timingSafeEqual(Buffer.from(codeHash(id, given)), Buffer.from(row.code_hash));
      if (!ok) {
        const {
          rows: [after],
        } = await db.query('UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [id]);
        if (!after || after.attempts >= MAX_TRIES) {
          await db.query('DELETE FROM email_codes WHERE id = $1', [id]);
          throw badRequest('Too many wrong codes. Ask for a new one.');
        }
        throw badRequest('Wrong code. Check the 6-digit code in the email we sent you.');
      }
      if (use) {
        // Only one request can use a code, even if two arrive at once.
        const { rowCount } = await db.query('DELETE FROM email_codes WHERE id = $1', [id]);
        if (!rowCount) throw badRequest('This code has already been used. Ask for a new one.');
      }
      return row;
    },

    purge() {
      return db.query('DELETE FROM email_codes WHERE expires_at < now()');
    },
  };
}

module.exports = { createEmailCodes, MINUTES };
