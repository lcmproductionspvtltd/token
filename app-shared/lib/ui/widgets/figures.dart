// Figure cards (numbers at the top of dashboards, like the web).
// Part of the shared widgets – apps import them all through ui/widgets.dart.

import 'package:material_ui/material_ui.dart';

import '../icons.dart';
import '../theme.dart';

/* ---------- figures (stat cards, like the web dashboards) ---------- */

class FigureItem {
  final String label;
  final String value;
  final String icon;
  final Color color;
  const FigureItem(this.label, this.value, this.icon, this.color);
}

class Figures extends StatelessWidget {
  final List<FigureItem> items;
  const Figures(this.items, {super.key});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final cols = c.maxWidth > 900 ? 5 : (c.maxWidth > 600 ? 3 : 2);
        const gap = 12.0;
        final w = (c.maxWidth - (cols - 1) * gap) / cols;
        final lonely = cols == 2 && items.length.isOdd; // last card fills the row instead of sitting alone
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (var i = 0; i < items.length; i++)
              SizedBox(
                width: lonely && i == items.length - 1 ? c.maxWidth : w,
                child: _FigureCard(items[i], wide: lonely && i == items.length - 1),
              ),
          ],
        );
      },
    );
  }
}

/// Solid colour stat card: gradient fill, white text, glass icon chip.
class _FigureCard extends StatelessWidget {
  final FigureItem f;
  final bool wide;
  const _FigureCard(this.f, {this.wide = false});

  @override
  Widget build(BuildContext context) {
    final c = brandOf(context).c; // every card in the business's own colour
    final dark = mix(c, 0.62, const Color(0xFF0E0718));
    final light = mix(c, 0.88, Colors.white);
    final radius = BorderRadius.circular(20);
    final icon = Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: fade(Colors.white, 0.20),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: fade(Colors.white, 0.28)),
      ),
      alignment: Alignment.center,
      child: AppIcon(f.icon, size: 20, color: Colors.white, stroke: 2.1),
    );
    final label = Text(
      f.label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(fontSize: 12.5, color: fade(Colors.white, 0.86), fontWeight: FontWeight.w500),
    );
    final value = FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: Text(
        f.value,
        style: const TextStyle(
          fontSize: 26,
          height: 1.15,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
          color: Colors.white,
        ),
      ),
    );
    return Container(
      height: wide ? 92 : 128,
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [light, c, dark],
          stops: const [0, 0.45, 1],
        ),
        boxShadow: [BoxShadow(color: fade(c, 0.45), blurRadius: 22, offset: const Offset(0, 10), spreadRadius: -10)],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          children: [
            // Decorative rings, clipped to the card.
            Positioned(
              right: -28,
              top: -28,
              child: Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(shape: BoxShape.circle, color: fade(Colors.white, 0.10)),
              ),
            ),
            Positioned(
              right: 18,
              bottom: -36,
              child: Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: fade(Colors.white, 0.14), width: 10),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: wide
                  ? Row(
                      children: [
                        icon,
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [label, value],
                          ),
                        ),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [icon, const Spacer(), label, value],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
