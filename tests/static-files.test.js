/**
 * Serving files: the in-memory cache stays bounded when files change (audit F-08), and nothing
 * outside the public folder can be reached – "../", encoded "%2e%2e", or a link (symlink) that
 * points outside (audit section 4, path traversal).
 * Run: node tests/static-files.test.js   (also part of `npm test`)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStaticHandler } = require('../src/http/static-files');

let passed = 0;
const failures = [];
const check = (label, cond, extra = '') => (cond ? passed++ : failures.push(label + (extra ? ' – ' + extra : '')));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bquee-static-'));
const pub = path.join(dir, 'public');
const up = path.join(dir, 'uploads');
fs.mkdirSync(pub);
fs.mkdirSync(up);
fs.writeFileSync(path.join(pub, 'index.html'), '<!doctype html>INDEX');
fs.writeFileSync(path.join(dir, 'secret.txt'), 'TOP SECRET');
fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(pub, 'link.txt'));
fs.symlinkSync(dir, path.join(pub, 'outside'));

const serve = createStaticHandler({ publicDir: pub, uploadsDir: up, headers: {} });
function get(url) {
  let body = Buffer.alloc(0);
  let status = 0;
  const res = {
    writeHead: (s) => (status = s),
    end: (b) => (body = b ? Buffer.from(b) : body),
  };
  serve({ headers: {}, method: 'GET' }, res, url);
  return { status, text: body.toString() };
}

check('a normal file is served', get('/index.html').text.includes('INDEX'));
for (const url of [
  '/../secret.txt',
  '/%2e%2e/secret.txt',
  '/%2E%2E%2Fsecret.txt',
  '/..%5csecret.txt',
  '/link.txt',
  '/outside/secret.txt',
  '/%00/secret.txt',
  '/%E0%A4%A',
])
  check('not reachable: ' + url, !get(url).text.includes('SECRET'));

// a file that keeps changing: one cache entry, not one per version
const changing = path.join(pub, 'app.js');
for (let i = 0; i < 60; i++) {
  fs.writeFileSync(changing, 'x'.repeat(1000) + i);
  fs.utimesSync(changing, new Date(), new Date(Date.now() + i * 1000));
  get('/app.js');
}
check(
  'an updated file replaces its old cache entry',
  serve.cacheStats().files === 2,
  JSON.stringify(serve.cacheStats()),
);
check('the newest version is served', get('/app.js').text.endsWith('59'));

// many large files: memory stays under the limit
for (let i = 0; i < 40; i++) {
  fs.writeFileSync(path.join(pub, 'big' + i + '.bin'), Buffer.alloc(1_900_000, i));
  get('/big' + i + '.bin');
}
const st = serve.cacheStats();
check('cache never holds more than its limit', st.bytes <= st.limit, JSON.stringify(st));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`Static files: ${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log('  ✗ ' + f));
process.exit(failures.length ? 1 : 0);
