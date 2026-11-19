// Pills, network images, avatars and business marks.
// Part of the shared widgets – apps import them all through ui/widgets.dart.

import 'dart:convert';

import 'package:material_ui/material_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../icons.dart';
import '../theme.dart';

/* ---------- pills, avatars, marks ---------- */

class Pill extends StatelessWidget {
  final String text;
  final Color bg;
  final Color fg;
  final bool dot;
  final String? icon;
  const Pill(this.text, {super.key, required this.bg, required this.fg, this.dot = false, this.icon});

  factory Pill.status(String status, {Key? key}) {
    switch (status) {
      case 'waiting':
        return Pill(kStatusText[status]!, key: key, bg: Tk.waitBg, fg: Tk.waitFg, dot: true);
      case 'serving':
      case 'in_progress':
        return Pill('In service', key: key, bg: Tk.serveBg, fg: Tk.serveFg, dot: true);
      case 'done':
        return Pill('Completed', key: key, bg: Tk.doneBg, fg: Tk.doneFg, dot: true);
      case 'cancelled':
      case 'removed':
        return Pill(kStatusText[status] ?? status, key: key, bg: Tk.badBg, fg: Tk.badFg, dot: true);
      default:
        return Pill(kStatusText[status] ?? status, key: key, bg: Tk.offBg, fg: Tk.offFg, dot: true);
    }
  }

  factory Pill.on(String text) => Pill(text, bg: Tk.doneBg, fg: Tk.doneFg, dot: true);
  factory Pill.off(String text) => Pill(text, bg: Tk.offBg, fg: Tk.offFg, dot: true);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4.5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot)
            Container(
              width: 6,
              height: 6,
              margin: const EdgeInsets.only(right: 5),
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
            ),
          if (icon != null)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: AppIcon(icon!, size: 12, color: fg, stroke: 2.2),
            ),
          Text(
            text,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg),
          ),
        ],
      ),
    );
  }
}

/// Image from the server (or a data: URL from the picker), with a fallback widget.
class NetImage extends StatelessWidget {
  final String src;
  final double? width, height;
  final BoxFit fit;
  final Widget fallback;
  const NetImage(this.src, {super.key, this.width, this.height, this.fit = BoxFit.cover, required this.fallback});

  @override
  Widget build(BuildContext context) {
    if (src.isEmpty || src.toLowerCase().endsWith('.svg')) return fallback;
    if (src.startsWith('data:')) {
      final comma = src.indexOf(',');
      try {
        return Image.memory(
          base64Decode(src.substring(comma + 1)),
          width: width,
          height: height,
          fit: fit,
          errorBuilder: (_, __, ___) => fallback,
        );
      } catch (_) {
        return fallback;
      }
    }
    return Image.network(
      serverApi.url(src),
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (_, __, ___) => fallback,
    );
  }
}

class Avatar extends StatelessWidget {
  final String name;
  final String photo;
  final double size;
  const Avatar(this.name, {super.key, this.photo = '', this.size = 40});

  static const _hues = [292.0, 330.0, 268.0, 200.0, 28.0, 160.0, 248.0, 350.0];

  @override
  Widget build(BuildContext context) {
    final h = _hues[name.codeUnits.fold<int>(0, (a, c) => (a * 31 + c) & 0x7fffffff) % _hues.length];
    final bg = HSLColor.fromAHSL(1, h, 0.6, 0.93).toColor();
    final fg = HSLColor.fromAHSL(1, h, 0.45, 0.35).toColor();
    final fallback = Container(
      color: bg,
      alignment: Alignment.center,
      child: Text(
        initials(name),
        style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: size * 0.36),
      ),
    );
    return ClipOval(
      child: SizedBox(
        width: size,
        height: size,
        child: NetImage(photo, width: size, height: size, fallback: fallback),
      ),
    );
  }
}

/// Business logo, or a ticket mark on the brand colour.
class BizMark extends StatelessWidget {
  final String logo;
  final Color color;
  final double size;
  final bool onDark;
  const BizMark({super.key, this.logo = '', required this.color, this.size = 44, this.onDark = false});

  @override
  Widget build(BuildContext context) {
    final b = Brand(color);
    final mark = Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [b.c, b.deep]),
      ),
      alignment: Alignment.center,
      child: AppIcon('ticket', size: size * 0.5, color: Colors.white, stroke: 2),
    );
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.28),
        border: onDark ? Border.all(color: fade(Colors.white, 0.25), width: 1.5) : null,
        color: Colors.white,
      ),
      clipBehavior: Clip.antiAlias,
      child: NetImage(logo, width: size, height: size, fit: BoxFit.contain, fallback: mark),
    );
  }
}
