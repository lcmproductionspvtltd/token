// Cards and list rows: AppCard, ListCard, tags, card actions, star rating.
// Part of the shared widgets – apps import them all through ui/widgets.dart.

import 'package:material_ui/material_ui.dart';

import '../icons.dart';
import '../theme.dart';

/* ---------- surfaces ---------- */

/// Accent for a token by its status, so the queue reads at a glance.
Color statusAccent(String status) {
  switch (status) {
    case 'waiting':
      return const Color(0xFFF59E0B);
    case 'serving':
    case 'in_progress':
      return const Color(0xFF3B82F6);
    case 'done':
      return const Color(0xFF10B981);
    case 'cancelled':
    case 'removed':
      return const Color(0xFFEF4444);
    default:
      return const Color(0xFF8B8598);
  }
}

/// Left-edge colours for cards in a list (pink, blue, purple – repeating).
const List<Color> kStrips = [Color(0xFFE0457B), Color(0xFF3B6FE0), Color(0xFFA43FD6)];
Color stripAt(int i) => kStrips[i % kStrips.length];

/// Gives cards below it an accent colour (set by PagedColumn, in pagination.dart, for each row).
class AccentScope extends InheritedWidget {
  final Color? color;
  const AccentScope({super.key, required this.color, required super.child});

  /// The accent for a card here: the scope's colour, none inside another card, else the brand.
  static Color? resolve(BuildContext context, Color brand) {
    final scope = context.dependOnInheritedWidgetOfExactType<AccentScope>();
    return scope == null ? brand : scope.color;
  }

  @override
  bool updateShouldNotify(AccentScope old) => old.color != color;
}

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final Gradient? gradient;
  final Color? borderColor;

  /// Colour of the left edge. Falls back to the list's [AccentScope], else the brand.
  final Color? accent;
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.onTap,
    this.color,
    this.gradient,
    this.borderColor,
    this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final radius = BorderRadius.circular(22);
    final a = (color == null && gradient == null) ? (accent ?? AccentScope.resolve(context, b.c)) : null;
    // Cards inside this card don't inherit the row colour.
    final inner = AccentScope(color: null, child: child);
    Widget body = Padding(padding: a != null ? padding.add(const EdgeInsets.only(left: 5)) : padding, child: inner);
    if (onTap != null) body = InkWell(onTap: onTap, child: body);
    if (a != null) {
      body = Stack(
        children: [
          body,
          Positioned(
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [mix(a, 0.78, Colors.white), a, mix(a, 0.8, const Color(0xFF1A0B2E))],
                ),
              ),
            ),
          ),
        ],
      );
    }
    return Container(
      decoration: BoxDecoration(
        color: gradient == null ? (color ?? Colors.white) : null,
        gradient: gradient,
        borderRadius: radius,
        border: Border.all(color: borderColor ?? mix(a ?? b.c, 0.10, Tk.line)),
        boxShadow: [
          BoxShadow(color: fade(const Color(0xFF14082A), 0.035), blurRadius: 3, offset: const Offset(0, 1)),
          BoxShadow(color: fade(a ?? b.c, 0.13), blurRadius: 26, offset: const Offset(0, 12), spreadRadius: -14),
        ],
      ),
      child: Material(color: Colors.transparent, borderRadius: radius, clipBehavior: Clip.antiAlias, child: body),
    );
  }
}

/// The standard list card used on every list (staff, services, reviews, businesses…):
///
///   [leading]  Title                         [trailing]
///              (icon) subtitle
///   ─────────────────────────────────────────────────────
///   [icon] detail line
///   [tag] [tag]                              [actions]
class ListCard extends StatelessWidget {
  final Widget leading;
  final String title;
  final String? subtitle;
  final String? subtitleIcon;
  final Widget? trailing;
  final String? detailIcon;
  final String? detail;
  final bool detailWarn;
  final Widget? body;
  final List<Widget> tags;
  final List<Widget> actions;
  final VoidCallback? onTap;
  final bool dim;

  /// Thin vertical line between the picture and the title (used on reviews).
  final bool separator;
  const ListCard({
    super.key,
    required this.leading,
    required this.title,
    this.subtitle,
    this.subtitleIcon,
    this.trailing,
    this.detailIcon,
    this.detail,
    this.detailWarn = false,
    this.body,
    this.tags = const [],
    this.actions = const [],
    this.onTap,
    this.dim = false,
    this.separator = false,
  });

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final a = AccentScope.resolve(context, b.c) ?? b.c;
    final hasDetail = (detail != null && detail!.isNotEmpty) || body != null;
    return AppCard(
      accent: a,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Opacity(opacity: dim ? 0.5 : 1, child: leading),
              const SizedBox(width: 14),
              if (separator) ...[Container(width: 1.2, height: 40, color: Tk.line2), const SizedBox(width: 14)],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 16.5,
                        fontWeight: FontWeight.w700,
                        color: dim ? Tk.ink3 : const Color(0xFF1B1530),
                        height: 1.25,
                      ),
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          if (subtitleIcon != null) ...[
                            AppIcon(subtitleIcon!, size: 15, color: b.c, stroke: 1.9),
                            const SizedBox(width: 6),
                          ],
                          Flexible(
                            child: Text(
                              subtitle!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13.5, color: Tk.ink3),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 10), trailing!],
            ],
          ),
          if (hasDetail) ...[
            const SizedBox(height: 13),
            Container(height: 1, color: mix(Tk.line, 0.5, Colors.white)),
            const SizedBox(height: 12),
          ],
          if (detail != null && detail!.isNotEmpty)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                IconChip(detailIcon ?? 'list', color: detailWarn ? Tk.badFg : a),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 7),
                    child: Text(
                      detail!,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 14, height: 1.35, color: detailWarn ? Tk.badFg : Tk.ink2),
                    ),
                  ),
                ),
              ],
            ),
          if (body != null) body!,
          if (tags.isNotEmpty || actions.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(child: Wrap(spacing: 8, runSpacing: 8, children: tags)),
                for (final x in actions) ...[const SizedBox(width: 8), x],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Small rounded square with an icon, tinted in [color].
class IconChip extends StatelessWidget {
  final String icon;
  final Color color;
  final double size;
  const IconChip(this.icon, {super.key, required this.color, this.size = 34});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: fade(color, 0.12), borderRadius: BorderRadius.circular(size * 0.3)),
      alignment: Alignment.center,
      child: AppIcon(icon, size: size * 0.5, color: color, stroke: 2),
    );
  }
}

enum TagTone { neutral, amber, blue, green, red, brand }

/// Rounded tag under a list card ("No login", "Queue 30 min", "Visible"…).
class Tag extends StatelessWidget {
  final String text;
  final String? icon;
  final bool dot;
  final TagTone tone;
  const Tag(this.text, {super.key, this.icon, this.dot = false, this.tone = TagTone.neutral});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final (Color bg, Color fg) = switch (tone) {
      TagTone.amber => (Tk.waitBg, Tk.waitFg),
      TagTone.blue => (Tk.serveBg, Tk.serveFg),
      TagTone.green => (Tk.doneBg, Tk.doneFg),
      TagTone.red => (Tk.badBg, Tk.badFg),
      TagTone.brand => (b.tint, b.ink),
      TagTone.neutral => (const Color(0xFFEDEBF1), const Color(0xFF4F4A5E)),
    };
    return Container(
      constraints: const BoxConstraints(minHeight: 36),
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot)
            Container(
              width: 8,
              height: 8,
              margin: const EdgeInsets.only(right: 7),
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
            ),
          if (icon != null)
            Padding(
              padding: const EdgeInsets.only(right: 7),
              child: AppIcon(icon!, size: 15, color: fg, stroke: 2),
            ),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: fg),
            ),
          ),
        ],
      ),
    );
  }
}

/// Rounded-square icon button for card actions (delete, edit, share…).
class CardAction extends StatelessWidget {
  final String icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool danger;
  const CardAction(this.icon, {super.key, required this.tooltip, this.onPressed, this.danger = false});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Tooltip(
      message: tooltip,
      child: Material(
        color: danger ? Tk.badBg : b.wash,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onPressed,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Center(child: AppIcon(icon, size: 18, color: danger ? Tk.badFg : b.ink, stroke: 2)),
          ),
        ),
      ),
    );
  }
}

/// Star rating shown in a soft pill.
class StarPill extends StatelessWidget {
  final int rating;
  const StarPill(this.rating, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF4F6),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: const Color(0xFFFBE3E8)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 1; i <= 5; i++)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1),
              child: AppIcon(
                'star',
                size: 15,
                color: i <= rating ? const Color(0xFFF5B301) : const Color(0xFFC9C3D6),
                stroke: i <= rating ? 1.2 : 1.6,
                fill: i <= rating,
              ),
            ),
        ],
      ),
    );
  }
}
