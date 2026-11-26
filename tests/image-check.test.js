'use strict';

/**
 * Picture checks (src/services/image-check.js): ordinary photos and logos are accepted even when their
 * compressed picture data happens to contain bytes like "<%" or "#!/"; code hidden in a picture's text
 * parts (JPG comments, EXIF/XMP, PNG text chunks, WEBP XMP) or after the picture is still refused.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { inspectImage } = require('../src/services/image-check');

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name + (detail ? ` – ${detail}` : ''));
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}
const accepts = (b) => {
  try {
    return !!inspectImage(b);
  } catch {
    return false;
  }
};
const refusal = (b) => {
  try {
    inspectImage(b);
    return '';
  } catch (e) {
    return e.message;
  }
};

const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n));
const jpg = fixture('ok.jpg');
const png = fixture('ok.png');
const webp = fixture('ok.webp');

// PNG helpers
function crc32(buf) {
  let c = ~0;
  for (const x of buf) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function makePng(extraBeforeData = [], idat) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extraBeforeData,
    chunk('IDAT', idat || zlib.deflateSync(Buffer.from([0, 10, 20]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 1. The real fixtures still pass.
check('real JPG accepted', accepts(jpg));
check('real PNG accepted', accepts(png));
check('real WEBP accepted', accepts(webp));
check('returns size and type only', JSON.stringify(Object.keys(inspectImage(jpg)).sort()) === '["ext","height","mime","width"]');

// 2. Picture data that happens to contain "code-like" bytes: ordinary photos – must be accepted.
const sos = jpg.indexOf(Buffer.from([0xff, 0xda]));
const noisyJpg = Buffer.concat([
  jpg.subarray(0, sos + 2 + jpg.readUInt16BE(sos + 2)),
  Buffer.from('<%#!/<script onload=<?php <html'),
  jpg.subarray(sos + 2 + jpg.readUInt16BE(sos + 2)),
]);
check('JPG whose picture bytes contain "<%" and "#!/" is accepted', accepts(noisyJpg), refusal(noisyJpg));
const noisyPng = makePng([], Buffer.from('xx<%yy#!/zz<script'));
check('PNG whose pixel data contains "<%" and "<script" is accepted', accepts(noisyPng), refusal(noisyPng));
const iccPng = makePng([chunk('iCCP', Buffer.from('sRGB\0\0<%#!/onload='))]);
check('PNG with a binary colour profile is accepted', accepts(iccPng), refusal(iccPng));
const iccJpg = Buffer.concat([
  jpg.subarray(0, 2),
  Buffer.from([0xff, 0xe2, 0, 2 + 12 + 10]),
  Buffer.from('ICC_PROFILE\0'),
  Buffer.from('<%#!/<html'),
  jpg.subarray(2),
]);
check('JPG with a binary ICC colour profile is accepted', accepts(iccJpg), refusal(iccJpg));
const xmpJpg = Buffer.concat([
  jpg.subarray(0, 2),
  Buffer.from([0xff, 0xe1, 0, 2 + 40]),
  Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>'),
  jpg.subarray(2),
]);
check('JPG with normal XMP camera data is accepted', accepts(xmpJpg), refusal(xmpJpg));

// 3. Code in a picture's text parts is still refused.
const php = Buffer.from('<?php system($_GET[c]);');
const comment = Buffer.concat([jpg.subarray(0, 2), Buffer.from([0xff, 0xfe, 0, 2 + php.length]), php, jpg.subarray(2)]);
check('PHP in a JPG comment refused', /hidden code/.test(refusal(comment)));
const exif = Buffer.from('Exif\0\0<script>alert(1)</script>');
const exifJpg = Buffer.concat([jpg.subarray(0, 2), Buffer.from([0xff, 0xe1, 0, 2 + exif.length]), exif, jpg.subarray(2)]);
check('script in JPG EXIF refused', /hidden code/.test(refusal(exifJpg)));
const textPng = makePng([chunk('tEXt', Buffer.from('Comment\0<iframe src=x>'))]);
check('iframe in a PNG text chunk refused', /hidden code/.test(refusal(textPng)));
const svgPng = makePng([chunk('iTXt', Buffer.from('XML\0\0\0\0\0<svg onload=alert(1)>'))]);
check('SVG in a PNG iTXt chunk refused', /hidden code/.test(refusal(svgPng)));
const xmp = Buffer.from('<x:xmpmeta><script>alert(1)</script></x:xmpmeta>');
const xmpLen = Buffer.alloc(4);
xmpLen.writeUInt32LE(xmp.length);
const xmpPad = xmp.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
const webpXmp = Buffer.concat([webp, Buffer.from('XMP '), xmpLen, xmp, xmpPad]);
webpXmp.writeUInt32LE(webpXmp.length - 8, 4);
check('script in WEBP XMP refused', /hidden code/.test(refusal(webpXmp)));

// 4. Data after the picture is still refused.
check('script after a PNG refused', /extra hidden data/.test(refusal(Buffer.concat([png, Buffer.from('<script>')]))));
check('ZIP after a JPG refused', /extra hidden data/.test(refusal(Buffer.concat([jpg, Buffer.from('PK\x03\x04')]))));
check('web page renamed as PNG refused', /PNG, JPG or WEBP/.test(refusal(Buffer.from('<html><body>hi</body></html>'))));

console.log(`\nimage checks: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
