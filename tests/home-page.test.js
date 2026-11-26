/**
 * Home page: the menu starts with "Home" (back to the top), the contact section is a brand panel beside
 * the form, and the cards share one polished style. Checked in the source and the built CSS.
 * Run: node tests/home-page.test.js   (also part of `npm test`)
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
const failures = [];
const check = (label, cond) => (cond ? passed++ : failures.push(label));
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const jsx = read('client/src/pages/Home.jsx');
const css = read('client/src/styles/site/home-polish.css');
const index = read('client/src/styles/site.css');
const built = read('public/app/app.css');

check('the menu starts with Home', /const NAV = \[\s*\['home', 'Home'\]/.test(jsx));
check('Home is always in the menu', /sid === 'home'\s*\?\s*true/.test(jsx));
check('Home scrolls back to the top', jsx.includes("if (id === 'home') return window.scrollTo"));
check('the hero is the Home section', jsx.includes('<section className="site-hero" id="home">'));
check('contact: a brand panel beside the form', jsx.includes('site-contact-side') && jsx.includes('<ContactForm />'));
check('contact panel lists what to expect', jsx.includes('Quick replies') && jsx.includes('Free demo and setup help'));
check('contact: panel and form side by side on wide screens', /\.site-contact-grid,\s*\.site-contact-grid\.form-only \{[^}]*grid-template-columns: minmax\(0, 0\.9fr\) minmax\(0, 1\.1fr\)/.test(css));
check('contact stacks on phones', /@media \(max-width: 860px\)[\s\S]*\.site-contact-grid/.test(css));
check('cards share one style with a lift on hover', /\.site-feature:hover,\s*\.site-why-list li:hover,\s*\.site-places-grid article:hover/.test(css));
check('sections after the hero each have their own colour', ['.site-why {', '.site-features-sec {', '.site-places {', '.site-pricing-sec {', '.site-reviews {', '.site-faq-sec {'].every((x) => css.includes(x)));
check('FAQ: questions in two equal columns, one on phones', /\.site-faq \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(css) && /@media \(max-width: 760px\) \{\s*\.site-faq \{\s*grid-template-columns: minmax\(0, 1fr\)/.test(css));
check('the hero is not restyled here', !/\.site-hero\b/.test(css));
check('home-polish.css loads last', (index.match(/@import '[^']+';/g) || []).pop().includes('home-polish.css'));
check('built app.css is up to date (run npm run build)', built.includes('.site-contact-side'));

console.log(`Home page: ${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log('  ✗ ' + f));
process.exit(failures.length ? 1 : 0);
