'use strict';

/**
 * Applies the SQL files in ./migrations in alphabetical order, each one exactly once.
 * Runs automatically when the server starts and can be run on its own: `node src/db/migrate.js`.
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_LOCK = 72_001; // any fixed number, shared by all BQuee servers

async function migrate(db, log = console.log) {
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await tx.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
  });

  const { rows } = await db.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Each file runs in one transaction, so a failing migration leaves nothing half-applied.
    // The lock makes servers that start at the same moment take turns (audit F-07); the second
    // one then sees the file is already applied and skips it.
    const done = await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
      const again = await tx.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
      if (again.rows.length) return false;
      await tx.query('SET LOCAL statement_timeout = 0'); // big tables can take longer than a normal query
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      return true;
    });
    if (done) log(`  ✓ migration ${file}`);
  }
}

module.exports = { migrate };

if (require.main === module) {
  const config = require('../config');
  const { createPool } = require('./postgres');
  const db = createPool({ connectionString: config.databaseUrl, max: 1 });
  migrate(db)
    .then(() => {
      console.log('Database is up to date.');
      return db.end();
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
