'use strict';

/**
 * BQuee – QR token booking for salons.
 * Start: `node server.js` (configure with .env – see .env.example).
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const config = require('./src/config');
const { createPool, checkTransport } = require('./src/db/postgres');
const { httpsRedirect } = require('./src/http/security');
const { migrate } = require('./src/db/migrate');
const { createApp } = require('./src/app');

async function main() {
  // Production: the database must be reached over checked TLS, or inside a private network.
  const transport = checkTransport(config.databaseUrl);
  if (config.production && !transport.ok) throw new Error(transport.message);
  if (config.production) console.log((transport.warning ? 'Warning – ' : '') + transport.message);
  // Production: two-step sign-in secrets must be encrypted, so a strong APP_SECRET is required (audit 2.2).
  const secretBox = require('./src/services/secret-box');
  const problem = secretBox.secretProblem();
  if (config.production && problem)
    throw new Error(
      `${problem} BQuee needs APP_SECRET in production (${secretBox.MIN_LENGTH}+ characters of random text) to encrypt two-step sign-in secrets. Set it in the host's environment – keep the same value across deploys.`,
    );
  if (!config.production && problem) console.log(`Note – ${problem} (fine for development; required in production)`);

  const db = createPool({ connectionString: config.databaseUrl, max: config.databasePoolSize });
  await migrate(db);

  const app = createApp({ db, config });
  const upgraded = await app.services.auth.upgradeSecrets();
  if (upgraded) console.log(`Encrypted ${upgraded} two-step sign-in secret(s) with the current APP_SECRET.`);
  await app.services.auth.ensureSuperAdmin();
  if (config.seedDemoData) await require('./scripts/seed').seedIfEmpty(db);
  // Expired sessions and rate-limit counts are removed hourly (one server at a time).
  require('./src/services/maintenance').createMaintenance(db).start();
  // Exchange rates for package prices in each visitor's currency (twice a day; FX_URL=off to stop).
  app.services.rates.start();

  const handler = (req, res) => {
    app.handle(req, res);
  };
  let server;
  if (config.https.certFile) {
    server = https.createServer(
      { cert: fs.readFileSync(config.https.certFile), key: fs.readFileSync(config.https.keyFile) },
      handler,
    );
    if (config.https.redirectPort) {
      http.createServer(httpsRedirect(config)).listen(config.https.redirectPort);
    }
  } else {
    server = http.createServer(handler);
  }
  server.headersTimeout = 30_000;
  server.requestTimeout = 60_000;

  server.listen(config.port, () => {
    console.log(`BQuee is running on ${config.https.certFile ? 'https' : 'http'}://localhost:${config.port}`);
  });

  const shutdown = () => {
    console.log('Shutting down…');
    server.close(() => db.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('BQuee could not start:', err.message);
  if (/ECONNREFUSED|ENOTFOUND|28P01|3D000/.test(`${err.code} ${err.message}`)) {
    console.error('Check DATABASE_URL in your .env file and that PostgreSQL is running.');
  }
  process.exit(1);
});
