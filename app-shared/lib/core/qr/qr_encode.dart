// Self-contained QR Code generator (byte mode, level M, versions 1–40) – Dart port of qr-encoder.js.

import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';

const List<int> _ecc = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, //
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const List<int> _nb = [
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
  33, //
  35, 37, 38, 40, 43, 45, 47, 49,
];

final List<int> _exp = List<int>.filled(512, 0);
final List<int> _log = List<int>.filled(256, 0);
bool _ready = false;

void _init() {
  if (_ready) return;
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
  _ready = true;
}

int _mul(int a, int b) => (a != 0 && b != 0) ? _exp[_log[a] + _log[b]] : 0;

List<int> _rsDivisor(int deg) {
  final r = List<int>.filled(deg, 0);
  r[deg - 1] = 1;
  var root = 1;
  for (var i = 0; i < deg; i++) {
    for (var j = 0; j < r.length; j++) {
      r[j] = _mul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = _mul(root, 2);
  }
  return r;
}

List<int> _rsRem(List<int> data, List<int> div) {
  var r = List<int>.filled(div.length, 0);
  for (final b in data) {
    final f = b ^ r.first;
    r = [...r.sublist(1), 0];
    for (var i = 0; i < div.length; i++) {
      r[i] ^= _mul(div[i], f);
    }
  }
  return r;
}

int _rawModules(int v) {
  var r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    final n = v ~/ 7 + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}

int _dataCodewords(int v) => _rawModules(v) ~/ 8 - _ecc[v] * _nb[v];

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

bool _bit(int x, int i) => ((x >> i) & 1) != 0;

bool _maskFn(int m, int x, int y) {
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

/// A generated QR code: [size] × [size] modules, true = dark.
class QrMatrix {
  final int size;
  final List<List<bool>> modules;
  QrMatrix(this.size, this.modules);
  bool get(int x, int y) => x >= 0 && y >= 0 && x < size && y < size && modules[y][x];
}

QrMatrix encodeQr(String text) {
  _init();
  final bytes = utf8.encode(text);
  var ver = 1;
  for (; ver <= 40; ver++) {
    final cc = ver <= 9 ? 8 : 16;
    if (4 + cc + bytes.length * 8 <= _dataCodewords(ver) * 8) break;
  }
  if (ver > 40) throw ArgumentError('Text too long for a QR code');
  final cap = _dataCodewords(ver) * 8;
  final bb = <int>[];
  void put(int val, int len) {
    for (var i = len - 1; i >= 0; i--) {
      bb.add((val >> i) & 1);
    }
  }

  put(4, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (final b in bytes) {
    put(b, 8);
  }
  put(0, math.min(4, cap - bb.length));
  put(0, (8 - (bb.length % 8)) % 8);
  for (var p = 0xec; bb.length < cap; p ^= 0xec ^ 0x11) {
    put(p, 8);
  }
  final data = <int>[];
  for (var i = 0; i < bb.length; i += 8) {
    var v = 0;
    for (var j = 0; j < 8; j++) {
      v = (v << 1) | bb[i + j];
    }
    data.add(v);
  }

  final nb = _nb[ver];
  final el = _ecc[ver];
  final raw = _rawModules(ver) ~/ 8;
  final nShort = nb - (raw % nb);
  final shortLen = raw ~/ nb;
  final div = _rsDivisor(el);
  final blocks = <List<int>>[];
  var k = 0;
  for (var i = 0; i < nb; i++) {
    final len = shortLen - el + (i < nShort ? 0 : 1);
    final dat = data.sublist(k, k + len);
    k += len;
    final ecc = _rsRem(dat, div);
    final blk = <int>[...dat];
    if (i < nShort) blk.add(0);
    blk.addAll(ecc);
    blocks.add(blk);
  }
  final cw = <int>[];
  for (var i = 0; i < blocks[0].length; i++) {
    for (var j = 0; j < blocks.length; j++) {
      if (i != shortLen - el || j >= nShort) cw.add(blocks[j][i]);
    }
  }

  final size = ver * 4 + 17;
  final mod = List<List<bool>>.generate(size, (_) => List<bool>.filled(size, false));
  final fn = List<List<bool>>.generate(size, (_) => List<bool>.filled(size, false));
  void setF(int x, int y, bool d) {
    mod[y][x] = d;
    fn[y][x] = true;
  }

  for (var i = 0; i < size; i++) {
    setF(6, i, i % 2 == 0);
    setF(i, 6, i % 2 == 0);
  }
  void finder(int cx, int cy) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        final d = math.max(dx.abs(), dy.abs());
        final x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d != 2 && d != 4);
      }
    }
  }

  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  final ap = _alignPos(ver);
  final na = ap.length;
  for (var i = 0; i < na; i++) {
    for (var j = 0; j < na; j++) {
      if ((i == 0 && j == 0) || (i == 0 && j == na - 1) || (i == na - 1 && j == 0)) continue;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          setF(ap[i] + dx, ap[j] + dy, math.max(dx.abs(), dy.abs()) != 1);
        }
      }
    }
  }
  void drawFormat(int mask) {
    final d = mask; // level M = 00
    var r = d;
    for (var i = 0; i < 10; i++) {
      r = (r << 1) ^ ((r >> 9) * 0x537);
    }
    final bits = ((d << 10) | r) ^ 0x5412;
    for (var i = 0; i <= 5; i++) {
      setF(8, i, _bit(bits, i));
    }
    setF(8, 7, _bit(bits, 6));
    setF(8, 8, _bit(bits, 7));
    setF(7, 8, _bit(bits, 8));
    for (var i = 9; i < 15; i++) {
      setF(14 - i, 8, _bit(bits, i));
    }
    for (var i = 0; i < 8; i++) {
      setF(size - 1 - i, 8, _bit(bits, i));
    }
    for (var i = 8; i < 15; i++) {
      setF(8, size - 15 + i, _bit(bits, i));
    }
    setF(8, size - 8, true);
  }

  drawFormat(0);
  if (ver >= 7) {
    var r = ver;
    for (var i = 0; i < 12; i++) {
      r = (r << 1) ^ ((r >> 11) * 0x1f25);
    }
    final bits = (ver << 12) | r;
    for (var i = 0; i < 18; i++) {
      final b = _bit(bits, i);
      final a = size - 11 + (i % 3);
      final c = i ~/ 3;
      setF(a, c, b);
      setF(c, a, b);
    }
  }
  var bi = 0;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right == 6) right = 5;
    for (var vert = 0; vert < size; vert++) {
      for (var j = 0; j < 2; j++) {
        final x = right - j;
        final up = ((right + 1) & 2) == 0;
        final y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && bi < cw.length * 8) {
          mod[y][x] = _bit(cw[bi >> 3], 7 - (bi & 7));
          bi++;
        }
      }
    }
  }
  void applyMask(int m) {
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (!fn[y][x] && _maskFn(m, x, y)) mod[y][x] = !mod[y][x];
      }
    }
  }

  int penalty() {
    var p = 0, dark = 0;
    for (var a = 0; a < 2; a++) {
      for (var u = 0; u < size; u++) {
        var run = 1;
        for (var v = 1; v <= size; v++) {
          final bool? cur = v < size ? (a == 1 ? mod[v][u] : mod[u][v]) : null;
          final prev = a == 1 ? mod[v - 1][u] : mod[u][v - 1];
          if (cur == prev) {
            run++;
          } else {
            if (run >= 5) p += run - 2;
            run = 1;
          }
        }
      }
    }
    for (var y = 0; y < size - 1; y++) {
      for (var x = 0; x < size - 1; x++) {
        final c = mod[y][x];
        if (c == mod[y][x + 1] && c == mod[y + 1][x] && c == mod[y + 1][x + 1]) p += 3;
      }
    }
    for (var a = 0; a < 2; a++) {
      for (var u = 0; u < size; u++) {
        final sb = StringBuffer('0000');
        for (var v = 0; v < size; v++) {
          sb.write((a == 1 ? mod[v][u] : mod[u][v]) ? '1' : '0');
        }
        sb.write('0000');
        final s = sb.toString();
        for (var kk = s.indexOf('1011101'); kk >= 0; kk = s.indexOf('1011101', kk + 1)) {
          if (kk >= 4 && s.substring(kk - 4, kk) == '0000') p += 40;
          if (kk + 11 <= s.length && s.substring(kk + 7, kk + 11) == '0000') p += 40;
        }
      }
    }
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
      }
    }
    p += ((dark * 20 - size * size * 10).abs() ~/ (size * size)) * 10;
    return p;
  }

  var best = 0;
  var bestP = 1 << 30;
  for (var m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    final pp = penalty();
    if (pp < bestP) {
      bestP = pp;
      best = m;
    }
    applyMask(m);
  }
  applyMask(best);
  drawFormat(best);
  return QrMatrix(size, mod);
}

/// Draws a QR code. [margin] is in modules (quiet zone).
class QrView extends StatelessWidget {
  final String data;
  final double size;
  final Color color;
  final Color background;
  final int margin;
  const QrView({
    super.key,
    required this.data,
    this.size = 200,
    this.color = const Color(0xFF15111C),
    this.background = const Color(0xFFFFFFFF),
    this.margin = 2,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(size: Size.square(size), painter: _QrPainter(encodeQr(data), color, background, margin));
  }
}

class _QrPainter extends CustomPainter {
  final QrMatrix qr;
  final Color color, background;
  final int margin;
  _QrPainter(this.qr, this.color, this.background, this.margin);

  @override
  void paint(Canvas canvas, Size size) {
    final total = qr.size + margin * 2;
    final px = size.width / total;
    canvas.drawRect(Offset.zero & size, Paint()..color = background);
    final paint = Paint()
      ..color = color
      ..isAntiAlias = false;
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) {
          canvas.drawRect(Rect.fromLTWH((x + margin) * px, (y + margin) * px, px + 0.5, px + 0.5), paint);
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant _QrPainter old) => old.qr != qr || old.color != color;
}
