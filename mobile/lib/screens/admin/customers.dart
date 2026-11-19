// Super admin → Customers: people who signed up in the BQuee customer app.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';

String _day(int ms) =>
    ms <= 0 ? '—' : dayText(DateTime.fromMillisecondsSinceEpoch(ms).toIso8601String().substring(0, 10));

class AdminCustomers extends StatefulWidget {
  const AdminCustomers({super.key});

  @override
  State<AdminCustomers> createState() => _AdminCustomersState();
}

class _AdminCustomersState extends State<AdminCustomers> {
  String q = '';
  String show = 'all';

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: () => session.api.getJson('/api/admin/customers'),
      builder: (context, d, reload) {
        final b = brandOf(context);
        final all = d.l('customers');
        final week = DateTime.now().millisecondsSinceEpoch - 7 * 86400000;
        final shown = all.where((c) {
          final ok = switch (show) {
            'active' => c.b('active'),
            'disabled' => !c.b('active'),
            'booked' => c.i('tokens') > 0,
            'none' => c.i('tokens') == 0,
            _ => true,
          };
          return ok && textMatches(q, [c.s('name'), c.s('email'), c.s('mobile')]);
        }).toList();
        final isSuper = session.role == 'superadmin';
        return PageScroll(
          title: 'Customers',
          subtitle: 'People who use the BQuee customer app',
          onRefresh: reload,
          children: [
            Figures([
              FigureItem('Customers', '${all.length}', 'users', b.c),
              FigureItem('New this week', '${all.where((c) => c.i('createdAt') >= week).length}', 'sparkle', Tk.green),
              FigureItem('Have booked', '${all.where((c) => c.i('tokens') > 0).length}', 'check', Tk.amber),
              FigureItem('App tokens', '${all.fold<int>(0, (a, c) => a + c.i('tokens'))}', 'ticket', Tk.rose),
            ]),
            const SizedBox(height: 18),
            ListFilters(
              hint: 'Search name, email, phone',
              onSearch: (v) => setState(() => q = v),
              chips: [
                FilterChips<String>(
                  options: const {
                    'all': 'All',
                    'active': 'Active',
                    'disabled': 'Disabled',
                    'booked': 'Have booked',
                    'none': 'Not booked yet',
                  },
                  value: show,
                  onChanged: (v) => setState(() => show = v),
                ),
              ],
            ),
            const SizedBox(height: 16),
            SectionTitle(plural(shown.length, 'customer')),
            if (shown.isEmpty)
              AppCard(
                child: EmptyState(
                  icon: all.isEmpty ? 'users' : 'search',
                  title: all.isEmpty ? 'No customers yet' : 'No customers match',
                  text: all.isEmpty ? 'Customers appear here when they sign up in the BQuee customer app.' : '',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$show'),
                all: shown,
                gap: 14,
                itemBuilder: (c) => ListCard(
                  dim: !c.b('active'),
                  leading: Avatar(c.s('name'), photo: c.s('photo'), size: 52),
                  title: c.s('name'),
                  subtitle: c.s('mobile'),
                  subtitleIcon: 'phone',
                  trailing: c.b('active')
                      ? const Tag('Active', dot: true, tone: TagTone.green)
                      : const Tag('Disabled', dot: true, tone: TagTone.red),
                  detailIcon: 'mail',
                  detail: c.s('email').isEmpty ? 'No email' : c.s('email'),
                  tags: [
                    Tag(plural(c.i('tokens'), 'token'), icon: 'ticket', tone: TagTone.brand),
                    Tag('Joined ${_day(c.i('createdAt'))}', icon: 'calendar'),
                  ],
                  actions: [
                    if (isSuper)
                      CardAction(
                        'power',
                        tooltip: c.b('active') ? 'Disable' : 'Enable',
                        onPressed: () async {
                          if (c.b('active')) {
                            final ok = await confirmDialog(
                              context,
                              title: 'Disable ${c.s('name')}?',
                              message: 'They are signed out of the customer app and can’t sign in or book until you enable them again.',
                              confirm: 'Disable',
                            );
                            if (!ok) return;
                          }
                          if (!context.mounted) return;
                          final r = await runAction(
                            context,
                            () => session.api.put('/api/admin/customers/${c.s('id')}', {'active': !c.b('active')}),
                            done: c.b('active') ? 'Customer disabled' : 'Customer enabled',
                          );
                          if (r != null) reload();
                        },
                      ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}
