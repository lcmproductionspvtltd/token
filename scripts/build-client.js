'use strict';

/**
 * Builds the React web app (client/src) into public/app/app.js + app.css.
 *
 *   npm install            (installs react, react-dom, esbuild – dev only)
 *   npm run build          (one-off production build)
 *   npm run build -- --watch
 *
 * The built files are committed, so the server and hosting need no build step and
 * nothing is loaded from a CDN at runtime.
 */

const path = require('path');

function loadEsbuild() {
  const tries = [process.env.ESBUILD_PATH, 'esbuild', '/opt/npm-tools/node_modules/esbuild'].filter(Boolean);
  for (const name of tries) {
    try {
      return require(name);
    } catch (err) {
      // try the next location
    }
  }
  console.error('esbuild not found – run "npm install" first.');
  process.exit(1);
}

const esbuild = loadEsbuild();
const root = path.join(__dirname, '..');
const watch = process.argv.includes('--watch');

// React is resolved from ./node_modules, or from NODE_PATH when building offline.
const nodePaths = [path.join(root, 'node_modules'), ...(process.env.NODE_PATH || '').split(path.delimiter)].filter(
  Boolean,
);

const options = {
  entryPoints: { app: path.join(root, 'client/src/main.jsx') },
  outdir: path.join(root, 'public/app'),
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  format: 'iife',
  target: ['es2020', 'chrome90', 'firefox90', 'safari15'],
  jsx: 'automatic',
  loader: { '.woff': 'file', '.svg': 'file' },
  external: ['/fonts/*', '/img/*'],
  nodePaths,
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  legalComments: 'none',
  logLevel: 'info',
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('Watching client/src …');
  } else {
    await esbuild.build(options);
  }
})().catch(() => process.exit(1));
