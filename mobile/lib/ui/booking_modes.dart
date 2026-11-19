// "One service or many?" and "One staff member or many?" – chosen when a business is created
// (business sign-up, or by the super admin and their team). "One" skips that step of the
// customer's token booking form. Same choice as the web.

import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:material_ui/material_ui.dart';

class BookingModes extends StatelessWidget {
  final String serviceMode;
  final String staffMode;
  final void Function(String key, String value) onChanged;
  const BookingModes({super.key, required this.serviceMode, required this.staffMode, required this.onChanged});

  static const _groups = [
    (
      'serviceMode',
      'Services',
      [
        ('single', 'tag', 'One service', 'Customers don’t need to choose a service'),
        ('multiple', 'list', 'Many services', 'Customers pick one or more services'),
      ],
    ),
    (
      'staffMode',
      'Staff',
      [
        ('single', 'user', 'One staff member', 'Customers don’t need to choose who serves them'),
        ('multiple', 'users', 'Many staff', 'Customers can pick a staff member or the first free'),
      ],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final value = {'serviceMode': serviceMode, 'staffMode': staffMode};
    final steps = [if (serviceMode != 'single') 'Services', if (staffMode != 'single') 'Staff member', 'Your details'];
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final g in _groups) ...[
            Text(
              g.$2,
              style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink2, fontSize: 13.5),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < g.$3.length; i++) ...[
                  if (i > 0) const SizedBox(width: 10),
                  Expanded(child: _option(b, g.$3[i], value[g.$1] == g.$3[i].$1, () => onChanged(g.$1, g.$3[i].$1))),
                ],
              ],
            ),
            const SizedBox(height: 14),
          ],
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Tk.canvas,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Tk.line),
            ),
            child: Row(
              children: [
                AppIcon('ticket', size: 16, color: b.c),
                const SizedBox(width: 8),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        const TextSpan(text: 'Customer booking: '),
                        TextSpan(
                          text: steps.join(' → '),
                          style: TextStyle(fontWeight: FontWeight.w700, color: b.ink),
                        ),
                      ],
                    ),
                    style: const TextStyle(color: Tk.ink2, fontSize: 12.5),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _option(Brand b, (String, String, String, String) o, bool on, VoidCallback onTap) {
    return Semantics(
      button: true,
      selected: on,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(12),
          constraints: const BoxConstraints(minHeight: 118),
          decoration: BoxDecoration(
            color: on ? b.wash : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: on ? b.c : Tk.line, width: on ? 1.8 : 1.2),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      gradient: on ? b.gradBtn : null,
                      color: on ? null : Tk.canvas,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    alignment: Alignment.center,
                    child: AppIcon(o.$2, size: 17, color: on ? Colors.white : Tk.ink3, stroke: 1.9),
                  ),
                  const Spacer(),
                  Container(
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: on ? b.c : Colors.white,
                      border: Border.all(color: on ? b.c : Tk.line2, width: 1.5),
                    ),
                    alignment: Alignment.center,
                    child: on ? const AppIcon('check', size: 12, color: Colors.white, stroke: 2.4) : null,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                o.$3,
                style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink, fontSize: 14),
              ),
              const SizedBox(height: 3),
              Text(o.$4, style: const TextStyle(color: Tk.ink3, fontSize: 12, height: 1.3)),
            ],
          ),
        ),
      ),
    );
  }
}
