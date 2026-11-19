// Buttons: Btn (primary, soft, quiet, danger…) and round icon buttons.
// Part of the shared widgets – apps import them all through ui/widgets.dart.

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../icons.dart';
import '../theme.dart';

/* ---------- buttons ---------- */

enum BtnKind { primary, soft, quiet, danger, white, dark }

class Btn extends StatelessWidget {
  final String label;
  final String? icon;
  final String? iconRight;
  final VoidCallback? onPressed;
  final BtnKind kind;
  final bool busy;
  final bool expand;
  final bool small;
  const Btn(
    this.label, {
    super.key,
    this.icon,
    this.iconRight,
    this.onPressed,
    this.kind = BtnKind.primary,
    this.busy = false,
    this.expand = false,
    this.small = false,
  });

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final enabled = onPressed != null && !busy;
    Color fg;
    BoxDecoration deco;
    switch (kind) {
      case BtnKind.primary:
        fg = Colors.white;
        deco = BoxDecoration(
          gradient: enabled ? b.gradBtn : null,
          color: enabled ? null : mix(b.c, 0.3, Colors.white),
          borderRadius: BorderRadius.circular(small ? 12 : Tk.r),
          boxShadow: enabled
              ? [BoxShadow(color: fade(b.c, 0.35), blurRadius: 18, offset: const Offset(0, 8), spreadRadius: -8)]
              : null,
        );
        break;
      case BtnKind.soft:
        fg = b.ink;
        deco = BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(small ? 12 : Tk.r),
          border: Border.all(color: b.lineC, width: 1.3),
        );
        break;
      case BtnKind.quiet:
        fg = b.ink;
        deco = BoxDecoration(color: b.wash, borderRadius: BorderRadius.circular(small ? 12 : Tk.r));
        break;
      case BtnKind.danger:
        fg = Tk.badFg;
        deco = BoxDecoration(color: Tk.badBg, borderRadius: BorderRadius.circular(small ? 12 : Tk.r));
        break;
      case BtnKind.white:
        fg = b.ink;
        deco = BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(small ? 12 : Tk.r),
          boxShadow: [
            BoxShadow(color: fade(Colors.black, 0.18), blurRadius: 16, offset: const Offset(0, 6), spreadRadius: -6),
          ],
        );
        break;
      case BtnKind.dark:
        fg = Colors.white;
        deco = BoxDecoration(color: Tk.ink, borderRadius: BorderRadius.circular(small ? 12 : Tk.r));
        break;
    }
    final h = small ? 40.0 : 52.0;
    final content = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (busy)
          SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: fg))
        else if (icon != null)
          AppIcon(icon!, size: small ? 17 : 19, color: fg, stroke: 2),
        if ((busy || icon != null) && label.isNotEmpty) const SizedBox(width: 8),
        if (label.isNotEmpty)
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontFamily: Tk.sans,
                color: fg,
                fontWeight: FontWeight.w600,
                fontSize: small ? 13.5 : 15,
              ),
            ),
          ),
        if (iconRight != null) ...[
          const SizedBox(width: 8),
          AppIcon(iconRight!, size: small ? 16 : 18, color: fg, stroke: 2),
        ],
      ],
    );
    return Opacity(
      opacity: enabled || kind == BtnKind.primary ? 1 : 0.55,
      child: Container(
        height: h,
        decoration: deco,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(small ? 12 : Tk.r),
            onTap: enabled
                ? () {
                    HapticFeedback.selectionClick();
                    onPressed!();
                  }
                : null,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: small ? 14 : 20),
              child: content,
            ),
          ),
        ),
      ),
    );
  }
}

/// Round icon button (edit, delete, ...) with a tooltip.
class IconBtn extends StatelessWidget {
  final String icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool danger;
  final Color? color;
  final double size;
  const IconBtn(
    this.icon, {
    super.key,
    required this.tooltip,
    this.onPressed,
    this.danger = false,
    this.color,
    this.size = 40,
  });

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final fg = color ?? (danger ? Tk.badFg : b.ink);
    return Tooltip(
      message: tooltip,
      child: Material(
        color: danger ? Tk.badBg : b.wash,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: size,
            height: size,
            child: Center(
              child: AppIcon(icon, size: size * 0.45, color: fg),
            ),
          ),
        ),
      ),
    );
  }
}
