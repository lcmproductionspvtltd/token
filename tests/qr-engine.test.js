/**
 * QR encoder ↔ decoder round trip, including error correction.
 * The browser modules are plain ES modules, so they load directly in Node.
 */

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'client', 'src', 'lib', file)).href);

(async () => {
  const { QR } = await load('qr-encoder.js');
  const { decodeMatrix } = await load('qr-decoder.js');

  const samples = ['https://salon.example/t/3f9a12bc4d5e', 'A', 'Lotus Salon & Spa – token A-007 ✓', 'x'.repeat(300)];

  let passed = 0;
  for (const text of samples) {
    const qr = QR.encode(text);
    assert.strictEqual(decodeMatrix((x, y) => qr.get(x, y), qr.size).text, text, `round trip: ${text.slice(0, 30)}`);

    // Flip six modules in the bottom-right data area: Reed-Solomon must repair them.
    const flipped = new Set();
    for (let dx = 0; dx < 3; dx++)
      for (let dy = 0; dy < 2; dy++) flipped.add(`${qr.size - 1 - dx},${qr.size - 1 - dy}`);
    const damaged = decodeMatrix((x, y) => qr.get(x, y) !== flipped.has(`${x},${y}`), qr.size).text;
    assert.strictEqual(damaged, text, `error correction: ${text.slice(0, 30)}`);
    passed += 2;
  }
  console.log(`QR engine: ${passed} passed, 0 failed`);
})().catch((err) => {
  console.error('QR engine test failed:', err.message);
  process.exitCode = 1;
});
