// Empty, loading and error states.
// Part of the shared widgets – apps import them all through ui/widgets.dart.

import 'package:material_ui/material_ui.dart';

import '../../core/api.dart';
import '../icons.dart';
import '../theme.dart';
import 'buttons.dart';

/* ---------- empty / loading / error ---------- */

class EmptyState extends StatelessWidget {
  final String icon;
  final String title;
  final String text;
  final Widget? action;
  const EmptyState({super.key, required this.icon, required this.title, this.text = '', this.action});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 34, horizontal: 20),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [b.c, b.rose]),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(color: fade(b.c, 0.35), blurRadius: 22, offset: const Offset(0, 10), spreadRadius: -8),
              ],
            ),
            alignment: Alignment.center,
            child: AppIcon(icon, size: 28, color: Colors.white, stroke: 2),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Tk.ink),
          ),
          if (text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                text,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Tk.ink3, height: 1.45),
              ),
            ),
          if (action != null) Padding(padding: const EdgeInsets.only(top: 16), child: action!),
        ],
      ),
    );
  }
}

class Loader extends StatelessWidget {
  const Loader({super.key});
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(48),
    child: Center(child: CircularProgressIndicator()),
  );
}

class ErrorView extends StatelessWidget {
  final Object error;
  final VoidCallback onRetry;
  const ErrorView(this.error, {super.key, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: 'refresh',
      title: 'Couldn’t load this',
      text: friendlyError(error),
      action: Btn('Try again', icon: 'refresh', kind: BtnKind.soft, onPressed: onRetry),
    );
  }
}
