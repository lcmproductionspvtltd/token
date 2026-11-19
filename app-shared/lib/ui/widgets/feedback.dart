// Toasts, error messages, confirm dialogs and opening links.
// Part of the shared widgets – apps import them all through ui/widgets.dart.

import 'package:material_ui/material_ui.dart';

import '../../core/api.dart';
import '../../core/native.dart';
import '../icons.dart';
import '../theme.dart';

/* ---------- feedback ---------- */

void toast(BuildContext context, String message, {bool error = false}) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m.hideCurrentSnackBar();
  m.showSnackBar(
    SnackBar(
      content: Row(
        children: [
          AppIcon(error ? 'x' : 'check', size: 18, color: error ? const Color(0xFFFFAAA5) : const Color(0xFF8BE3AE)),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
        ],
      ),
      duration: Duration(milliseconds: error ? 3800 : 2400),
    ),
  );
}

/// Shows the error message from an API call (or a generic one).
void showError(BuildContext context, Object err) {
  toast(context, err is ApiException ? err.message : 'Something went wrong. Please try again.', error: true);
}

Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  String message = '',
  String confirm = 'Confirm',
  bool danger = true,
}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tk.rLg)),
      title: Text(
        title,
        style: const TextStyle(fontFamily: Tk.serif, fontSize: 20, fontWeight: FontWeight.w600, color: Tk.ink),
      ),
      content: message.isEmpty ? null : Text(message, style: const TextStyle(color: Tk.ink2, height: 1.45)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancel', style: TextStyle(color: Tk.ink2)),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: danger ? Tk.badFg : Theme.of(ctx).colorScheme.primary,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tk.r)),
          ),
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirm),
        ),
      ],
    ),
  );
  return r == true;
}

/// Opens a URL with the phone's apps; shows a message if nothing can open it.
Future<void> openLink(BuildContext context, String url) async {
  final ok = await Native.openUrl(url);
  if (!ok && context.mounted) toast(context, 'No app on this phone can open that link', error: true);
}
