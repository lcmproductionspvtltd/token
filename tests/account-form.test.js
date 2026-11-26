/**
 * Website sign-in / sign-up card: Google and Apple are full-width "Continue with …" buttons with
 * their marks drawn inline (self-contained – no outside images, fonts or scripts), the steps are
 * round dots, and the built CSS is up to date.
 * Run: node tests/account-form.test.js   (also part of `npm test`)
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
const failures = [];
const check = (label, cond) => (cond ? passed++ : failures.push(label));

const root = path.join(__dirname, '..');
const jsx = fs.readFileSync(path.join(root, 'client/src/pages/Account.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'client/src/styles/site/account.css'), 'utf8');
const built = fs.readFileSync(path.join(root, 'public/app/app.css'), 'utf8');

check('sign-in subtitle is short (no "One sign-in for …" line)', !jsx.includes('One sign-in for super admins'));
check('"Continue with Google" button', jsx.includes('aria-label="Continue with Google"'));
check('"Continue with Apple" button', jsx.includes('aria-label="Continue with Apple"'));
check('Google and Apple side by side when both are on', /\.social-stack\.two \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/.test(css));
check('sign-in footer: a short line before the Sign up link', jsx.includes('Don’t have an account? Create one:') && !jsx.includes('Sign up as a business owner'));
check('Google and Apple marks are inline SVG', /const GoogleMark[\s\S]*<svg/.test(jsx) && /const AppleMark[\s\S]*<svg/.test(jsx));
check('no outside images or links in the form', !/src="https?:|href="https?:/.test(jsx));
check('buttons still go to the server sign-in routes', jsx.includes('/api/oauth/google/start?client=web') && jsx.includes('/api/oauth/apple/start?client=web'));
check('old side-by-side box is gone', !jsx.includes('acct-social-box') && !css.includes('.acct-social-box'));
check('one button alone is full width', /\.social-stack \{[^}]*display: grid/.test(css));
check('Google button has the four-colour edge', /\.social-btn\.google \{[\s\S]*#ea4335[\s\S]*#4285f4/.test(css));
check('active tab uses the brand gradient', /\.acct-tabs button\.on \{[^}]*var\(--grad-btn\)/.test(css));
check('steps are round dots with hidden names', /\.acct-form \.form-steps em \{[^}]*clip-path: inset\(50%\)/.test(css));
check('no double focus ring inside the input box', /\.acct-input input:focus-visible[\s\S]*?box-shadow: none/.test(css));
check('CSS has no outside URLs', !/url\(\s*['"]?https?:/.test(css));
check('built app.css is up to date (run npm run build)', built.includes('.social-stack'));

console.log(`Sign-in / sign-up form: ${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log('  ✗ ' + f));
process.exit(failures.length ? 1 : 0);
