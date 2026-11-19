'use strict';

/**
 * Application configuration.
 * Values come from environment variables; a `.env` file in the project root is loaded first
 * (simple KEY=value lines, no package needed). Real environment variables always win.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[2] === '' || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env'));

const env = process.env;

/*
 * The site's own address(es). Used for the http→https redirect (never the visitor's Host header),
 * for checking where browser requests come from (CSRF/Origin) and for cookies.
 * PUBLIC_URL=https://bquee.com (Render sets RENDER_EXTERNAL_URL itself). Extra names: PUBLIC_HOSTS=a.com,b.com
 */
const publicUrl = (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const publicHosts = [publicUrl && new URL(publicUrl).host, ...String(env.PUBLIC_HOSTS || '').split(',')]
  .map((h) => h && h.trim().toLowerCase())
  .filter(Boolean);

module.exports = {
  production: env.NODE_ENV === 'production',
  publicUrl, // used for canonical links, the sitemap and link previews
  publicHosts,

  publicDir: path.join(ROOT_DIR, 'public'),
  uploadsDir: path.resolve(ROOT_DIR, env.UPLOADS_DIR || 'storage/uploads'),
  uploadsStorage: env.UPLOADS_STORAGE === 'database' ? 'database' : 'disk',

  port: Number(env.PORT) || 3000,
  trustProxy: env.TRUST_PROXY === '1',

  databaseUrl: env.DATABASE_URL || 'postgres://bquee:bquee@localhost:5432/bquee',
  databasePoolSize: Number(env.DATABASE_POOL_SIZE) || 10,

  // First super admin, created on first start when none exists.
  admin: {
    username: (env.ADMIN_USERNAME || 'admin').toLowerCase(),
    email: (env.ADMIN_EMAIL || '').toLowerCase(),
    password: env.ADMIN_PASSWORD || '',
  },

  https: {
    certFile: env.HTTPS_CERT || '',
    keyFile: env.HTTPS_KEY || '',
    redirectPort: Number(env.HTTP_REDIRECT_PORT) || 0,
  },

  // Load the demo salon on first start (for hosts without a command line).
  seedDemoData: env.SEED_DEMO_DATA === '1',
};
