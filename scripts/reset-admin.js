'use strict';

/**
 * Sets a new password for a super admin (creates one if none exists), signs them out everywhere and
 * resets their two-step sign-in (for a lost phone: they set up the authenticator app again at the
 * next sign-in).
 *
 *   node scripts/reset-admin.js                       # random password for "admin"
 *   node scripts/reset-admin.js admin 'N3w-Passw0rd'  # chosen username and password
 */

const crypto = require('crypto');
const config = require('../src/config');
const { createPool } = require('../src/db/postgres');
const { migrate } = require('../src/db/migrate');
const { hashPassword, validatePassword } = require('../src/services/auth');
const { newId } = require('../src/utils/ids');

async function main() {
  const username = (process.argv[2] || config.admin.username).toLowerCase();
  const password = validatePassword(process.argv[3] || crypto.randomBytes(12).toString('base64url'), {
    role: 'superadmin',
  });
  const db = createPool({ connectionString: config.databaseUrl, max: 1 });

  try {
    await migrate(db, () => {});
    const hash = await hashPassword(password);
    const {
      rows: [user],
    } = await db.query("SELECT id FROM users WHERE role = 'superadmin' AND username = $1", [username]);

    if (user) {
      await db.query(
        `UPDATE users SET password_hash = $2, password_changed_at = now(), mfa_secret = NULL, mfa_enabled_at = NULL,
                mfa_last_step = 0, mfa_backup_codes = '{}' WHERE id = $1`,
        [user.id, hash],
      );
      await db.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      await db.query('DELETE FROM mfa_challenges WHERE user_id = $1', [user.id]);
    } else {
      const { rows: taken } = await db.query('SELECT 1 FROM users WHERE username = $1 OR email = $1', [username]);
      if (taken.length) throw new Error(`"${username}" belongs to a salon owner or staff login`);
      await db.query(
        `INSERT INTO users (id, role, username, name, password_hash) VALUES ($1, 'superadmin', $2, 'Super Admin', $3)`,
        [newId(8), username, hash],
      );
    }
    console.log(
      `Super admin "${username}" – new password: ${password} (two-step sign-in is set up again at the next sign-in)`,
    );
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Could not reset the password:', err.message);
  process.exit(1);
});
