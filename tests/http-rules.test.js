'use strict';

/**
 * Two request rules from the audit, checked without a database:
 *   F-09  a broken %-code in an address gives 400 "Invalid address", not a server error
 *   F-10  http→https redirects only ever go to the site's own name, whatever Host header is sent
 */

const { Router } = require('../src/http/router');
const { httpsRedirect } = require('../src/http/security');
const { pickEncoding, compressQuick } = require('../src/http/compress');
const zlib = require('zlib');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}

// F-09
const router = new Router().get('/api/tokens/:id', () => 'ok');
const good = router.match('GET', '/api/tokens/caf%C3%A9');
check('a normal %-code is decoded', good && good.params.id === 'café', JSON.stringify(good && good.params));
for (const bad of ['/api/tokens/%E0%A4', '/api/tokens/%zz', '/api/tokens/%']) {
  let status = 0;
  try {
    router.match('GET', bad);
  } catch (err) {
    status = err.status;
  }
  check(`broken address ${bad} → 400`, status === 400, `got ${status}`);
}

// F-10
function redirectFor(config, host, url) {
  let location = '';
  let code = 0;
  httpsRedirect(config)(
    { headers: { host }, url },
    { writeHead: (c, h) => ((code = c), (location = h.Location)), end() {} },
  );
  return { code, location };
}
const site = { publicHosts: ['bquee.com', 'www.bquee.com'], port: 443 };
check(
  'own name kept',
  redirectFor(site, 'www.bquee.com', '/s/lotus?x=1').location === 'https://www.bquee.com/s/lotus?x=1',
);
check('permanent redirect (301)', redirectFor(site, 'bquee.com', '/').code === 301);
check(
  'a foreign Host header is ignored',
  redirectFor(site, 'evil.example', '/login').location === 'https://bquee.com/login',
);
check('no Host header → own name', redirectFor(site, '', '/').location === 'https://bquee.com/');
check(
  '"//evil.example" path can not leave the site',
  redirectFor(site, 'bquee.com', '//evil.example/x').location === 'https://bquee.com/',
);
check(
  'port kept when not 443',
  redirectFor({ publicHosts: ['shop.test:8443'], port: 8443 }, 'shop.test', '/a').location ===
    'https://shop.test:8443/a',
);

// Compression choice
check('browsers get brotli', pickEncoding('gzip, deflate, br') === 'br');
check('the apps (gzip only) get gzip', pickEncoding('gzip') === 'gzip');
check('no header → not compressed', pickEncoding(undefined) === null && pickEncoding('identity') === null);
const text = JSON.stringify({ list: Array.from({ length: 200 }, (_, i) => ({ id: i, name: 'Lotus Salon ' + i })) });
check('gzip round trip', zlib.gunzipSync(compressQuick(text, 'gzip')).toString() === text);
check('brotli round trip', zlib.brotliDecompressSync(compressQuick(text, 'br')).toString() === text);

console.log(`\nAddress, redirect and compression rules: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
