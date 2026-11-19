/* Self-contained QR Code generator (byte mode, error correction level M, versions 1-40).
 * Usage: QR.encode(text) -> {size, get(x,y)} ; QR.svg(text, opts) ; QR.canvas(text, px, margin)
 */

const ECC = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const NB = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33,
  35, 37, 38, 40, 43, 45, 47, 49,
];
const EXP = new Array(512),
  LOG = new Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsDivisor(deg) {
  const r = new Array(deg).fill(0);
  r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = mul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = mul(root, 2);
  }
  return r;
}
function rsRem(data, div) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => (r[i] ^= mul(c, f)));
  }
  return r;
}
const rawModules = (v) => {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
};
const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC[v] * NB[v];
function alignPos(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2,
    step = Math.floor((v * 8 + n * 3 + 5) / (n * 4 - 4)) * 2,
    res = [6];
  for (let pos = v * 4 + 10; res.length < n; pos -= step) res.splice(1, 0, pos);
  return res;
}
const bit = (x, i) => ((x >>> i) & 1) !== 0;

function encode(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let ver = 1;
  for (; ver <= 40; ver++) {
    const cc = ver <= 9 ? 8 : 16;
    if (4 + cc + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > 40) throw new Error('Text too long for QR');
  const cap = dataCodewords(ver) * 8,
    bb = [];
  const put = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap - bb.length));
  put(0, (8 - (bb.length % 8)) % 8);
  for (let p = 0xec; bb.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
  const data = [];
  for (let i = 0; i < bb.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb[i + j];
    data.push(v);
  }

  // ECC + interleave
  const nb = NB[ver],
    el = ECC[ver],
    raw = Math.floor(rawModules(ver) / 8),
    nShort = nb - (raw % nb),
    shortLen = Math.floor(raw / nb);
  const div = rsDivisor(el),
    blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRem(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const cw = [];
  for (let i = 0; i < blocks[0].length; i++)
    blocks.forEach((b, j) => {
      if (i !== shortLen - el || j >= nShort) cw.push(b[i]);
    });

  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setF = (x, y, d) => {
    mod[y][x] = d;
    fn[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    setF(6, i, i % 2 === 0);
    setF(i, 6, i % 2 === 0);
  }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)),
          x = cx + dx,
          y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const ap = alignPos(ver),
    na = ap.length;
  for (let i = 0; i < na; i++)
    for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) setF(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  const drawFormat = (mask) => {
    const d = (0 << 3) | mask; // level M = 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setF(8, i, bit(bits, i));
    setF(8, 7, bit(bits, 6));
    setF(8, 8, bit(bits, 7));
    setF(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(bits, i));
    setF(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const bits = (ver << 12) | r;
    for (let i = 0; i < 18; i++) {
      const b = bit(bits, i),
        a = size - 11 + (i % 3),
        c = Math.floor(i / 3);
      setF(a, c, b);
      setF(c, a, b);
    }
  }
  // place data
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j,
          up = ((right + 1) & 2) === 0,
          y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < cw.length * 8) {
          mod[y][x] = bit(cw[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
  }
  const maskFn = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m) => {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x];
  };
  const penalty = () => {
    let p = 0,
      dark = 0;
    for (let a = 0; a < 2; a++)
      for (let u = 0; u < size; u++) {
        let run = 1;
        for (let v = 1; v <= size; v++) {
          const cur = v < size ? (a ? mod[v][u] : mod[u][v]) : null,
            prev = a ? mod[v - 1][u] : mod[u][v - 1];
          if (cur === prev) run++;
          else {
            if (run >= 5) p += run - 2;
            run = 1;
          }
        }
      }
    for (let y = 0; y < size - 1; y++)
      for (let x = 0; x < size - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
    for (let a = 0; a < 2; a++)
      for (let u = 0; u < size; u++) {
        // finder-like patterns
        let s = '0000';
        for (let v = 0; v < size; v++) s += (a ? mod[v][u] : mod[u][v]) ? '1' : '0';
        s += '0000';
        for (let k = s.indexOf('1011101'); k >= 0; k = s.indexOf('1011101', k + 1)) {
          if (s.substr(k - 4, 4) === '0000') p += 40;
          if (s.substr(k + 7, 4) === '0000') p += 40;
        }
      }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mod[y][x]) dark++;
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0,
    bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const pp = penalty();
    if (pp < bestP) {
      bestP = pp;
      best = m;
    }
    applyMask(m);
  }
  applyMask(best);
  drawFormat(best);
  return { size, version: ver, get: (x, y) => x >= 0 && y >= 0 && x < size && y < size && mod[y][x] };
}

function svg(text, o) {
  o = o || {};
  const q = encode(text),
    m = o.margin == null ? 4 : o.margin,
    n = q.size + m * 2;
  let d = '';
  for (let y = 0; y < q.size; y++)
    for (let x = 0; x < q.size; x++) if (q.get(x, y)) d += 'M' + (x + m) + ',' + (y + m) + 'h1v1h-1z';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
    n +
    ' ' +
    n +
    '" shape-rendering="crispEdges"' +
    (o.cls ? ' class="' + o.cls + '"' : '') +
    '><rect width="100%" height="100%" fill="' +
    (o.bg || '#fff') +
    '"/><path d="' +
    d +
    '" fill="' +
    (o.fg || '#000') +
    '"/></svg>'
  );
}
function draw(ctx, text, x0, y0, px, fg) {
  const q = encode(text),
    s = px / q.size;
  ctx.fillStyle = fg || '#000';
  for (let y = 0; y < q.size; y++)
    for (let x = 0; x < q.size; x++)
      if (q.get(x, y)) ctx.fillRect(Math.floor(x0 + x * s), Math.floor(y0 + y * s), Math.ceil(s), Math.ceil(s));
}
function canvas(text, px, margin) {
  const q = encode(text),
    m = margin == null ? 4 : margin,
    sc = Math.max(1, Math.floor(px / (q.size + 2 * m)));
  const c = document.createElement('canvas');
  c.width = c.height = sc * (q.size + 2 * m);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  for (let y = 0; y < q.size; y++)
    for (let x = 0; x < q.size; x++) if (q.get(x, y)) ctx.fillRect((x + m) * sc, (y + m) * sc, sc, sc);
  return c;
}

export const QR = { encode, svg, draw, canvas };
