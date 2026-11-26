/**
 * Phone layout rules that once broke (checked in the CSS so they can't quietly come back):
 * dialogs never grow wider than the screen, forms never push past their box, the owner's
 * "Save business profile" button keeps its label on phones, and the Google/Apple sign-up note
 * wraps as one paragraph. The click audit (tests/ui/click-audit.js) checks the real pages.
 * Run: node tests/responsive.test.js   (also part of `npm test`)
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
const failures = [];
const check = (label, cond) => (cond ? passed++ : failures.push(label));
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const base = read('client/src/styles/base.css');
check('dialog backdrop has one column that cannot grow past the screen', /\.dialog-backdrop \{[^}]*grid-template-columns: minmax\(0, 1fr\)/.test(base));
check('dialog can shrink below its content width', /\.dialog \{[^}]*min-width: 0/.test(base));
check('dialog body never scrolls sideways', /\.dialog-body \{[^}]*overflow-x: hidden/.test(base));
check('forms keep fields inside their box', /\.form-stack \{[^}]*grid-template-columns: minmax\(0, 1fr\)/.test(base));

const forms = read('client/src/styles/dash/forms.css');
check('save bar hides only its note on phones, not the button label', forms.includes('.save-bar > span {\n    display: none;') && !/\.save-bar span \{\s*display: none/.test(forms));

const offers = read('client/src/styles/dash/branches-offers.css');
check('offer preview fits narrow dialogs', /\.offer-preview \.coupon \{[^}]*max-width: 100%/.test(offers));

const account = read('client/src/styles/site/account.css');
const jsx = read('client/src/pages/Account.jsx');
check('Google/Apple sign-up note text is one wrapped paragraph', /acct-social-note">\s*<Icon name="check" \/>\s*<span>/.test(jsx));
check('long email in the note can break', /\.acct-social-note b \{[^}]*overflow-wrap: anywhere/.test(account));
check('phones: main sign-up button full width with Back under it', /@media \(max-width: 480px\)[\s\S]*\.acct-step-actions \{[^}]*flex-direction: column-reverse/.test(account));

console.log(`Phone layout rules: ${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log('  ✗ ' + f));
process.exit(failures.length ? 1 : 0);
