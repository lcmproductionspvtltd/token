// Long forms shown one short step at a time (same look as the web's core/Steps.jsx).
//   StepBar      – numbered steps with a line between them; finished steps get a tick.
//   StepFormPage – full-screen form in steps: Back / Next, and Save on the last step.
//                  When editing (`free`), any step can be opened and Save works from every step.

import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import 'icons.dart';
import 'theme.dart';
import 'widgets.dart';

class StepBar extends StatelessWidget {
  final List<String> steps;
  final int at;
  final ValueChanged<int> onPick;
  final bool Function(int i)? canPick;
  const StepBar({super.key, required this.steps, required this.at, required this.onPick, this.canPick});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final row = <Widget>[];
    for (var i = 0; i < steps.length; i++) {
      if (i > 0) {
        row.add(
          Expanded(
            child: Container(
              height: 2,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(color: i <= at ? b.c : Tk.line2, borderRadius: BorderRadius.circular(2)),
            ),
          ),
        );
      }
      final on = i == at;
      final done = i < at;
      final open = !on && (canPick?.call(i) ?? done);
      row.add(
        Semantics(
          button: open,
          selected: on,
          label: 'Step ${i + 1}: ${steps[i]}',
          child: InkWell(
            borderRadius: BorderRadius.circular(99),
            onTap: open ? () => onPick(i) : null,
            child: Padding(
              padding: const EdgeInsets.all(3),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: on
                          ? b.c
                          : done
                          ? b.wash
                          : Colors.white,
                      border: Border.all(
                        color: on
                            ? b.c
                            : done
                            ? b.wash
                            : Tk.line2,
                      ),
                    ),
                    child: done
                        ? AppIcon('check', size: 13, color: b.ink, stroke: 2.6)
                        : Text(
                            '${i + 1}',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: on ? Colors.white : Tk.ink3,
                            ),
                          ),
                  ),
                  // Only the current step shows its name, so the bar fits on a phone.
                  if (on) ...[
                    const SizedBox(width: 7),
                    Text(
                      steps[i],
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Tk.ink),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(children: row),
    );
  }
}

class StepFormPage extends StatefulWidget {
  final String title;
  final String submitLabel;
  final List<String> steps;
  final bool free;
  final List<Widget> Function(BuildContext context, void Function(VoidCallback fn) setState, int step) builder;
  final Future<void> Function() onSubmit;
  const StepFormPage({
    super.key,
    required this.title,
    required this.submitLabel,
    required this.steps,
    required this.builder,
    required this.onSubmit,
    this.free = false,
  });

  /// Opens the form; true when it was saved.
  static Future<bool> open(
    BuildContext context, {
    required String title,
    required String submitLabel,
    required List<String> steps,
    required List<Widget> Function(BuildContext context, void Function(VoidCallback fn) setState, int step) builder,
    required Future<void> Function() onSubmit,
    bool free = false,
  }) async {
    final r = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => StepFormPage(
          title: title,
          submitLabel: submitLabel,
          steps: steps,
          builder: builder,
          onSubmit: onSubmit,
          free: free,
        ),
      ),
    );
    return r == true;
  }

  @override
  State<StepFormPage> createState() => _StepFormPageState();
}

class _StepFormPageState extends State<StepFormPage> {
  final _form = GlobalKey<FormState>();
  final _scroll = ScrollController();
  int at = 0;
  bool busy = false;
  String error = '';

  bool get _last => at == widget.steps.length - 1;

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _go(int i) {
    setState(() {
      at = i;
      error = '';
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  /// Only this step's fields are on screen, so this checks just them.
  bool _valid() {
    FocusScope.of(context).unfocus();
    return _form.currentState?.validate() ?? false;
  }

  void _next() {
    if (_valid()) _go(at + 1);
  }

  Future<void> _submit() async {
    if (!_valid()) return;
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
          error = e is ApiException ? e.message : e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // The phone's back button goes to the previous step first.
      canPop: at == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _go(at - 1);
      },
      child: Scaffold(
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
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                      StepBar(steps: widget.steps, at: at, onPick: _go, canPick: (i) => widget.free || i < at),
                      ...widget.builder(context, setState, at),
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
                  child: Row(
                    children: [
                      if (at > 0) ...[
                        Btn('Back', icon: 'back', kind: BtnKind.quiet, onPressed: () => _go(at - 1)),
                        const SizedBox(width: 8),
                      ],
                      if (!_last && widget.free) ...[
                        Btn('Next', iconRight: 'arrow', kind: BtnKind.soft, onPressed: _next),
                        const SizedBox(width: 8),
                      ],
                      Expanded(
                        child: !_last && !widget.free
                            ? Btn('Next', iconRight: 'arrow', expand: true, onPressed: _next)
                            : Btn(widget.submitLabel, expand: true, busy: busy, onPressed: _submit),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
