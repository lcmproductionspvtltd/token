// Form fields, switches, dropdowns, image picker, full-screen form page, colour swatches.
// Part of the shared widgets – apps import them all through ui/widgets.dart.

import 'package:material_ui/material_ui.dart';

import '../../core/api.dart';
import '../../core/native.dart';
import '../icons.dart';
import '../theme.dart';
import 'buttons.dart';
import 'marks.dart';

/* ---------- forms ---------- */

/// A password field with an eye button to show or hide what was typed.
class PasswordX extends StatefulWidget {
  final String label;
  final TextEditingController controller;
  final String? helper;
  final bool required;
  final String? Function(String value)? validate;
  const PasswordX(this.label, this.controller, {super.key, this.helper, this.required = false, this.validate});

  @override
  State<PasswordX> createState() => _PasswordXState();
}

class _PasswordXState extends State<PasswordX> {
  bool hide = true;

  @override
  Widget build(BuildContext context) => FieldX(
        widget.label,
        widget.controller,
        obscure: hide,
        required: widget.required,
        helper: widget.helper,
        validate: widget.validate,
        suffix: IconButton(
          tooltip: hide ? 'Show password' : 'Hide password',
          icon: AppIcon('eye', size: 20, color: hide ? Tk.ink3 : Theme.of(context).colorScheme.primary),
          onPressed: () => setState(() => hide = !hide),
        ),
      );
}

class FieldX extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final String? helper;
  final TextInputType? keyboard;
  final bool obscure;
  final int maxLines;
  final int? maxLength;
  final bool required;
  final String? Function(String value)? validate;
  final String? icon;
  final TextCapitalization caps;
  final bool autofocus;
  final ValueChanged<String>? onChanged;
  final Widget? suffix;
  const FieldX(
    this.label,
    this.controller, {
    super.key,
    this.hint,
    this.helper,
    this.keyboard,
    this.obscure = false,
    this.maxLines = 1,
    this.maxLength,
    this.required = false,
    this.validate,
    this.icon,
    this.caps = TextCapitalization.none,
    this.autofocus = false,
    this.onChanged,
    this.suffix,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
        controller: controller,
        obscureText: obscure,
        keyboardType: keyboard,
        maxLines: obscure ? 1 : maxLines,
        minLines: 1,
        maxLength: maxLength,
        autofocus: autofocus,
        textCapitalization: caps,
        onChanged: onChanged,
        style: const TextStyle(fontSize: 15, color: Tk.ink),
        decoration: InputDecoration(
          labelText: required ? '$label *' : label,
          hintText: hint,
          helperText: helper,
          counterText: '',
          suffixIcon: suffix,
          prefixIcon: icon == null
              ? null
              : Padding(
                  padding: const EdgeInsets.all(13),
                  child: AppIcon(icon!, size: 20, color: Tk.ink3),
                ),
        ),
        validator: (v) {
          final s = (v ?? '').trim();
          if (required && s.isEmpty) return 'Enter ${label.toLowerCase()}';
          if (validate != null) return validate!(s);
          return null;
        },
      ),
    );
  }
}

class SwitchRow extends StatelessWidget {
  final String label;
  final String? hint;
  final bool value;
  final ValueChanged<bool> onChanged;
  const SwitchRow(this.label, {super.key, this.hint, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(Tk.r),
      onTap: () => onChanged(!value),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink, fontSize: 14.5),
                  ),
                  if (hint != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(hint!, style: const TextStyle(color: Tk.ink3, fontSize: 12.5)),
                    ),
                ],
              ),
            ),
            Switch(value: value, onChanged: onChanged),
          ],
        ),
      ),
    );
  }
}

/// Dropdown in the same style as the text fields.
class SelectX<T> extends StatelessWidget {
  final String label;
  final T value;
  final List<MapEntry<T, String>> options;
  final ValueChanged<T> onChanged;
  final String? helper;
  const SelectX(
    this.label, {
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
    this.helper,
  });

  @override
  Widget build(BuildContext context) {
    final has = options.any((o) => o.key == value);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: DropdownButtonFormField<T>(
        // initialValue is read once, so the key makes the field start again when the value changes.
        key: ValueKey<T?>(has ? value : null),
        initialValue: has ? value : null,
        isExpanded: true,
        decoration: InputDecoration(labelText: label, helperText: helper),
        borderRadius: BorderRadius.circular(Tk.r),
        dropdownColor: Colors.white,
        items: options
            .map(
              (o) => DropdownMenuItem<T>(
                value: o.key,
                child: Text(o.value, overflow: TextOverflow.ellipsis),
              ),
            )
            .toList(),
        onChanged: (v) {
          if (v != null) onChanged(v);
        },
      ),
    );
  }
}

/// Photo field: shows the current image and lets the user pick a new one from the phone.
class ImageField extends StatelessWidget {
  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final int maxSize;
  final bool wide;
  final String? hint;
  const ImageField(
    this.label, {
    super.key,
    required this.value,
    required this.onChanged,
    this.maxSize = 800,
    this.wide = false,
    this.hint,
  });

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final w = wide ? 150.0 : 76.0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Container(
            width: w,
            height: 76,
            decoration: BoxDecoration(
              color: b.wash,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Tk.line),
            ),
            clipBehavior: Clip.antiAlias,
            child: NetImage(
              value,
              width: w,
              height: 76,
              fallback: Center(child: AppIcon('image', size: 26, color: b.ink)),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                ),
                if (hint != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(hint!, style: const TextStyle(color: Tk.ink3, fontSize: 12)),
                  ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Btn(
                      value.isEmpty ? 'Choose photo' : 'Change',
                      icon: 'camera',
                      kind: BtnKind.soft,
                      small: true,
                      onPressed: () async {
                        final picked = await Native.pickImage(maxSize: maxSize);
                        if (picked != null && picked.isNotEmpty) onChanged(picked);
                      },
                    ),
                    if (value.isNotEmpty)
                      Btn('Remove', kind: BtnKind.danger, small: true, onPressed: () => onChanged('')),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-screen form page with a sticky save button. [onSubmit] throws to show an error.
class FormPage extends StatefulWidget {
  final String title;
  final String submitLabel;
  final List<Widget> Function(BuildContext context, void Function(VoidCallback fn) setState) builder;
  final Future<void> Function() onSubmit;
  const FormPage({
    super.key,
    required this.title,
    required this.submitLabel,
    required this.builder,
    required this.onSubmit,
  });

  static Future<bool> open(
    BuildContext context, {
    required String title,
    required String submitLabel,
    required List<Widget> Function(BuildContext context, void Function(VoidCallback fn) setState) builder,
    required Future<void> Function() onSubmit,
  }) async {
    final r = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => FormPage(title: title, submitLabel: submitLabel, builder: builder, onSubmit: onSubmit),
      ),
    );
    return r == true;
  }

  @override
  State<FormPage> createState() => _FormPageState();
}

class _FormPageState extends State<FormPage> {
  final _form = GlobalKey<FormState>();
  bool busy = false;
  String error = '';

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await widget.onSubmit();
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = friendlyError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        leading: IconButton(
          icon: const AppIcon('x', size: 22),
          onPressed: () => Navigator.of(context).pop(false),
          tooltip: 'Close',
        ),
        title: Text(widget.title),
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  children: [
                    ...widget.builder(context, setState),
                    if (error.isNotEmpty)
                      Container(
                        margin: const EdgeInsets.only(top: 6),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: Tk.badBg, borderRadius: BorderRadius.circular(12)),
                        child: Text(
                          error,
                          style: const TextStyle(color: Tk.badFg, fontWeight: FontWeight.w500),
                        ),
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Tk.line)),
                ),
                child: Btn(widget.submitLabel, expand: true, busy: busy, onPressed: _submit),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A labelled group inside forms (like the web's fieldset).
class FieldGroup extends StatelessWidget {
  final String title;
  final String? hint;
  final List<Widget> children;
  const FieldGroup(this.title, {super.key, this.hint, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Tk.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
          ),
          if (hint != null)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(hint!, style: const TextStyle(color: Tk.ink3, fontSize: 12.5)),
            ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

/// Colour swatches with a selected ring.
class Swatches extends StatelessWidget {
  final List<Color> colors;
  final Color? value;
  final ValueChanged<Color> onChanged;
  const Swatches({super.key, required this.colors, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final c in colors)
          GestureDetector(
            onTap: () => onChanged(c),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: c,
                shape: BoxShape.circle,
                border: Border.all(color: value == c ? Tk.ink : Colors.white, width: 2.5),
                boxShadow: [BoxShadow(color: fade(c, 0.4), blurRadius: 8, offset: const Offset(0, 3))],
              ),
              child: value == c
                  ? const Center(child: AppIcon('check', size: 16, color: Colors.white, stroke: 2.6))
                  : null,
            ),
          ),
      ],
    );
  }
}

/// Segmented choice (like the web's .seg buttons).
class Segmented<T> extends StatelessWidget {
  final List<MapEntry<T, String>> options;
  final T value;
  final ValueChanged<T> onChanged;
  const Segmented({super.key, required this.options, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final o in options)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () => onChanged(o.key),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  decoration: BoxDecoration(
                    gradient: o.key == value ? b.gradBtn : null,
                    color: o.key == value ? null : Colors.white,
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: o.key == value ? Colors.transparent : Tk.line),
                  ),
                  child: Text(
                    o.value,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      color: o.key == value ? Colors.white : Tk.ink2,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
