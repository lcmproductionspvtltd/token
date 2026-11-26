// The web app's own stroked icon set, drawn with a tiny SVG path renderer (no icon font).

import 'package:flutter/widgets.dart';

import 'icon_data.dart';

final Map<String, Path> _cache = {};

class AppIcon extends StatelessWidget {
  final String name;
  final double size;
  final Color? color;
  final double stroke;

  /// Also fill the shape (e.g. a solid star).
  final bool fill;
  const AppIcon(this.name, {super.key, this.size = 22, this.color, this.stroke = 1.8, this.fill = false});

  @override
  Widget build(BuildContext context) {
    final c = color ?? DefaultTextStyle.of(context).style.color ?? const Color(0xFF221C2B);
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _IconPainter(name, c, stroke, fill)),
    );
  }
}

class _IconPainter extends CustomPainter {
  final String name;
  final Color color;
  final double stroke;
  final bool fill;
  _IconPainter(this.name, this.color, this.stroke, this.fill);

  @override
  void paint(Canvas canvas, Size size) {
    final path = _cache.putIfAbsent(name, () => _buildIcon(name));
    final s = size.width / 24;
    canvas.save();
    canvas.scale(s, s);
    if (fill) {
      canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.fill
          ..isAntiAlias = true,
      );
    }
    if (stroke > 0)
      canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round
          ..isAntiAlias = true,
      );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _IconPainter old) =>
      old.name != name || old.color != color || old.stroke != stroke || old.fill != fill;
}

Path _buildIcon(String name) {
  final shapes = kIconShapes[name] ?? const <String>[];
  final out = Path();
  for (final sh in shapes) {
    final kind = sh[0];
    final body = sh.substring(1);
    if (kind == 'P') {
      out.addPath(parseSvgPath(body), Offset.zero);
    } else if (kind == 'C') {
      final v = body.split(',').map(double.parse).toList();
      out.addOval(Rect.fromCircle(center: Offset(v[0], v[1]), radius: v[2]));
    } else if (kind == 'R') {
      final v = body.split(',').map(double.parse).toList();
      final rect = Rect.fromLTWH(v[0], v[1], v[2], v[3]);
      if (v[4] > 0) {
        out.addRRect(RRect.fromRectAndRadius(rect, Radius.circular(v[4])));
      } else {
        out.addRect(rect);
      }
    }
  }
  return out;
}

/// Minimal SVG path-data parser: M L H V C S Q T A Z (absolute and relative).
Path parseSvgPath(String d) {
  final path = Path();
  final tokens = RegExp(r'[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')
      .allMatches(d)
      .map((m) => m.group(0)!)
      .toList();
  var i = 0;
  var cmd = '';
  var cx = 0.0, cy = 0.0, sx = 0.0, sy = 0.0;
  double? lcx, lcy; // last control point (for S/T)
  String prev = '';
  bool isCmd(String t) => RegExp(r'^[A-Za-z]$').hasMatch(t);
  double num() => double.parse(tokens[i++]);
  int flag() {
    // Arc flags may be packed without separators ("a1 1 0 01..."); handle single digits.
    final t = tokens[i];
    if (t.length > 1 && (t.startsWith('0') || t.startsWith('1')) && !t.contains('.')) {
      tokens[i] = t.substring(1);
      return t[0] == '1' ? 1 : 0;
    }
    i++;
    return double.parse(t) != 0 ? 1 : 0;
  }

  while (i < tokens.length) {
    if (isCmd(tokens[i])) {
      cmd = tokens[i++];
    } else if (cmd == 'M') {
      cmd = 'L';
    } else if (cmd == 'm') {
      cmd = 'l';
    }
    final rel = cmd == cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M':
        var x = num(), y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        path.moveTo(x, y);
        cx = sx = x;
        cy = sy = y;
        lcx = lcy = null;
        break;
      case 'L':
        var x = num(), y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        path.lineTo(x, y);
        cx = x;
        cy = y;
        lcx = lcy = null;
        break;
      case 'H':
        var x = num();
        if (rel) x += cx;
        path.lineTo(x, cy);
        cx = x;
        lcx = lcy = null;
        break;
      case 'V':
        var y = num();
        if (rel) y += cy;
        path.lineTo(cx, y);
        cy = y;
        lcx = lcy = null;
        break;
      case 'C':
        var x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
        if (rel) {
          x1 += cx;
          y1 += cy;
          x2 += cx;
          y2 += cy;
          x += cx;
          y += cy;
        }
        path.cubicTo(x1, y1, x2, y2, x, y);
        lcx = x2;
        lcy = y2;
        cx = x;
        cy = y;
        break;
      case 'S':
        var x2 = num(), y2 = num(), x = num(), y = num();
        if (rel) {
          x2 += cx;
          y2 += cy;
          x += cx;
          y += cy;
        }
        final reflect = (prev == 'C' || prev == 'S') && lcx != null;
        final x1 = reflect ? 2 * cx - lcx : cx;
        final y1 = reflect ? 2 * cy - lcy! : cy;
        path.cubicTo(x1, y1, x2, y2, x, y);
        lcx = x2;
        lcy = y2;
        cx = x;
        cy = y;
        break;
      case 'Q':
        var x1 = num(), y1 = num(), x = num(), y = num();
        if (rel) {
          x1 += cx;
          y1 += cy;
          x += cx;
          y += cy;
        }
        path.quadraticBezierTo(x1, y1, x, y);
        lcx = x1;
        lcy = y1;
        cx = x;
        cy = y;
        break;
      case 'T':
        var x = num(), y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        final reflect = (prev == 'Q' || prev == 'T') && lcx != null;
        final x1 = reflect ? 2 * cx - lcx : cx;
        final y1 = reflect ? 2 * cy - lcy! : cy;
        path.quadraticBezierTo(x1, y1, x, y);
        lcx = x1;
        lcy = y1;
        cx = x;
        cy = y;
        break;
      case 'A':
        final rx = num(), ry = num(), rot = num();
        final large = flag(), sweep = flag();
        var x = num(), y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        if (rx == 0 || ry == 0) {
          path.lineTo(x, y);
        } else {
          path.arcToPoint(
            Offset(x, y),
            radius: Radius.elliptical(rx.abs(), ry.abs()),
            rotation: rot,
            largeArc: large == 1,
            clockwise: sweep == 1,
          );
        }
        cx = x;
        cy = y;
        lcx = lcy = null;
        break;
      case 'Z':
        path.close();
        cx = sx;
        cy = sy;
        lcx = lcy = null;
        break;
      default:
        i++;
    }
    prev = cmd.toUpperCase();
  }
  return path;
}
