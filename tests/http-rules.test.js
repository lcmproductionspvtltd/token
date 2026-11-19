'use strict';

/**
 * Two request rules from the audit, checked without a database:
 *   F-09  a broken %-code in an address gives 400 "Invalid address", not a server error
 *   F-10  http→https redirects only ever go to the site's own name, whatever Host header is sent
 */

const { Router } = require('../src/http/router');
const { httpsRedirect, clientIpOf } = require('../src/http/security');
const { pickEncoding, compressQuick } = require('../src/http/compress');
const zlib = require('zlib');
const { merge } = require('../src/services/site');

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

// Visitor address behind proxies (audit 3.2): a visitor-sent X-Forwarded-For entry is never trusted
const reqOf = (headers, own = '10.0.0.9') => ({ headers, socket: { remoteAddress: own } });
const spoofed = { 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }; // visitor wrote 1.1.1.1; our proxy added 203.0.113.7
check(
  'no proxy trusted: the connection address is used',
  clientIpOf(reqOf(spoofed), { trustProxy: false }) === '10.0.0.9',
);
check(
  'one proxy: the address our proxy added, not the faked first one',
  clientIpOf(reqOf(spoofed), { trustProxy: true, proxyHops: 1 }) === '203.0.113.7',
);
check(
  'two proxies: counted from the right',
  clientIpOf(reqOf({ 'x-forwarded-for': '9.9.9.9, 198.51.100.4, 10.1.1.1' }), { trustProxy: true, proxyHops: 2 }) ===
    '198.51.100.4',
);
check(
  'edge header (Render/Cloudflare True-Client-IP) wins over X-Forwarded-For',
  clientIpOf(reqOf({ ...spoofed, 'true-client-ip': '198.51.100.20' }), {
    trustProxy: true,
    proxyHops: 1,
    clientIpHeader: 'true-client-ip',
  }) === '198.51.100.20',
);
check(
  'a garbage header is ignored',
  clientIpOf(reqOf({ 'true-client-ip': '<script>', 'x-forwarded-for': 'nonsense' }), {
    trustProxy: true,
    proxyHops: 1,
    clientIpHeader: 'true-client-ip',
  }) === '10.0.0.9',
);

// Compression choice
check('browsers get brotli', pickEncoding('gzip, deflate, br') === 'br');
check('the apps (gzip only) get gzip', pickEncoding('gzip') === 'gzip');
check('no header → not compressed', pickEncoding(undefined) === null && pickEncoding('identity') === null);
const text = JSON.stringify({ list: Array.from({ length: 200 }, (_, i) => ({ id: i, name: 'Lotus Salon ' + i })) });
check('gzip round trip', zlib.gunzipSync(compressQuick(text, 'gzip')).toString() === text);
check('brotli round trip', zlib.brotliDecompressSync(compressQuick(text, 'br')).toString() === text);

// Home page text saved by an earlier version: untouched built-in text is upgraded, own text kept
const oldFaqs = [
  'Do my customers need to install an app?',
  'Can I use it for more than one branch?',
  'How does the waiting time work?',
  'Can I export my data?',
].map((q) => ({ q, a: 'x' }));
const upgraded = merge({ hero: { title: 'Walk-ins,', highlight: 'without the waiting room.' }, faqs: oldFaqs });
check(
  'untouched old heading and FAQ get the new SEO text',
  upgraded.hero.title.includes('token') && upgraded.faqs.length > 4,
);
const own = merge({ hero: { title: 'Our own words' }, faqs: [{ q: 'Our question?', a: 'Our answer' }] });
check('text the super admin wrote is kept', own.hero.title === 'Our own words' && own.faqs.length === 1);
check(
  'an empty Google title falls back to the default',
  merge({ seo: { title: '', description: 'Ours' } }).seo.title.includes('BQuee') &&
    merge({ seo: { description: 'Ours' } }).seo.description === 'Ours',
);

console.log(`\nAddress, redirect, compression and home page rules: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
