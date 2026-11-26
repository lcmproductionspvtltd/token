// "How do you start tokens?" – the owner's setting (Settings → Starting and finishing tokens).
//   perService  every service on a token has its own Start and Finish button (the default)
//   whole       one Start begins all of a token's services, one Finish ends them;
//               each staff member starts only their own services on the token.
// Same choice as the website.

import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:material_ui/material_ui.dart';

/// True when the business starts whole tokens at once (salon.tokenFlow == 'whole').
bool wholeTokens(Map<String, dynamic> salon) => salon['tokenFlow'] == 'whole';

class TokenFlowChoice extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const TokenFlowChoice({super.key, required this.value, required this.onChanged});

  static const options = [
    ('perService', 'list', 'Each service separately', 'Every service on a token has its own Start and Finish button.'),
    (
      'whole',
      'ticket',
      'Whole token at once',
      'One Start begins all of a token’s services and one Finish ends them. Each staff member starts only their own.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final o in options) ...[
          _option(b, o, value == o.$1, () => onChanged(o.$1)),
          const SizedBox(height: 10),
        ],
      ],
    );
  }

  Widget _option(Brand b, (String, String, String, String) o, bool on, VoidCallback onTap) {
    return Semantics(
      button: true,
      selected: on,
      label: o.$3,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: on ? b.wash : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: on ? b.c : Tk.line, width: on ? 1.8 : 1.2),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
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
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      o.$3,
                      style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink, fontSize: 14),
                    ),
                    const SizedBox(height: 3),
                    Text(o.$4, style: const TextStyle(color: Tk.ink3, fontSize: 12, height: 1.3)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
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
        ),
      ),
    );
  }
}
