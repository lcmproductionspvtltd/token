// Design tokens shared with the web app (client/src/styles/tokens.css). Every brand tint is
// mixed from the business's colour, so each business's app looks like its own web pages.

import 'package:material_ui/material_ui.dart';

class Tk {
  static const ink = Color(0xFF221C2B);
  static const ink2 = Color(0xFF4B4558);
  static const ink3 = Color(0xFF777085);
  static const line = Color(0xFFE7E3EC);
  static const line2 = Color(0xFFD7D2DF);
  static const porcelain = Color(0xFFF5F4F7);
  static const paper = Color(0xFFFFFFFF);
  static const canvas = Color(0xFFF6F4F9);

  static const waitBg = Color(0xFFFDF0D5);
  static const waitFg = Color(0xFF8A4B06);
  static const serveBg = Color(0xFFDDE8FD);
  static const serveFg = Color(0xFF1E3FA8);
  static const doneBg = Color(0xFFDCF3E4);
  static const doneFg = Color(0xFF146C37);
  static const badBg = Color(0xFFFBE1E1);
  static const badFg = Color(0xFFA11D1D);
  static const offBg = Color(0xFFECEBF0);
  static const offFg = Color(0xFF5D596B);

  static const teal = Color(0xFF0F9B8E);
  static const amber = Color(0xFFD97706);
  static const sky = Color(0xFF2563EB);
  static const rose = Color(0xFFDB2777);
  static const green = Color(0xFF15803D);

  static const bqueePurple = Color(0xFF7B2C9E);

  static const sans = 'Poppins';
  static const serif = 'Lora';

  static const r = 14.0;
  static const rLg = 20.0;
  static const rXl = 28.0;
}

/// CSS color-mix(in srgb, a p%, b).
Color mix(Color a, double p, Color b) {
  final q = 1 - p;
  return Color.from(
    alpha: a.a * p + b.a * q,
    red: a.r * p + b.r * q,
    green: a.g * p + b.g * q,
    blue: a.b * p + b.b * q,
  );
}

/// Same colour with a new opacity (0–1).
Color fade(Color c, double opacity) => c.withValues(alpha: opacity);

/// Brand palette derived like the web (--brand-ink, --brand-deep, --brand-wash, ...).
class Brand {
  final Color c;
  const Brand(this.c);
  Color get ink => mix(c, 0.76, const Color(0xFF120D18));
  Color get deep => mix(c, 0.55, const Color(0xFF120D18));
  Color get wash => mix(c, 0.06, Colors.white);
  Color get tint => mix(c, 0.13, Colors.white);
  Color get lineC => mix(c, 0.30, Colors.white);
  Color get glow => fade(c, 0.35);
  Color get rose => mix(c, 0.45, const Color(0xFFFF5D7A));
  LinearGradient get gradBtn => LinearGradient(colors: [deep, c, mix(c, 0.55, rose)], stops: const [0, 0.55, 1]);
  LinearGradient get gradSide => LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [mix(c, 0.62, const Color(0xFF160B22)), mix(c, 0.38, const Color(0xFF0D0716))],
  );
}

Color parseHexColor(String? hex, [Color fallback = Tk.bqueePurple]) {
  final h = (hex ?? '').replaceAll('#', '').trim();
  if (h.length != 6) return fallback;
  final v = int.tryParse(h, radix: 16);
  return v == null ? fallback : Color(0xFF000000 | v);
}

ThemeData buildTheme(Color brandColor) {
  final b = Brand(brandColor);
  final scheme = ColorScheme.fromSeed(
    seedColor: brandColor,
    brightness: Brightness.light,
  ).copyWith(primary: brandColor, onPrimary: Colors.white, surface: Tk.paper, onSurface: Tk.ink, error: Tk.badFg);
  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(Tk.r),
    borderSide: BorderSide(color: c, width: w),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: Tk.sans,
    scaffoldBackgroundColor: Tk.canvas,
    textTheme: const TextTheme(
      displaySmall: TextStyle(fontFamily: Tk.serif, fontWeight: FontWeight.w600, color: Tk.ink, letterSpacing: -0.5),
      headlineSmall: TextStyle(fontFamily: Tk.serif, fontWeight: FontWeight.w600, color: Tk.ink),
      titleLarge: TextStyle(fontWeight: FontWeight.w700, color: Tk.ink, fontSize: 20, letterSpacing: -0.2),
      titleMedium: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink, fontSize: 16),
      titleSmall: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink, fontSize: 14),
      bodyLarge: TextStyle(color: Tk.ink, fontSize: 15, height: 1.45),
      bodyMedium: TextStyle(color: Tk.ink2, fontSize: 14, height: 1.45),
      bodySmall: TextStyle(color: Tk.ink3, fontSize: 12.5, height: 1.4),
      labelLarge: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: Tk.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontFamily: Tk.serif, fontSize: 21, fontWeight: FontWeight.w600, color: Tk.ink),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      border: border(Tk.line2),
      enabledBorder: border(Tk.line2),
      focusedBorder: border(brandColor, 1.8),
      errorBorder: border(Tk.badFg),
      focusedErrorBorder: border(Tk.badFg, 1.8),
      labelStyle: const TextStyle(color: Tk.ink2, fontSize: 14),
      floatingLabelStyle: TextStyle(color: b.ink, fontWeight: FontWeight.w600),
      hintStyle: const TextStyle(color: Tk.ink3, fontSize: 14),
      helperStyle: const TextStyle(color: Tk.ink3, fontSize: 12),
      helperMaxLines: 3,
    ),
    dividerTheme: const DividerThemeData(color: Tk.line, thickness: 1, space: 1),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Tk.ink,
      contentTextStyle: const TextStyle(fontFamily: Tk.sans, color: Colors.white, fontSize: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tk.r)),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => Colors.white),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? brandColor : Tk.line2),
      trackOutlineColor: WidgetStateProperty.resolveWith((s) => Colors.transparent),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Tk.rXl))),
      showDragHandle: true,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: b.tint,
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontFamily: Tk.sans,
          fontSize: 11.5,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? b.ink : Tk.ink3,
        ),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: brandColor),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? brandColor : Colors.white),
      side: const BorderSide(color: Tk.line2, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
    ),
  );
}

/// The current brand colours (the business's colour, or BQuee purple).
Brand brandOf(BuildContext context) => Brand(Theme.of(context).colorScheme.primary);
