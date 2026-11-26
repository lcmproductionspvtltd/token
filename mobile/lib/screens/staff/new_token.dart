// Staff make a token by hand for a walk-in customer. The staff member is fixed (themselves) and only
// the services they do can be picked; the token goes straight into their own queue.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';

/// Opens the form. Returns true when a token was made.
Future<bool> openNewToken(BuildContext context, String currency) async =>
    await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute<bool>(builder: (_) => NewTokenScreen(currency: currency))) ??
    false;

class NewTokenScreen extends StatefulWidget {
  final String currency;

  /// For tests: the answer of /api/staff/my-services instead of asking the server.
  final Json? preset;
  const NewTokenScreen({super.key, required this.currency, this.preset});

  @override
  State<NewTokenScreen> createState() => _NewTokenScreenState();
}

class _NewTokenScreenState extends State<NewTokenScreen> {
  final name = TextEditingController();
  final mobile = TextEditingController();
  final Set<String> picked = {};
  bool busy = false;
  String error = '';

  @override
  void dispose() {
    name.dispose();
    mobile.dispose();
    super.dispose();
  }

  Future<Json> _load() async {
    final d = widget.preset ?? await session.api.getJson('/api/staff/my-services');
    final list = d.l('services');
    if (list.length == 1 && picked.isEmpty) picked.add(list.first.s('id'));
    return d;
  }

  Future<void> _create() async {
    if (name.text.trim().isEmpty) return setState(() => error = 'Enter the customer’s name.');
    if (picked.isEmpty) return setState(() => error = 'Choose at least one service.');
    setState(() {
      busy = true;
      error = '';
    });
    final r = await runAction(
      context,
      () => session.api.post('/api/staff/tokens', {
        'name': name.text.trim(),
        'mobile': mobile.text.trim(),
        'serviceIds': picked.toList(),
      }),
      done: null,
    );
    if (!mounted) return;
    setState(() => busy = false);
    if (r is Map) {
      final t = asJson(r['token']);
      toast(context, 'Token ${tokenNo(t)} created for ${t.m('customer').s('name')}');
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const AppIcon('back', size: 22),
          onPressed: () => Navigator.pop(context),
          tooltip: 'Back',
        ),
        title: const Text('New token'),
      ),
      body: Loaded<Json>(
        load: _load,
        builder: (context, d, reload) {
          final staff = d.m('staff');
          final services = d.l('services');
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              AppCard(
                color: Tk.porcelain,
                child: Row(
                  children: [
                    Avatar(staff.s('name', '?'), size: 38),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Staff', style: TextStyle(color: Tk.ink3, fontSize: 12)),
                          Text(
                            '${staff.s('name')} (you)',
                            style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                          ),
                        ],
                      ),
                    ),
                    const AppIcon('lock', size: 18, color: Tk.ink3),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              FieldX('Customer name', name, required: true, icon: 'user', caps: TextCapitalization.words),
              FieldX(
                'Mobile',
                mobile,
                icon: 'phone',
                keyboard: TextInputType.phone,
                helper: 'Optional – for the customer’s token page.',
              ),
              const SectionTitle('Services'),
              if (services.isEmpty)
                const AppCard(
                  child: EmptyState(
                    icon: 'tag',
                    title: 'No services yet',
                    text: 'No services are linked to you. Ask the owner to add your services.',
                  ),
                )
              else
                for (final s in services)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: CheckboxListTile(
                      value: picked.contains(s.s('id')),
                      onChanged: (on) => setState(() => on == true ? picked.add(s.s('id')) : picked.remove(s.s('id'))),
                      activeColor: b.c,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: BorderSide(color: picked.contains(s.s('id')) ? b.c : Tk.line),
                      ),
                      title: Text(s.s('name'), style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('${s.i('duration')} min · ${money(s.d('price'), widget.currency)}'),
                    ),
                  ),
              if (error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(error, style: const TextStyle(color: Tk.badFg, fontWeight: FontWeight.w600)),
                ),
              const SizedBox(height: 14),
              Btn('Create token', icon: 'plus', busy: busy, expand: true, onPressed: services.isEmpty ? null : _create),
            ],
          );
        },
      ),
    );
  }
}
