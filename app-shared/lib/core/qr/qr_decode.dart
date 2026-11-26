// Self-contained QR Code decoder (no packages) – a Dart port of the web app's qr-decoder.js.
// Pipeline: adaptive binarisation → finder patterns → alignment pattern → perspective sampling
// → format/version → unmask → de-interleave → Reed-Solomon → segment decoding.
// Input is a grayscale (luminance) image: one byte per pixel.

import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

final Uint8List _exp = Uint8List(512);
final Uint8List _log = Uint8List(256);
bool _gfReady = false;

void _initGf() {
  if (_gfReady) return;
  var x = 1;
  for (var i = 0; i < 255; i++) {
    _exp[i] = x;
    _log[x] = i;
    x <<= 1;
    if (x & 256 != 0) x ^= 0x11d;
  }
  for (var i = 255; i < 512; i++) {
    _exp[i] = _exp[i - 255];
  }
  _gfReady = true;
}

int _mul(int a, int b) => (a != 0 && b != 0) ? _exp[_log[a] + _log[b]] : 0;
int _div(int a, int b) => a != 0 ? _exp[(_log[a] + 255 - _log[b]) % 255] : 0;
int _gpow(int a, int e) => e == 0 ? 1 : (a != 0 ? _exp[(_log[a] * e) % 255] : 0);

List<int>? _syndromes(List<int> cw, int ecc) {
  final s = List<int>.filled(ecc, 0);
  var any = false;
  for (var i = 0; i < ecc; i++) {
    var v = 0;
    final a = _exp[i];
    for (var k = 0; k < cw.length; k++) {
      v = _mul(v, a) ^ cw[k];
    }
    s[i] = v;
    if (v != 0) any = true;
  }
  return any ? s : null;
}

bool _rsCorrect(List<int> cw, int ecc) {
  final n = cw.length;
  final s = _syndromes(cw, ecc);
  if (s == null) return true;
  var c = <int>[1];
  var bp = <int>[1];
  var l = 0, m = 1, b = 1;
  for (var k = 0; k < ecc; k++) {
    var d = s[k];
    for (var i = 1; i <= l; i++) {
      d ^= _mul(i < c.length ? c[i] : 0, s[k - i]);
    }
    if (d == 0) {
      m++;
      continue;
    }
    final t = List<int>.from(c);
    final coef = _div(d, b);
    for (var i = 0; i < bp.length; i++) {
      final idx = i + m;
      while (c.length <= idx) {
        c.add(0);
      }
      c[idx] ^= _mul(coef, bp[i]);
    }
    if (2 * l <= k) {
      l = k + 1 - l;
      bp = t;
      b = d;
      m = 1;
    } else {
      m++;
    }
  }
  while (c.length < l + 1) {
    c.add(0);
  }
  if (2 * l > ecc) return false;
  final pos = <int>[];
  for (var p = 0; p < n; p++) {
    final xi = _exp[(255 - (p % 255)) % 255];
    var v = 0;
    for (var i = l; i >= 0; i--) {
      v = _mul(v, xi) ^ c[i];
    }
    if (v == 0) pos.add(p);
  }
  if (pos.length != l) return false;
  final om = List<int>.filled(ecc, 0);
  for (var i = 0; i < ecc; i++) {
    for (var j = 0; j <= l && i + j < ecc; j++) {
      om[i + j] ^= _mul(s[i], c[j]);
    }
  }
  for (final p in pos) {
    final x = _exp[p % 255];
    final xi = _exp[(255 - (p % 255)) % 255];
    var omv = 0;
    for (var i = ecc - 1; i >= 0; i--) {
      omv = _mul(omv, xi) ^ om[i];
    }
    var dv = 0;
    for (var i = 1; i <= l; i += 2) {
      dv ^= _mul(c[i], _gpow(xi, i - 1));
    }
    if (dv == 0) return false;
    cw[n - 1 - p] ^= _mul(x, _div(omv, dv));
  }
  return _syndromes(cw, ecc) == null;
}

// Error-correction level order as encoded in the 2 format bits: 0 = M, 1 = L, 2 = H, 3 = Q.
const Map<int, List<int>> _eccTable = {
  1: [
    -1,
    7,
    10,
    15,
    20,
    26,
    18,
    20,
    24,
    30,
    18,
    20,
    24,
    26,
    30,
    22,
    24,
    28,
    30,
    28,
    28,
    28,
    28,
    30,
    30,
    26,
    28,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
  ],
  0: [
    -1,
    10,
    16,
    26,
    18,
    24,
    16,
    18,
    22,
    22,
    26,
    30,
    22,
    22,
    24,
    24,
    28,
    28,
    26,
    26,
    26,
    26,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
    28,
  ],
  3: [
    -1,
    13,
    22,
    18,
    26,
    18,
    24,
    18,
    22,
    20,
    24,
    28,
    26,
    24,
    20,
    30,
    24,
    28,
    28,
    26,
    30,
    28,
    30,
    30,
    30,
    30,
    28,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
  ],
  2: [
    -1,
    17,
    28,
    22,
    16,
    22,
    28,
    26,
    26,
    24,
    28,
    24,
    28,
    22,
    24,
    24,
    30,
    28,
    28,
    26,
    28,
    30,
    24,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
    30,
  ],
};
const Map<int, List<int>> _nbTable = {
  1: [
    -1,
    1,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    4,
    4,
    4,
    4,
    4,
    6,
    6,
    6,
    6,
    7,
    8,
    8,
    9,
    9,
    10,
    12,
    12,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    19,
    20,
    21,
    22,
    24,
    25,
  ],
  0: [
    -1,
    1,
    1,
    1,
    2,
    2,
    4,
    4,
    4,
    5,
    5,
    5,
    8,
    9,
    9,
    10,
    10,
    11,
    13,
    14,
    16,
    17,
    17,
    18,
    20,
    21,
    23,
    25,
    26,
    28,
    29,
    31,
    33,
    35,
    37,
    38,
    40,
    43,
    45,
    47,
    49,
  ],
  3: [
    -1,
    1,
    1,
    2,
    2,
    4,
    4,
    6,
    6,
    8,
    8,
    8,
    10,
    12,
    16,
    12,
    17,
    16,
    18,
    21,
    20,
    23,
    23,
    25,
    27,
    29,
    34,
    34,
    35,
    38,
    40,
    43,
    45,
    48,
    51,
    53,
    56,
    59,
    62,
    65,
    68,
  ],
  2: [
    -1,
    1,
    1,
    2,
    4,
    4,
    4,
    5,
    6,
    8,
    8,
    11,
    11,
    16,
    16,
    18,
    16,
    19,
    21,
    25,
    25,
    25,
    34,
    30,
    32,
    35,
    37,
    40,
    42,
    45,
    48,
    51,
    54,
    57,
    60,
    63,
    66,
    70,
    74,
    77,
    81,
  ],
};

int _rawModules(int v) {
  var r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    final n = v ~/ 7 + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}

List<int> _alignPos(int v) {
  if (v == 1) return <int>[];
  final n = v ~/ 7 + 2;
  final step = ((v * 8 + n * 3 + 5) ~/ (n * 4 - 4)) * 2;
  final res = <int>[6];
  for (var pos = v * 4 + 10; res.length < n; pos -= step) {
    res.insert(1, pos);
  }
  return res;
}

final List<List<int>> _formats = () {
  final out = <List<int>>[];
  for (var ecl = 0; ecl < 4; ecl++) {
    for (var mask = 0; mask < 8; mask++) {
      final d = (ecl << 3) | mask;
      var r = d;
      for (var i = 0; i < 10; i++) {
        r = (r << 1) ^ ((r >> 9) * 0x537);
      }
      out.add([((d << 10) | r) ^ 0x5412, ecl, mask]);
    }
  }
  return out;
}();

final List<List<int>> _versions = () {
  final out = <List<int>>[];
  for (var v = 7; v <= 40; v++) {
    var r = v;
    for (var i = 0; i < 12; i++) {
      r = (r << 1) ^ ((r >> 11) * 0x1f25);
    }
    out.add([(v << 12) | r, v]);
  }
  return out;
}();

int _popcnt(int x) {
  var c = 0;
  while (x != 0) {
    c += x & 1;
    x >>= 1;
  }
  return c;
}

bool _mask(int m, int x, int y) {
  switch (m) {
    case 0:
      return (x + y) % 2 == 0;
    case 1:
      return y % 2 == 0;
    case 2:
      return x % 3 == 0;
    case 3:
      return (x + y) % 3 == 0;
    case 4:
      return ((x ~/ 3) + (y ~/ 2)) % 2 == 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) == 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 == 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 == 0;
  }
}

class _MatrixResult {
  final String? text;
  final int? retry;
  _MatrixResult({this.text, this.retry});
}

_MatrixResult _decodeMatrix(bool Function(int x, int y) get, int size) {
  int bitAt(int x, int y) => get(x, y) ? 1 : 0;
  var f1 = 0, f2 = 0;
  for (var i = 0; i <= 5; i++) {
    f1 |= bitAt(8, i) << i;
  }
  f1 |= bitAt(8, 7) << 6;
  f1 |= bitAt(8, 8) << 7;
  f1 |= bitAt(7, 8) << 8;
  for (var i = 9; i < 15; i++) {
    f1 |= bitAt(14 - i, 8) << i;
  }
  for (var i = 0; i < 8; i++) {
    f2 |= bitAt(size - 1 - i, 8) << i;
  }
  for (var i = 8; i < 15; i++) {
    f2 |= bitAt(8, size - 15 + i) << i;
  }
  List<int>? best;
  var bd = 99;
  for (final f in _formats) {
    final d = math.min(_popcnt(f[0] ^ f1), _popcnt(f[0] ^ f2));
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  if (best == null || bd > 3) return _MatrixResult();
  final ecl = best[1];
  final mask = best[2];
  if ((size - 17) % 4 != 0) return _MatrixResult();
  final ver = (size - 17) ~/ 4;
  if (ver >= 7) {
    var v1 = 0, v2 = 0;
    for (var i = 0; i < 18; i++) {
      final a = size - 11 + (i % 3);
      final c = i ~/ 3;
      v1 |= bitAt(a, c) << i;
      v2 |= bitAt(c, a) << i;
    }
    var bv = 0, vd = 99;
    for (final v in _versions) {
      final d = math.min(_popcnt(v[0] ^ v1), _popcnt(v[0] ^ v2));
      if (d < vd) {
        vd = d;
        bv = v[1];
      }
    }
    if (vd <= 3 && bv != ver) return _MatrixResult(retry: 17 + 4 * bv);
  }
  if (ver < 1 || ver > 40) return _MatrixResult();
  final ap = _alignPos(ver);
  final na = ap.length;
  bool fn(int x, int y) {
    if ((x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8)) return true;
    if (x == 6 || y == 6) return true;
    if (ver >= 7 && ((x >= size - 11 && x <= size - 9 && y < 6) || (y >= size - 11 && y <= size - 9 && x < 6)))
      return true;
    for (var i = 0; i < na; i++) {
      for (var j = 0; j < na; j++) {
        if ((i == 0 && j == 0) || (i == 0 && j == na - 1) || (i == na - 1 && j == 0)) continue;
        if ((x - ap[i]).abs() <= 2 && (y - ap[j]).abs() <= 2) return true;
      }
    }
    return false;
  }

  final raw = _rawModules(ver) ~/ 8;
  final cw = Uint8List(raw);
  var bi = 0;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right == 6) right = 5;
    for (var vert = 0; vert < size; vert++) {
      for (var j = 0; j < 2; j++) {
        final x = right - j;
        final up = ((right + 1) & 2) == 0;
        final y = up ? size - 1 - vert : vert;
        if (fn(x, y) || bi >= raw * 8) continue;
        var bit = bitAt(x, y);
        if (_mask(mask, x, y)) bit ^= 1;
        if (bit != 0) cw[bi >> 3] |= 0x80 >> (bi & 7);
        bi++;
      }
    }
  }
  final nb = _nbTable[ecl]![ver];
  final el = _eccTable[ecl]![ver];
  final nShort = nb - (raw % nb);
  final shortLen = raw ~/ nb;
  final blocks = List<List<int>>.generate(nb, (_) => List<int>.filled(shortLen + 1, 0, growable: true));
  var k = 0;
  for (var i = 0; i <= shortLen; i++) {
    for (var j = 0; j < nb; j++) {
      if (i == shortLen - el && j < nShort) continue;
      blocks[j][i] = cw[k++];
    }
  }
  for (var j = 0; j < nShort; j++) {
    blocks[j].removeAt(shortLen - el);
  }
  final data = <int>[];
  for (final blk in blocks) {
    if (!_rsCorrect(blk, el)) return _MatrixResult();
    for (var i = 0; i < blk.length - el; i++) {
      data.add(blk[i]);
    }
  }
  final text = _parseSegments(data, ver);
  return _MatrixResult(text: text);
}

const String _alnum = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ \$%*+-./:';

String? _parseSegments(List<int> data, int ver) {
  var pos = 0;
  final total = data.length * 8;
  int read(int n) {
    var v = 0;
    for (var i = 0; i < n; i++, pos++) {
      v = (v << 1) | ((data[pos >> 3] >> (7 - (pos & 7))) & 1);
    }
    return v;
  }

  final out = StringBuffer();
  var bytes = <int>[];
  void flush() {
    if (bytes.isEmpty) return;
    try {
      out.write(utf8.decode(bytes));
    } catch (_) {
      out.write(String.fromCharCodes(bytes));
    }
    bytes = <int>[];
  }

  int cc(int a, int b, int c) => ver <= 9 ? a : (ver <= 26 ? b : c);
  while (pos + 4 <= total) {
    final mode = read(4);
    if (mode == 0) break;
    if (mode == 1) {
      flush();
      var n = read(cc(10, 12, 14));
      while (n >= 3) {
        if (pos + 10 > total) return null;
        out.write(read(10).toString().padLeft(3, '0'));
        n -= 3;
      }
      if (n == 2) {
        out.write(read(7).toString().padLeft(2, '0'));
      } else if (n == 1) {
        out.write(read(4).toString());
      }
    } else if (mode == 2) {
      flush();
      var n = read(cc(9, 11, 13));
      while (n >= 2) {
        if (pos + 11 > total) return null;
        final v = read(11);
        out.write(_alnum[v ~/ 45]);
        out.write(_alnum[v % 45]);
        n -= 2;
      }
      if (n == 1) out.write(_alnum[read(6)]);
    } else if (mode == 4) {
      final n = read(cc(8, 16, 16));
      if (pos + n * 8 > total) return null;
      for (var i = 0; i < n; i++) {
        bytes.add(read(8));
      }
    } else if (mode == 7) {
      final f = read(8);
      if ((f & 0x80) == 0) {
        // one-byte ECI designator
      } else if ((f & 0xc0) == 0x80) {
        read(8);
      } else {
        read(16);
      }
    } else if (mode == 8) {
      flush();
      var n = read(cc(8, 10, 12));
      while (n-- > 0) {
        read(13);
        out.write('?');
      }
    } else if (mode == 3) {
      read(16);
    } else if (mode == 5) {
      read(8);
    } else {
      break;
    }
  }
  flush();
  return out.toString();
}

class _Bits {
  final int w, h;
  final Uint8List bits;
  _Bits(this.w, this.h, this.bits);
  bool get(int x, int y) => bits[y * w + x] == 1;
}

_Bits _binarize(Uint8List lumIn, int w, int h, bool invert, bool smooth) {
  var lum = lumIn;
  if (smooth) {
    final t = Uint16List(w * h);
    final o = Uint8List(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        final i = y * w + x;
        t[i] = lum[i] + (x > 0 ? lum[i - 1] : lum[i]) + (x < w - 1 ? lum[i + 1] : lum[i]);
      }
    }
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        final i = y * w + x;
        o[i] = (t[i] + (y > 0 ? t[i - w] : t[i]) + (y < h - 1 ? t[i + w] : t[i])) ~/ 9;
      }
    }
    lum = o;
  }
  const bsz = 8;
  final bw = (w + bsz - 1) ~/ bsz;
  final bh = (h + bsz - 1) ~/ bsz;
  final bp = Float32List(bw * bh);
  for (var by = 0; by < bh; by++) {
    for (var bx = 0; bx < bw; bx++) {
      var mn = 255, mx = 0, sum = 0, cnt = 0;
      final yEnd = math.min(h, by * bsz + bsz);
      final xEnd = math.min(w, bx * bsz + bsz);
      for (var y = by * bsz; y < yEnd; y++) {
        for (var x = bx * bsz; x < xEnd; x++) {
          final v = lum[y * w + x];
          sum += v;
          cnt++;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      var avg = sum / cnt;
      if (mx - mn <= 24) {
        avg = mn / 2;
        if (by > 0 && bx > 0) {
          final nb = (bp[(by - 1) * bw + bx] + 2 * bp[by * bw + bx - 1] + bp[(by - 1) * bw + bx - 1]) / 4;
          if (mn < nb) avg = nb;
        }
      }
      bp[by * bw + bx] = avg;
    }
  }
  final bits = Uint8List(w * h);
  for (var by = 0; by < bh; by++) {
    for (var bx = 0; bx < bw; bx++) {
      var sum = 0.0;
      var cnt = 0;
      for (var yy = math.max(0, by - 2); yy <= math.min(bh - 1, by + 2); yy++) {
        for (var xx = math.max(0, bx - 2); xx <= math.min(bw - 1, bx + 2); xx++) {
          sum += bp[yy * bw + xx];
          cnt++;
        }
      }
      final t = sum / cnt;
      final yEnd = math.min(h, by * bsz + bsz);
      final xEnd = math.min(w, bx * bsz + bsz);
      for (var y = by * bsz; y < yEnd; y++) {
        for (var x = bx * bsz; x < xEnd; x++) {
          final black = lum[y * w + x] <= t;
          bits[y * w + x] = (black != invert) ? 1 : 0;
        }
      }
    }
  }
  return _Bits(w, h, bits);
}

bool _ratioOK(List<int> s) {
  final tot = s[0] + s[1] + s[2] + s[3] + s[4];
  if (tot < 7) return false;
  final ms = tot / 7;
  final mv = ms / 1.6;
  return (ms - s[0]).abs() < mv &&
      (ms - s[1]).abs() < mv &&
      (3 * ms - s[2]).abs() < 3 * mv &&
      (ms - s[3]).abs() < mv &&
      (ms - s[4]).abs() < mv;
}

double _crossCheck(_Bits img, int cx, int cy, int dx, int dy, int maxCount, int origTotal) {
  final s = <int>[0, 0, 0, 0, 0];
  final ww = img.w, hh = img.h;
  bool inb(int x, int y) => x >= 0 && y >= 0 && x < ww && y < hh;
  var x = cx, y = cy;
  while (inb(x, y) && img.get(x, y)) {
    s[2]++;
    x -= dx;
    y -= dy;
  }
  if (!inb(x, y)) return double.nan;
  while (inb(x, y) && !img.get(x, y) && s[1] <= maxCount) {
    s[1]++;
    x -= dx;
    y -= dy;
  }
  if (!inb(x, y) || s[1] > maxCount) return double.nan;
  while (inb(x, y) && img.get(x, y) && s[0] <= maxCount) {
    s[0]++;
    x -= dx;
    y -= dy;
  }
  if (s[0] > maxCount) return double.nan;
  x = cx + dx;
  y = cy + dy;
  while (inb(x, y) && img.get(x, y)) {
    s[2]++;
    x += dx;
    y += dy;
  }
  if (!inb(x, y)) return double.nan;
  while (inb(x, y) && !img.get(x, y) && s[3] < maxCount) {
    s[3]++;
    x += dx;
    y += dy;
  }
  if (!inb(x, y) || s[3] >= maxCount) return double.nan;
  while (inb(x, y) && img.get(x, y) && s[4] < maxCount) {
    s[4]++;
    x += dx;
    y += dy;
  }
  if (s[4] >= maxCount) return double.nan;
  final tot = s[0] + s[1] + s[2] + s[3] + s[4];
  if (5 * (tot - origTotal).abs() >= 2 * origTotal || !_ratioOK(s)) return double.nan;
  final end = dx != 0 ? x : y;
  return end - s[4] - s[3] - s[2] / 2;
}

class _Center {
  double x, y, ms;
  int n;
  _Center(this.x, this.y, this.ms, this.n);
}

List<_Center> _findFinders(_Bits img) {
  final ww = img.w, hh = img.h;
  final centers = <_Center>[];
  final step = math.max(1, (3 * hh) ~/ (4 * 97));
  bool handle(List<int> s, int row, int endX) {
    final tot = s[0] + s[1] + s[2] + s[3] + s[4];
    var cx = endX - s[4] - s[3] - s[2] / 2;
    final cy = _crossCheck(img, cx.floor(), row, 0, 1, s[2], tot);
    if (cy.isNaN) return false;
    final cx2 = _crossCheck(img, cx.floor(), cy.floor(), 1, 0, s[2], tot);
    if (cx2.isNaN) return false;
    cx = cx2;
    final ms = tot / 7;
    for (final c in centers) {
      if ((cy - c.y).abs() <= ms && (cx - c.x).abs() <= ms && ((ms - c.ms).abs() <= 1 || (ms - c.ms).abs() <= c.ms)) {
        final n = c.n + 1;
        c.x = (c.x * c.n + cx) / n;
        c.y = (c.y * c.n + cy) / n;
        c.ms = (c.ms * c.n + ms) / n;
        c.n = n;
        return true;
      }
    }
    centers.add(_Center(cx, cy, ms, 1));
    return true;
  }

  for (var y = step - 1; y < hh; y += step) {
    final s = <int>[0, 0, 0, 0, 0];
    var cur = 0;
    for (var x = 0; x < ww; x++) {
      if (img.get(x, y)) {
        if (cur & 1 != 0) cur++;
        s[cur]++;
      } else if (cur & 1 == 0) {
        if (cur == 4) {
          if (_ratioOK(s) && handle(s, y, x)) {
            for (var i = 0; i < 5; i++) {
              s[i] = 0;
            }
            cur = 0;
          } else {
            s[0] = s[2];
            s[1] = s[3];
            s[2] = s[4];
            s[3] = 1;
            s[4] = 0;
            cur = 3;
          }
        } else {
          cur++;
          s[cur]++;
        }
      } else {
        s[cur]++;
      }
    }
    if (_ratioOK(s)) handle(s, y, ww);
  }
  return centers;
}

double _dist(_Center a, _Center b) => math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

class _Triple {
  final double score, ms;
  final _Center tl, tr, bl;
  _Triple(this.score, this.tl, this.tr, this.bl, this.ms);
}

List<_Triple> _bestTriples(List<_Center> centers) {
  final cand = List<_Center>.from(centers)..sort((a, b) => b.n - a.n);
  final top = cand.take(14).toList();
  final out = <_Triple>[];
  for (var i = 0; i < top.length; i++) {
    for (var j = i + 1; j < top.length; j++) {
      for (var k = j + 1; k < top.length; k++) {
        final p = [top[i], top[j], top[k]];
        final mss = p.map((e) => e.ms).toList();
        final mx = mss.reduce(math.max);
        final mn = mss.reduce(math.min);
        if (mx > mn * 1.6) continue;
        final d = <List<double>>[
          [_dist(p[0], p[1]), 2],
          [_dist(p[0], p[2]), 1],
          [_dist(p[1], p[2]), 0],
        ]..sort((a, b) => a[0].compareTo(b[0]));
        final a = d[0][0], b = d[1][0], c = d[2][0];
        final msAvg = (mss[0] + mss[1] + mss[2]) / 3;
        if (a < msAvg * 10) continue;
        final score =
            (c * c - (a * a + b * b)).abs() / (c * c) +
            (a - b).abs() / b +
            ((mx - mn) / mx) * 0.5 -
            math.min(p[0].n, math.min(p[1].n, p[2].n)) * 0.002;
        if (score > 0.6) continue;
        final ti = d[2][1].toInt();
        final tl = p[ti];
        var aa = p[(ti + 1) % 3];
        var cc = p[(ti + 2) % 3];
        if ((cc.x - tl.x) * (aa.y - tl.y) - (cc.y - tl.y) * (aa.x - tl.x) < 0) {
          final t = aa;
          aa = cc;
          cc = t;
        }
        out.add(_Triple(score, tl, cc, aa, msAvg));
      }
    }
  }
  out.sort((x, y) => x.score.compareTo(y.score));
  return out.take(4).toList();
}

typedef _M3 = List<List<double>>;

_M3 _sq2quad(double x0, double y0, double x1, double y1, double x2, double y2, double x3, double y3) {
  final dx3 = x0 - x1 + x2 - x3;
  final dy3 = y0 - y1 + y2 - y3;
  if (dx3.abs() < 1e-9 && dy3.abs() < 1e-9) {
    return [
      [x1 - x0, x3 - x0, x0],
      [y1 - y0, y3 - y0, y0],
      [0, 0, 1],
    ];
  }
  final dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  final den = dx1 * dy2 - dx2 * dy1;
  final a13 = (dx3 * dy2 - dx2 * dy3) / den;
  final a23 = (dx1 * dy3 - dx3 * dy1) / den;
  return [
    [x1 - x0 + a13 * x1, x3 - x0 + a23 * x3, x0],
    [y1 - y0 + a13 * y1, y3 - y0 + a23 * y3, y0],
    [a13, a23, 1],
  ];
}

_M3 _adj(_M3 m) {
  final a = m[0][0], b = m[0][1], c = m[0][2];
  final d = m[1][0], e = m[1][1], f = m[1][2];
  final g = m[2][0], h = m[2][1], i = m[2][2];
  return [
    [e * i - f * h, c * h - b * i, b * f - c * e],
    [f * g - d * i, a * i - c * g, c * d - a * f],
    [d * h - e * g, b * g - a * h, a * e - b * d],
  ];
}

_M3 _mm(_M3 a, _M3 b) {
  final r = List<List<double>>.generate(3, (_) => List<double>.filled(3, 0));
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      for (var k = 0; k < 3; k++) {
        r[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return r;
}

_M3 _quad2quad(List<double> s, List<double> d) => _mm(
  _sq2quad(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7]),
  _adj(_sq2quad(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7])),
);

class _Pt {
  final double x, y;
  _Pt(this.x, this.y);
}

_Pt? _findAlignment(_Bits img, _Triple t, int dim) {
  final n = dim - 7;
  final uxx = (t.tr.x - t.tl.x) / n, uxy = (t.tr.y - t.tl.y) / n;
  final uyx = (t.bl.x - t.tl.x) / n, uyy = (t.bl.y - t.tl.y) / n;
  final brx = t.tr.x - t.tl.x + t.bl.x, bry = t.tr.y - t.tl.y + t.bl.y;
  final corr = 1 - 3 / n;
  final ex = t.tl.x + corr * (brx - t.tl.x), ey = t.tl.y + corr * (bry - t.tl.y);
  final ms = math.sqrt(uxx * uxx + uxy * uxy);
  final stp = math.max(1.0, ms / 3);
  int score(double cx, double cy) {
    var sc = 0;
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        final px = (cx + dx * uxx + dy * uyx).round();
        final py = (cy + dx * uxy + dy * uyy).round();
        if (px < 0 || py < 0 || px >= img.w || py >= img.h) return -1;
        if (img.get(px, py) == (math.max(dx.abs(), dy.abs()) != 1)) sc++;
      }
    }
    return sc;
  }

  for (final allow in [4, 8, 14]) {
    final r = allow * ms;
    var best = -1;
    var bx = 0.0, by = 0.0;
    for (var y = ey - r; y <= ey + r; y += stp) {
      for (var x = ex - r; x <= ex + r; x += stp) {
        final s = score(x, y);
        if (s > best) {
          best = s;
          bx = x;
          by = y;
        }
      }
    }
    if (best >= 22) return _Pt(bx, by);
  }
  return null;
}

Uint8List? _sampleGrid(_Bits img, _Triple t, int dim, _Pt? al) {
  final d3 = dim - 3.5;
  List<double> src, dst;
  if (al != null) {
    src = [3.5, 3.5, d3, 3.5, d3 - 3, d3 - 3, 3.5, d3];
    dst = [t.tl.x, t.tl.y, t.tr.x, t.tr.y, al.x, al.y, t.bl.x, t.bl.y];
  } else {
    src = [3.5, 3.5, d3, 3.5, d3, d3, 3.5, d3];
    dst = [t.tl.x, t.tl.y, t.tr.x, t.tr.y, t.tr.x - t.tl.x + t.bl.x, t.tr.y - t.tl.y + t.bl.y, t.bl.x, t.bl.y];
  }
  final m = _quad2quad(src, dst);
  final bits = Uint8List(dim * dim);
  for (var y = 0; y < dim; y++) {
    for (var x = 0; x < dim; x++) {
      final xx = x + 0.5, yy = y + 0.5;
      final w = m[2][0] * xx + m[2][1] * yy + m[2][2];
      var px = ((m[0][0] * xx + m[0][1] * yy + m[0][2]) / w).floor();
      var py = ((m[1][0] * xx + m[1][1] * yy + m[1][2]) / w).floor();
      if (px < -1 || py < -1 || px > img.w || py > img.h) return null;
      px = math.min(img.w - 1, math.max(0, px));
      py = math.min(img.h - 1, math.max(0, py));
      bits[y * dim + x] = img.bits[py * img.w + px];
    }
  }
  return bits;
}

double _runLen(_Bits img, double fx, double fy, double ux, double uy, double maxL) {
  var state = 0;
  for (var i = 0; i < maxL; i++) {
    final x = (fx + ux * i).round();
    final y = (fy + uy * i).round();
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return state == 2 ? i.toDouble() : double.nan;
    final black = img.get(x, y);
    if (state == 0 && !black) {
      state = 1;
    } else if (state == 1 && black) {
      state = 2;
    } else if (state == 2 && !black) {
      return i.toDouble();
    }
  }
  return double.nan;
}

double _moduleAlong(_Bits img, _Center a, _Center b, double guess) {
  final l = _dist(a, b);
  final ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
  final lim = guess * 8;
  final v = <double>[
    _runLen(img, a.x, a.y, ux, uy, lim) + _runLen(img, a.x, a.y, -ux, -uy, lim),
    _runLen(img, b.x, b.y, -ux, -uy, lim) + _runLen(img, b.x, b.y, ux, uy, lim),
  ].where((x) => !x.isNaN).map((x) => x / 7).toList();
  return v.isEmpty ? guess : v.reduce((p, c) => p + c) / v.length;
}

String? _tryTriple(_Bits img, _Triple t) {
  final msX = _moduleAlong(img, t.tl, t.tr, t.ms);
  final msY = _moduleAlong(img, t.tl, t.bl, t.ms);
  final est = ((_dist(t.tl, t.tr) / msX + _dist(t.tl, t.bl) / msY) / 2).round() + 7;
  final base = <int>[];
  final r = est & 3;
  if (r == 1) {
    base.add(est);
  } else if (r == 0) {
    base.addAll([est + 1, est - 3]);
  } else if (r == 2) {
    base.addAll([est - 1, est + 3]);
  } else {
    base.addAll([est - 2, est + 2]);
  }
  final dims = <int>[];
  for (final b in base) {
    for (final dd in [0, 4, -4]) {
      final v = b + dd;
      if (v >= 21 && v <= 177 && !dims.contains(v)) dims.add(v);
    }
  }
  final seen = <int>{};
  for (var i = 0; i < dims.length && i < 8; i++) {
    final dim = dims[i];
    if (seen.contains(dim)) continue;
    seen.add(dim);
    final al = dim > 21 ? _findAlignment(img, t, dim) : null;
    final options = al != null ? <_Pt?>[al, null] : <_Pt?>[null];
    var retried = false;
    for (final a in options) {
      final bits = _sampleGrid(img, t, dim, a);
      if (bits == null) continue;
      var res = _decodeMatrix((x, y) => bits[y * dim + x] == 1, dim);
      if (res.retry != null && !seen.contains(res.retry)) {
        dims.insert(i + 1, res.retry!);
        retried = true;
        break;
      }
      if (res.text != null) return res.text;
      res = _decodeMatrix((x, y) => bits[x * dim + y] == 1, dim);
      if (res.text != null) return res.text;
    }
    if (retried) continue;
  }
  return null;
}

String? _attempt(Uint8List lum, int w, int h, bool smooth) {
  for (final inv in [false, true]) {
    final img = _binarize(lum, w, h, inv, smooth);
    final centers = _findFinders(img);
    if (centers.length < 3) continue;
    for (final t in _bestTriples(centers)) {
      final r = _tryTriple(img, t);
      if (r != null) return r;
    }
  }
  return null;
}

/// Decodes a QR code from a grayscale image (width × height bytes). Returns null if none found.
/// [fast] skips the slower 2× upscale pass (use it for live camera frames).
String? decodeQrLuminance(Uint8List lum, int width, int height, {bool fast = true}) {
  _initGf();
  if (width <= 0 || height <= 0 || lum.length < width * height) return null;
  var r = _attempt(lum, width, height, false);
  if (r != null) return r;
  r = _attempt(lum, width, height, true);
  if (r != null || fast) return r;
  return null;
}
