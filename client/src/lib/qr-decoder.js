/* Self-contained QR Code decoder (no libraries).
 * Pipeline: adaptive binarisation → finder-pattern detection → alignment pattern →
 * perspective sampling → format/version info → unmask → de-interleave →
 * Reed-Solomon error correction → segment decoding (numeric, alphanumeric, byte/UTF-8, ECI).
 * Usage: QRDecode.decode({ data: Uint8ClampedArray RGBA, width, height }) -> string | null
 */

/* GF(256) & Reed-Solomon */
const EXP = new Uint8Array(512),
  LOG = new Uint8Array(256);
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
const div = (a, b) => (a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0);
const gpow = (a, e) => (e === 0 ? 1 : a ? EXP[(LOG[a] * e) % 255] : 0);
function syndromes(cw, ecc) {
  const S = new Array(ecc);
  let any = false;
  for (let i = 0; i < ecc; i++) {
    let v = 0;
    const a = EXP[i];
    for (let k = 0; k < cw.length; k++) v = mul(v, a) ^ cw[k];
    S[i] = v;
    if (v) any = true;
  }
  return any ? S : null;
}
function rsCorrect(cw, ecc) {
  const n = cw.length,
    S = syndromes(cw, ecc);
  if (!S) return true;
  let C = [1],
    Bp = [1],
    L = 0,
    m = 1,
    b = 1;
  for (let k = 0; k < ecc; k++) {
    let d = S[k];
    for (let i = 1; i <= L; i++) d ^= mul(C[i] || 0, S[k - i]);
    if (d === 0) {
      m++;
      continue;
    }
    const T = C.slice(),
      coef = div(d, b);
    for (let i = 0; i < Bp.length; i++) {
      const idx = i + m;
      while (C.length <= idx) C.push(0);
      C[idx] ^= mul(coef, Bp[i]);
    }
    if (2 * L <= k) {
      L = k + 1 - L;
      Bp = T;
      b = d;
      m = 1;
    } else m++;
  }
  while (C.length < L + 1) C.push(0);
  if (2 * L > ecc) return false;
  const pos = [];
  for (let p = 0; p < n; p++) {
    const xi = EXP[(255 - (p % 255)) % 255];
    let v = 0;
    for (let i = L; i >= 0; i--) v = mul(v, xi) ^ C[i];
    if (v === 0) pos.push(p);
  }
  if (pos.length !== L) return false;
  const Om = new Array(ecc).fill(0);
  for (let i = 0; i < ecc; i++) for (let j = 0; j <= L && i + j < ecc; j++) Om[i + j] ^= mul(S[i], C[j]);
  for (const p of pos) {
    const X = EXP[p % 255],
      Xi = EXP[(255 - (p % 255)) % 255];
    let om = 0;
    for (let i = ecc - 1; i >= 0; i--) om = mul(om, Xi) ^ Om[i];
    let dv = 0;
    for (let i = 1; i <= L; i += 2) dv ^= mul(C[i], gpow(Xi, i - 1));
    if (!dv) return false;
    cw[n - 1 - p] ^= mul(X, div(om, dv));
  }
  return !syndromes(cw, ecc);
}

/* QR tables (index = version) */
// error-correction level order: 0 = M, 1 = L, 2 = H, 3 = Q  (as encoded in the 2 format bits)
const ECC = {
  1: [
    -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  0: [
    -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  3: [
    -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  2: [
    -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};
const NB = {
  1: [
    -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19,
    19, 20, 21, 22, 24, 25,
  ],
  0: [
    -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31,
    33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  3: [
    -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43,
    45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  2: [
    -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48,
    51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
};
const rawModules = (v) => {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
};
function alignPos(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2,
    step = Math.floor((v * 8 + n * 3 + 5) / (n * 4 - 4)) * 2,
    res = [6];
  for (let pos = v * 4 + 10; res.length < n; pos -= step) res.splice(1, 0, pos);
  return res;
}
const FORMATS = []; // [codeword, ecl, mask]
for (let ecl = 0; ecl < 4; ecl++)
  for (let mask = 0; mask < 8; mask++) {
    const d = (ecl << 3) | mask;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    FORMATS.push([((d << 10) | r) ^ 0x5412, ecl, mask]);
  }
const VERSIONS = []; // [codeword, version]
for (let v = 7; v <= 40; v++) {
  let r = v;
  for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
  VERSIONS.push([(v << 12) | r, v]);
}
const popcnt = (x) => {
  let c = 0;
  while (x) {
    c += x & 1;
    x >>>= 1;
  }
  return c;
};
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/* bit-matrix decoding */
function decodeMatrix(get, size) {
  const bitAt = (x, y) => (get(x, y) ? 1 : 0);
  // format info (two copies)
  let f1 = 0,
    f2 = 0;
  for (let i = 0; i <= 5; i++) f1 |= bitAt(8, i) << i;
  f1 |= bitAt(8, 7) << 6;
  f1 |= bitAt(8, 8) << 7;
  f1 |= bitAt(7, 8) << 8;
  for (let i = 9; i < 15; i++) f1 |= bitAt(14 - i, 8) << i;
  for (let i = 0; i < 8; i++) f2 |= bitAt(size - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) f2 |= bitAt(8, size - 15 + i) << i;
  let best = null,
    bd = 99;
  for (const f of FORMATS) {
    const d = Math.min(popcnt(f[0] ^ f1), popcnt(f[0] ^ f2));
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  if (!best || bd > 3) return { err: 'format' };
  const ecl = best[1],
    mask = best[2];
  let ver = (size - 17) / 4;
  if (ver >= 7) {
    let v1 = 0,
      v2 = 0;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3),
        c = Math.floor(i / 3);
      v1 |= bitAt(a, c) << i;
      v2 |= bitAt(c, a) << i;
    }
    let bv = 0,
      vd = 99;
    for (const v of VERSIONS) {
      const d = Math.min(popcnt(v[0] ^ v1), popcnt(v[0] ^ v2));
      if (d < vd) {
        vd = d;
        bv = v[1];
      }
    }
    if (vd <= 3 && bv !== ver) return { retry: 17 + 4 * bv };
  }
  if (ver < 1 || ver > 40 || ver !== Math.floor(ver)) return { err: 'version' };
  // function-pattern map
  const fn = (x, y) => {
    if ((x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8)) return true;
    if (x === 6 || y === 6) return true;
    if (ver >= 7 && ((x >= size - 11 && x <= size - 9 && y < 6) || (y >= size - 11 && y <= size - 9 && x < 6)))
      return true;
    const ap = alignPos(ver),
      na = ap.length;
    for (let i = 0; i < na; i++)
      for (let j = 0; j < na; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
        if (Math.abs(x - ap[i]) <= 2 && Math.abs(y - ap[j]) <= 2) return true;
      }
    return false;
  };
  const raw = Math.floor(rawModules(ver) / 8),
    cw = new Uint8Array(raw),
    mf = MASKS[mask];
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j,
          up = ((right + 1) & 2) === 0,
          y = up ? size - 1 - vert : vert;
        if (fn(x, y) || bi >= raw * 8) continue;
        let bit = bitAt(x, y);
        if (mf(x, y)) bit ^= 1;
        if (bit) cw[bi >>> 3] |= 0x80 >>> (bi & 7);
        bi++;
      }
  }
  // de-interleave + error correction
  const nb = NB[ecl][ver],
    el = ECC[ecl][ver],
    nShort = nb - (raw % nb),
    shortLen = Math.floor(raw / nb);
  const blocks = Array.from({ length: nb }, () => new Array(shortLen + 1).fill(0));
  let k = 0;
  for (let i = 0; i <= shortLen; i++)
    for (let j = 0; j < nb; j++) {
      if (i === shortLen - el && j < nShort) continue; // short blocks have one data codeword less
      blocks[j][i] = cw[k++];
    }
  for (let j = 0; j < nShort; j++) blocks[j].splice(shortLen - el, 1);
  const data = [];
  for (const blk of blocks) {
    if (!rsCorrect(blk, el)) return { err: 'rs' };
    for (let i = 0; i < blk.length - el; i++) data.push(blk[i]);
  }
  const text = parseSegments(data, ver);
  return text == null ? { err: 'data' } : { text, version: ver, ecl: 'MLHQ'[ecl] };
}
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
function parseSegments(data, ver) {
  let pos = 0;
  const total = data.length * 8;
  const read = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++, pos++) v = (v << 1) | ((data[pos >>> 3] >>> (7 - (pos & 7))) & 1);
    return v;
  };
  let out = '',
    bytes = [];
  const flush = () => {
    if (!bytes.length) return;
    const u = new Uint8Array(bytes);
    try {
      out += new TextDecoder('utf-8', { fatal: true }).decode(u);
    } catch (e) {
      out += Array.from(u, (c) => String.fromCharCode(c)).join('');
    }
    bytes = [];
  };
  const cc = (a, b, c) => (ver <= 9 ? a : ver <= 26 ? b : c);
  while (pos + 4 <= total) {
    const mode = read(4);
    if (mode === 0) break;
    if (mode === 1) {
      flush();
      let n = read(cc(10, 12, 14));
      while (n >= 3) {
        if (pos + 10 > total) return null;
        out += String(read(10)).padStart(3, '0');
        n -= 3;
      }
      if (n === 2) out += String(read(7)).padStart(2, '0');
      else if (n === 1) out += String(read(4));
    } else if (mode === 2) {
      flush();
      let n = read(cc(9, 11, 13));
      while (n >= 2) {
        if (pos + 11 > total) return null;
        const v = read(11);
        out += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45];
        n -= 2;
      }
      if (n === 1) out += ALNUM[read(6)];
    } else if (mode === 4) {
      const n = read(cc(8, 16, 16));
      if (pos + n * 8 > total) return null;
      for (let i = 0; i < n; i++) bytes.push(read(8));
    } else if (mode === 7) {
      const f = read(8);
      if ((f & 0x80) === 0) {
      } else if ((f & 0xc0) === 0x80) read(8);
      else read(16);
    } else if (mode === 8) {
      flush();
      let n = read(cc(8, 10, 12));
      while (n-- > 0) {
        read(13);
        out += '?';
      }
    } else if (mode === 3) {
      read(16);
    } else if (mode === 5) {
      read(8);
    } else break;
  }
  flush();
  return out;
}

/* image → bits (adaptive threshold) */
function binarize(img, invert, smooth) {
  const w = img.width,
    h = img.height,
    d = img.data;
  let lum = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  if (smooth) {
    // 3x3 box filter: removes sensor noise / JPEG speckle before thresholding
    const t = new Uint16Array(w * h),
      o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        t[i] = lum[i] + (x > 0 ? lum[i - 1] : lum[i]) + (x < w - 1 ? lum[i + 1] : lum[i]);
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        o[i] = (t[i] + (y > 0 ? t[i - w] : t[i]) + (y < h - 1 ? t[i + w] : t[i])) / 9;
      }
    lum = o;
  }
  const B = 8,
    bw = Math.ceil(w / B),
    bh = Math.ceil(h / B),
    bp = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let mn = 255,
        mx = 0,
        sum = 0,
        cnt = 0;
      for (let y = by * B; y < Math.min(h, by * B + B); y++)
        for (let x = bx * B; x < Math.min(w, bx * B + B); x++) {
          const v = lum[y * w + x];
          sum += v;
          cnt++;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      let avg = sum / cnt;
      if (mx - mn <= 24) {
        avg = mn / 2;
        if (by > 0 && bx > 0) {
          const nb = (bp[(by - 1) * bw + bx] + 2 * bp[by * bw + bx - 1] + bp[(by - 1) * bw + bx - 1]) / 4;
          if (mn < nb) avg = nb;
        }
      }
      bp[by * bw + bx] = avg;
    }
  const bits = new Uint8Array(w * h);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0,
        cnt = 0;
      for (let yy = Math.max(0, by - 2); yy <= Math.min(bh - 1, by + 2); yy++)
        for (let xx = Math.max(0, bx - 2); xx <= Math.min(bw - 1, bx + 2); xx++) {
          sum += bp[yy * bw + xx];
          cnt++;
        }
      const t = sum / cnt;
      for (let y = by * B; y < Math.min(h, by * B + B); y++)
        for (let x = bx * B; x < Math.min(w, bx * B + B); x++) {
          const black = lum[y * w + x] <= t;
          bits[y * w + x] = black !== !!invert ? 1 : 0;
        }
    }
  return { w, h, bits, get: (x, y) => bits[y * w + x] === 1 };
}

/* finder patterns */
function ratioOK(s) {
  const tot = s[0] + s[1] + s[2] + s[3] + s[4];
  if (tot < 7) return false;
  const ms = tot / 7,
    mv = ms / 1.6;
  return (
    Math.abs(ms - s[0]) < mv &&
    Math.abs(ms - s[1]) < mv &&
    Math.abs(3 * ms - s[2]) < 3 * mv &&
    Math.abs(ms - s[3]) < mv &&
    Math.abs(ms - s[4]) < mv
  );
}
function crossCheck(img, cx, cy, dx, dy, maxCount, origTotal) {
  const s = [0, 0, 0, 0, 0],
    W = img.w,
    H = img.h;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  let x = cx,
    y = cy;
  while (inb(x, y) && img.get(x, y)) {
    s[2]++;
    x -= dx;
    y -= dy;
  }
  if (!inb(x, y)) return NaN;
  while (inb(x, y) && !img.get(x, y) && s[1] <= maxCount) {
    s[1]++;
    x -= dx;
    y -= dy;
  }
  if (!inb(x, y) || s[1] > maxCount) return NaN;
  while (inb(x, y) && img.get(x, y) && s[0] <= maxCount) {
    s[0]++;
    x -= dx;
    y -= dy;
  }
  if (s[0] > maxCount) return NaN;
  x = cx + dx;
  y = cy + dy;
  while (inb(x, y) && img.get(x, y)) {
    s[2]++;
    x += dx;
    y += dy;
  }
  if (!inb(x, y)) return NaN;
  while (inb(x, y) && !img.get(x, y) && s[3] < maxCount) {
    s[3]++;
    x += dx;
    y += dy;
  }
  if (!inb(x, y) || s[3] >= maxCount) return NaN;
  while (inb(x, y) && img.get(x, y) && s[4] < maxCount) {
    s[4]++;
    x += dx;
    y += dy;
  }
  if (s[4] >= maxCount) return NaN;
  const tot = s[0] + s[1] + s[2] + s[3] + s[4];
  if (5 * Math.abs(tot - origTotal) >= 2 * origTotal || !ratioOK(s)) return NaN;
  const end = dx ? x : y;
  return end - s[4] - s[3] - s[2] / 2;
}
function findFinders(img) {
  const W = img.w,
    H = img.h,
    centers = [];
  const step = Math.max(1, Math.floor((3 * H) / (4 * 97)));
  const handle = (s, row, endX) => {
    const tot = s[0] + s[1] + s[2] + s[3] + s[4];
    let cx = endX - s[4] - s[3] - s[2] / 2;
    const cy = crossCheck(img, Math.floor(cx), row, 0, 1, s[2], tot);
    if (isNaN(cy)) return false;
    const cx2 = crossCheck(img, Math.floor(cx), Math.floor(cy), 1, 0, s[2], tot);
    if (isNaN(cx2)) return false;
    cx = cx2;
    const ms = tot / 7;
    for (const c of centers) {
      if (
        Math.abs(cy - c.y) <= ms &&
        Math.abs(cx - c.x) <= ms &&
        (Math.abs(ms - c.ms) <= 1 || Math.abs(ms - c.ms) <= c.ms)
      ) {
        const n = c.n + 1;
        c.x = (c.x * c.n + cx) / n;
        c.y = (c.y * c.n + cy) / n;
        c.ms = (c.ms * c.n + ms) / n;
        c.n = n;
        return true;
      }
    }
    centers.push({ x: cx, y: cy, ms, n: 1 });
    return true;
  };
  for (let y = step - 1; y < H; y += step) {
    const s = [0, 0, 0, 0, 0];
    let cur = 0;
    for (let x = 0; x < W; x++) {
      if (img.get(x, y)) {
        if (cur & 1) cur++;
        s[cur]++;
      } else if (!(cur & 1)) {
        if (cur === 4) {
          if (ratioOK(s) && handle(s, y, x)) {
            s.fill(0);
            cur = 0;
          } else {
            s[0] = s[2];
            s[1] = s[3];
            s[2] = s[4];
            s[3] = 1;
            s[4] = 0;
            cur = 3;
          }
        } else s[++cur]++;
      } else s[cur]++;
    }
    if (ratioOK(s)) handle(s, y, W);
  }
  return centers;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function bestTriples(centers) {
  const cand = centers
      .slice()
      .sort((a, b) => b.n - a.n)
      .slice(0, 14),
    out = [];
  for (let i = 0; i < cand.length; i++)
    for (let j = i + 1; j < cand.length; j++)
      for (let k = j + 1; k < cand.length; k++) {
        const P = [cand[i], cand[j], cand[k]],
          mss = P.map((p) => p.ms),
          mx = Math.max(...mss),
          mn = Math.min(...mss);
        if (mx > mn * 1.6) continue;
        const d = [
          [dist(P[0], P[1]), 2],
          [dist(P[0], P[2]), 1],
          [dist(P[1], P[2]), 0],
        ].sort((a, b) => a[0] - b[0]);
        const a = d[0][0],
          b = d[1][0],
          c = d[2][0];
        const msAvg = (mss[0] + mss[1] + mss[2]) / 3;
        if (a < msAvg * 10) continue;
        const score =
          Math.abs(c * c - (a * a + b * b)) / (c * c) +
          Math.abs(a - b) / b +
          ((mx - mn) / mx) * 0.5 -
          Math.min(P[0].n, P[1].n, P[2].n) * 0.002;
        if (score > 0.6) continue;
        let tl = P[d[2][1]],
          A = P[(d[2][1] + 1) % 3],
          C = P[(d[2][1] + 2) % 3];
        // cross product decides which is top-right vs bottom-left
        if ((C.x - tl.x) * (A.y - tl.y) - (C.y - tl.y) * (A.x - tl.x) < 0) {
          const t = A;
          A = C;
          C = t;
        }
        out.push({ score, tl, tr: C, bl: A, ms: msAvg });
      }
  return out.sort((a, b) => a.score - b.score).slice(0, 4);
}

/* geometry */
function sq2quad(x0, y0, x1, y1, x2, y2, x3, y3) {
  const dx3 = x0 - x1 + x2 - x3,
    dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9)
    return [
      [x1 - x0, x3 - x0, x0],
      [y1 - y0, y3 - y0, y0],
      [0, 0, 1],
    ];
  const dx1 = x1 - x2,
    dx2 = x3 - x2,
    dy1 = y1 - y2,
    dy2 = y3 - y2,
    den = dx1 * dy2 - dx2 * dy1;
  const a13 = (dx3 * dy2 - dx2 * dy3) / den,
    a23 = (dx1 * dy3 - dx3 * dy1) / den;
  return [
    [x1 - x0 + a13 * x1, x3 - x0 + a23 * x3, x0],
    [y1 - y0 + a13 * y1, y3 - y0 + a23 * y3, y0],
    [a13, a23, 1],
  ];
}
function adj(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  return [
    [e * i - f * h, c * h - b * i, b * f - c * e],
    [f * g - d * i, a * i - c * g, c * d - a * f],
    [d * h - e * g, b * g - a * h, a * e - b * d],
  ];
}
function mm(A, B) {
  const R = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i][j] += A[i][k] * B[k][j];
  return R;
}
function quad2quad(src, dst) {
  return mm(sq2quad(...dst), adj(sq2quad(...src)));
}
const apply = (M, x, y) => {
  const w = M[2][0] * x + M[2][1] * y + M[2][2];
  return [(M[0][0] * x + M[0][1] * y + M[0][2]) / w, (M[1][0] * x + M[1][1] * y + M[1][2]) / w];
};

function findAlignment(img, t, dim) {
  const n = dim - 7,
    ux = { x: (t.tr.x - t.tl.x) / n, y: (t.tr.y - t.tl.y) / n },
    uy = { x: (t.bl.x - t.tl.x) / n, y: (t.bl.y - t.tl.y) / n };
  const brx = t.tr.x - t.tl.x + t.bl.x,
    bry = t.tr.y - t.tl.y + t.bl.y,
    corr = 1 - 3 / n;
  const ex = t.tl.x + corr * (brx - t.tl.x),
    ey = t.tl.y + corr * (bry - t.tl.y);
  const ms = Math.hypot(ux.x, ux.y),
    stp = Math.max(1, ms / 3);
  const score = (cx, cy) => {
    let sc = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const px = Math.round(cx + dx * ux.x + dy * uy.x),
          py = Math.round(cy + dx * ux.y + dy * uy.y);
        if (px < 0 || py < 0 || px >= img.w || py >= img.h) return -1;
        if (img.get(px, py) === (Math.max(Math.abs(dx), Math.abs(dy)) !== 1)) sc++;
      }
    return sc;
  };
  for (const allow of [4, 8, 14]) {
    const r = allow * ms;
    let best = -1,
      bx = 0,
      by = 0;
    for (let y = ey - r; y <= ey + r; y += stp)
      for (let x = ex - r; x <= ex + r; x += stp) {
        const s = score(x, y);
        if (s > best) {
          best = s;
          bx = x;
          by = y;
        }
      }
    if (best >= 22) return { x: bx, y: by };
  }
  return null;
}
function sampleGrid(img, t, dim, al) {
  const d3 = dim - 3.5;
  let src, dst;
  if (al) {
    src = [3.5, 3.5, d3, 3.5, d3 - 3, d3 - 3, 3.5, d3];
    dst = [t.tl.x, t.tl.y, t.tr.x, t.tr.y, al.x, al.y, t.bl.x, t.bl.y];
  } else {
    src = [3.5, 3.5, d3, 3.5, d3, d3, 3.5, d3];
    dst = [t.tl.x, t.tl.y, t.tr.x, t.tr.y, t.tr.x - t.tl.x + t.bl.x, t.tr.y - t.tl.y + t.bl.y, t.bl.x, t.bl.y];
  }
  const M = quad2quad(src, dst),
    bits = new Uint8Array(dim * dim);
  for (let y = 0; y < dim; y++)
    for (let x = 0; x < dim; x++) {
      let [px, py] = apply(M, x + 0.5, y + 0.5);
      px = Math.floor(px);
      py = Math.floor(py);
      if (px < -1 || py < -1 || px > img.w || py > img.h) return null;
      px = Math.min(img.w - 1, Math.max(0, px));
      py = Math.min(img.h - 1, Math.max(0, py));
      bits[y * dim + x] = img.bits[py * img.w + px];
    }
  return bits;
}
// module size measured along the line between two finder centres (robust to rotation)
function runLen(img, fx, fy, ux, uy, maxL) {
  let state = 0;
  for (let i = 0; i < maxL; i++) {
    const x = Math.round(fx + ux * i),
      y = Math.round(fy + uy * i);
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return state === 2 ? i : NaN;
    const black = img.get(x, y);
    if (state === 0 && !black) state = 1;
    else if (state === 1 && black) state = 2;
    else if (state === 2 && !black) return i;
  }
  return NaN;
}
function moduleAlong(img, a, b, guess) {
  const L = dist(a, b),
    ux = (b.x - a.x) / L,
    uy = (b.y - a.y) / L,
    lim = guess * 8;
  const v = [
    runLen(img, a.x, a.y, ux, uy, lim) + runLen(img, a.x, a.y, -ux, -uy, lim),
    runLen(img, b.x, b.y, -ux, -uy, lim) + runLen(img, b.x, b.y, ux, uy, lim),
  ]
    .filter((x) => !isNaN(x))
    .map((x) => x / 7);
  return v.length ? v.reduce((p, c) => p + c, 0) / v.length : guess;
}
function tryTriple(img, t) {
  const msX = moduleAlong(img, t.tl, t.tr, t.ms),
    msY = moduleAlong(img, t.tl, t.bl, t.ms);
  const est = Math.round((dist(t.tl, t.tr) / msX + dist(t.tl, t.bl) / msY) / 2) + 7;
  const base = [];
  const r = est & 3;
  if (r === 1) base.push(est);
  else if (r === 0) base.push(est + 1, est - 3);
  else if (r === 2) base.push(est - 1, est + 3);
  else base.push(est - 2, est + 2);
  const dims = [];
  for (const b of base)
    for (const dd of [0, 4, -4]) {
      const v = b + dd;
      if (v >= 21 && v <= 177 && !dims.includes(v)) dims.push(v);
    }
  const seen = new Set();
  for (let i = 0; i < dims.length && i < 8; i++) {
    const dim = dims[i];
    if (seen.has(dim)) continue;
    seen.add(dim);
    const al = dim > 21 ? findAlignment(img, t, dim) : null;
    for (const a of al ? [al, null] : [null]) {
      const bits = sampleGrid(img, t, dim, a);
      if (!bits) continue;
      let r = decodeMatrix((x, y) => bits[y * dim + x], dim);
      if (r.retry && !seen.has(r.retry)) {
        dims.splice(i + 1, 0, r.retry);
        break;
      }
      if (r.text != null) return r;
      r = decodeMatrix((x, y) => bits[x * dim + y], dim); // mirrored
      if (r.text != null) return r;
    }
  }
  return null;
}
function upscale2(src) {
  // bilinear 2x – helps with small / far-away codes
  const w = src.width,
    h = src.height,
    W = w * 2,
    H = h * 2,
    s = src.data,
    d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) / 2 - 0.5)),
      y0 = Math.floor(fy),
      y1 = Math.min(h - 1, y0 + 1),
      wy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / 2 - 0.5)),
        x0 = Math.floor(fx),
        x1 = Math.min(w - 1, x0 + 1),
        wx = fx - x0,
        o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = s[(y0 * w + x0) * 4 + c],
          b = s[(y0 * w + x1) * 4 + c],
          cc = s[(y1 * w + x0) * 4 + c],
          dd = s[(y1 * w + x1) * 4 + c];
        d[o + c] = (a * (1 - wx) + b * wx) * (1 - wy) + (cc * (1 - wx) + dd * wx) * wy;
      }
      d[o + 3] = 255;
    }
  }
  return { data: d, width: W, height: H };
}
function attempt(imgData, smooth) {
  for (const inv of [false, true]) {
    const img = binarize(imgData, inv, smooth),
      centers = findFinders(img);
    if (centers.length < 3) continue;
    for (const t of bestTriples(centers)) {
      const r = tryTriple(img, t);
      if (r) return r.text;
    }
  }
  return null;
}
function decode(imgData, opts) {
  if (!imgData || !imgData.width || !imgData.height) return null;
  let r = attempt(imgData, false);
  if (r != null) return r;
  r = attempt(imgData, true); // noisy / grainy camera frames
  if (r != null || (opts && opts.fast)) return r;
  if (imgData.width * imgData.height > 1300000) return null;
  const big = upscale2(imgData); // small or far-away codes
  return attempt(big, false) || attempt(big, true);
}

export const QRDecode = { decode };

// Exposed for the unit tests.
export { decodeMatrix };
