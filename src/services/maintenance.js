'use strict';

/**
 * Scheduled clean-up. With several servers running, a database lock makes sure only one of them
 * does each run (audit F-07); the others skip it.
 */

const CLEANUP_LOCK = 72_002; // any fixed number, shared by all BQuee servers

function createMaintenance(db, log = console) {
  async function cleanUp() {
    return db.transaction(async (tx) => {
      const {
        rows: [lock],
      } = await tx.query('SELECT pg_try_advisory_xact_lock($1) AS got', [CLEANUP_LOCK]);
      if (!lock.got) return false; // another server is doing it right now
      await tx.query('DELETE FROM sessions WHERE expires_at < now()');
      await tx.query('DELETE FROM customer_sessions WHERE expires_at < now()');
      await tx.query('DELETE FROM rate_limits WHERE expires_at < now()');
      await tx.query('DELETE FROM mfa_challenges WHERE expires_at < now()');
      await tx.query(`DELETE FROM notifications WHERE created_at < now() - interval '60 days'`);
      return true;
    });
  }

  return {
    cleanUp,
    /** Runs now and then every `everyMs`. */
    start(everyMs = 60 * 60_000) {
      const run = () => cleanUp().catch((err) => log.error('Clean-up failed:', err.message));
      run();
      return setInterval(run, everyMs).unref();
    },
  };
}

module.exports = { createMaintenance };
