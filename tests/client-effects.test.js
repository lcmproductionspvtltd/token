/**
 * React effects must return nothing or a clean-up function. A one-line effect such as
 * `useEffect(() => resetPage('x'), [...])` returns `true` (Map.delete), which React later calls as a
 * clean-up and the page goes blank ("c is not a function"). This finds such effects in client/src.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'client', 'src');
// Calls known to return a value that is not a clean-up function.
const RETURNS_VALUE = ['resetPage', 'pageMemory.delete', 'localStorage.removeItem', 'sessionStorage.setItem'];
const failures = [];
let files = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) {
      files++;
      const text = fs.readFileSync(p, 'utf8');
      for (const fn of RETURNS_VALUE) {
        const re = new RegExp('useEffect\\(\\s*\\(\\)\\s*=>\\s*' + fn.replace('.', '\\.') + '\\(', 'g');
        if (re.test(text)) failures.push(`${path.relative(SRC, p)}: useEffect(() => ${fn}(…)) returns a value – use { … }`);
      }
    }
  }
}
walk(SRC);
console.log(`Client effects: ${files} files checked, ${failures.length} problems`);
failures.forEach((f) => console.log('  ✗ ' + f));
process.exitCode = failures.length ? 1 : 0;
