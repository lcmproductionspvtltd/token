import 'package:flutter/gestures.dart';
import 'package:material_ui/material_ui.dart';

/// Closes the on-screen keyboard when the person taps anywhere outside a text field
/// (search boxes and every form, on every screen). Wraps the whole app in MaterialApp.builder.
///
/// Taps on a text field keep the keyboard; taps on buttons and lists still work as before.
class TapToCloseKeyboard extends StatelessWidget {
  const TapToCloseKeyboard({super.key, required this.child});

  final Widget child;

  static void close() => FocusManager.instance.primaryFocus?.unfocus();

  /// The whole text field (with its border, icons and label) that holds [context], or null when
  /// [context] isn't inside a text field.
  static RenderBox? _fieldBox(BuildContext? context) {
    if (context == null || context.findAncestorWidgetOfExactType<EditableText>() == null) return null;
    RenderBox? box;
    context.visitAncestorElements((element) {
      if (element.widget is TextField || element.widget is TextFormField) {
        final r = element.findRenderObject();
        if (r is RenderBox && r.attached && r.hasSize) box = r;
        return false;
      }
      return true;
    });
    if (box != null) return box;
    final own = context.findRenderObject();
    return own is RenderBox && own.attached && own.hasSize ? own : null;
  }

  /// True when the tap lands on a text field's own pop-up controls (its Paste/Copy menu or selection
  /// handles), which Flutter marks with a [TextFieldTapRegion].
  static bool _onTextFieldControls(PointerDownEvent event) {
    final result = HitTestResult();
    WidgetsBinding.instance.hitTestInView(result, event.position, event.viewId);
    for (final entry in result.path) {
      final target = entry.target;
      if (target is RenderTapRegion && target.groupId == EditableText) return true;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (event) {
        final field = _fieldBox(FocusManager.instance.primaryFocus?.context);
        if (field == null) return; // no text field is being edited, so no keyboard
        final rect = field.localToGlobal(Offset.zero) & field.size;
        if (rect.inflate(4).contains(event.position)) return;
        // The Paste / Copy menu and the selection handles belong to the field: tapping them must not
        // close the keyboard (that cancelled "Paste", e.g. pasting a password).
        if (_onTextFieldControls(event)) return;
        close();
      },
      child: child,
    );
  }
}
