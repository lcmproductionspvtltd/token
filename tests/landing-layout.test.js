/**
 * Branch landing page layout: the header, hero and sections share one left/right edge
 * (landing/align.css), the sections follow the home page style (landing/home-style.css, loaded
 * last so nothing overrides it), and the built CSS has both.
 * Run: node tests/landing-layout.test.js   (also part of `npm test`)
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
const failures = [];
const check = (label, cond) => (cond ? passed++ : failures.push(label));

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'client/src/styles/landing.css'), 'utf8');
const imports = index.match(/@import '[^']+';/g) || [];
check('align.css is imported', imports.some((l) => l.includes('align.css')));
check('restructure.css is the last import, so it wins', (imports[imports.length - 1] || '').includes('restructure.css'));
check('align.css and home-style.css come before it', (imports[imports.length - 3] || '').includes('align.css') && (imports[imports.length - 2] || '').includes('home-style.css'));

const align = fs.readFileSync(path.join(root, 'client/src/styles/landing/align.css'), 'utf8');
for (const sel of ['.ld-nav.v2', '.ld-hero.v2 .ld-hero-inner', '.ld-main']) {
  const block = align.split(sel + ' {')[1] || align.split(sel + ',')[1] || '';
  const body = block.slice(0, block.indexOf('}'));
  check(sel + ' uses the shared edge', /padding-left:\s*var\(--ld-edge\)/.test(body) && /padding-right:\s*var\(--ld-edge\)/.test(body));
}
check('wide screens get the two-column hero', /@media \(min-width: 1100px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(420px, 480px\)/.test(align));

const home = fs.readFileSync(path.join(root, 'client/src/styles/landing/home-style.css'), 'utf8');
check('content width matches the home page (1200px)', home.includes('(100% - 1200px) / 2'));
check('sections are full-width bands', /\.ld-main > \.ld-sec \{[^}]*box-shadow: 0 0 0 100vmax/.test(home));
check('"How it works" is a deep brand band', /\.ld-main > \.ld-how \{[^}]*--band: var\(--brand-deep\)/.test(home));
check('footer is dark and full width', /\.ld-footer \{[^}]*margin: 0;[^}]*border-radius: 0;/.test(home));
check('Visit card is compact (address and about text sized down)', /\.ld-about\.clamp \{[^}]*-webkit-line-clamp: 3/.test(home));
check('one or two contact tiles share the Visit card height', /\.ld-tiles\.stack \{[^}]*grid-auto-rows: 1fr/.test(home));

const jsx = fs.readFileSync(path.join(root, 'client/src/customer/Landing.jsx'), 'utf8');
for (const label of ['Live queue', 'How it works', 'Offers', 'Reviews', 'Visit us']) {
  check('section label "' + label + '" is shown', new RegExp('className="ld-kicker[^"]*">' + label + '<').test(jsx));
}

const built = fs.readFileSync(path.join(root, 'public/app/app.css'), 'utf8');
check('built app.css contains the shared edge (run npm run build)', built.includes('--ld-edge'));
check('built app.css contains the home-page style (run npm run build)', built.includes('.ld-kicker'));

console.log(`Landing layout: ${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log('  ✗ ' + f));
process.exit(failures.length ? 1 : 0);
