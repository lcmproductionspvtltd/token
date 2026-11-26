// My tokens: every token the customer booked in the app, with live status for today's ones,
// filters (status, business, service) and "Book again". Plus the single-token page.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/core/qr/qr_encode.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'book.dart';
import 'common.dart';

bool _active(Json t) => t.s('status') == 'waiting' || t.s('status') == 'serving';

Tag statusTag(String status) => switch (status) {
  'waiting' => const Tag('Waiting', dot: true, tone: TagTone.amber),
  'serving' => const Tag('In service', dot: true, tone: TagTone.blue),
  'done' => const Tag('Completed', dot: true, tone: TagTone.green),
  'cancelled' => const Tag('Cancelled', dot: true, tone: TagTone.red),
  _ => const Tag('Expired', dot: true),
};

/// "Book again" with the same services at the same branch.
void bookAgain(BuildContext context, Json t) {
  openBooking(
    context,
    t.s('branchId'),
    preselect: {
      for (final i in t.l('items'))
        if (i.s('serviceId').isNotEmpty) i.s('serviceId'),
    },
  );
}

class MyTokensScreen extends StatefulWidget {
  const MyTokensScreen({super.key});

  @override
  State<MyTokensScreen> createState() => _MyTokensScreenState();
}

class _MyTokensScreenState extends State<MyTokensScreen> {
  String q = '';
  String status = 'all';
  String biz = '';
  String service = '';

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      every: const Duration(seconds: 20),
      load: () => session.api.getJson('/api/customer/tokens'),
      builder: (context, d, reload) {
        final b = brandOf(context);
        final all = d.l('tokens');
        final businesses = <String, String>{for (final t in all) t.m('business').s('id'): t.m('business').s('name')};
        final serviceNames = <String>{
          for (final t in all)
            for (final i in t.l('items')) i.s('serviceName'),
        }.toList()..sort();
        final shown = all.where((t) {
          final okStatus = switch (status) {
            'active' => _active(t),
            'done' => t.s('status') == 'done',
            'missed' => t.s('status') == 'missed',
            'cancelled' => t.s('status') == 'cancelled',
            _ => true,
          };
          final okBiz = biz.isEmpty || t.m('business').s('id') == biz;
          final okSvc = service.isEmpty || t.l('items').any((i) => i.s('serviceName') == service);
          return okStatus &&
              okBiz &&
              okSvc &&
              textMatches(q, [
                t.s('label'),
                t.m('business').s('name'),
                t.m('branch').s('name'),
                for (final i in t.l('items')) i.s('serviceName'),
              ]);
        }).toList();
        final live = all.where(_active).toList();
        return PageScroll(
          title: 'My tokens',
          subtitle: live.isEmpty
              ? plural(all.length, 'token') + ' booked'
              : '${plural(live.length, 'token')} in the queue now',
          onRefresh: reload,
          children: [
            if (all.isNotEmpty) ...[
              Figures([
                FigureItem('In queue', '${live.length}', 'clock', b.c),
                FigureItem('Completed', '${all.where((t) => t.s('status') == 'done').length}', 'check', Tk.green),
                FigureItem('Businesses', '${businesses.length}', 'store', Tk.rose),
              ]),
              const SizedBox(height: 18),
              ListFilters(
                hint: 'Search token, business or service',
                onSearch: (v) => setState(() => q = v),
                chips: [
                  FilterRow(
                    children: [
                      FilterDropdown<String>(
                        label: 'Status',
                        icon: 'clock',
                        options: const {
                          'all': 'All',
                          'active': 'In queue',
                          'done': 'Completed',
                          'missed': 'Expired',
                          'cancelled': 'Cancelled',
                        },
                        value: status,
                        onChanged: (v) => setState(() => status = v),
                      ),
                      if (businesses.length > 1)
                        FilterDropdown<String>(
                          label: 'Business',
                          icon: 'store',
                          options: {'': 'All businesses', ...businesses},
                          value: biz,
                          onChanged: (v) => setState(() => biz = v),
                        ),
                      if (serviceNames.length > 1)
                        FilterDropdown<String>(
                          label: 'Service',
                          icon: 'tag',
                          options: {'': 'All services', for (final n in serviceNames) n: n},
                          value: service,
                          onChanged: (v) => setState(() => service = v),
                        ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 4),
              SectionTitle(plural(shown.length, 'token')),
            ],
            if (all.isEmpty)
              AppCard(
                child: EmptyState(
                  icon: 'ticket',
                  title: 'No tokens yet',
                  text: 'Scan a business’s QR code or pick one in Explore to book your first token.',
                  action: Btn(
                    'Explore businesses',
                    icon: 'home',
                    kind: BtnKind.soft,
                    onPressed: () => session.goTab?.call('explore'),
                  ),
                ),
              )
            else if (shown.isEmpty)
              const AppCard(
                child: EmptyState(icon: 'search', title: 'No tokens match', text: 'Try another filter.'),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$status|$biz|$service'),
                all: shown,
                gap: 14,
                itemBuilder: (t) => TokenCard(t: t),
              ),
          ],
        );
      },
    );
  }
}

class TokenCard extends StatelessWidget {
  final Json t;
  const TokenCard({super.key, required this.t});

  @override
  Widget build(BuildContext context) {
    final biz = t.m('business');
    final color = parseHexColor(biz.s('color'), Tk.bqueePurple);
    final active = _active(t);
    final items = t.l('items');
    return AccentScope(
      color: statusAccent(t.s('status')),
      child: ListCard(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TokenScreen(id: t.s('id')))),
        leading: BizMark(logo: biz.s('logo'), color: color, size: 50),
        title: biz.s('name'),
        subtitle: t.i('appointmentAt') > 0
            ? '${t.m('branch').s('name')} · ${appointmentText(t.i('appointmentAt'))}'
            : '${t.m('branch').s('name')} · ${dayText(t.s('date'))}',
        subtitleIcon: 'calendar',
        trailing: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              t.s('label'),
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Brand(color).ink, letterSpacing: -0.3),
            ),
          ],
        ),
        detailIcon: 'tag',
        detail: items.map((i) => i.s('serviceName')).join(', '),
        tags: [
          statusTag(t.s('status')),
          if (t.i('appointmentAt') > 0) const Tag('Appointment', icon: 'calendar', tone: TagTone.amber),
          if (active)
            Tag(
              t.s('status') == 'serving'
                  ? 'Your turn'
                  : t.b('upcoming')
                  ? 'Starts in ~${waitText(t.i('wait'))}'
                  : (t.i('ahead') == 0 ? 'You’re next' : '${t.i('ahead')} ahead · ~${waitText(t.i('wait'))}'),
              icon: 'clock',
              tone: TagTone.brand,
            ),
          if (!active) Tag(money(t.d('total'), biz.s('currency', '₹')), icon: 'tag'),
        ],
        actions: [
          if (!active && t.m('branch').b('active'))
            CardAction('refresh', tooltip: 'Book again', onPressed: () => bookAgain(context, t)),
        ],
      ),
    );
  }
}

/* ---------------- one token ---------------- */

class TokenScreen extends StatelessWidget {
  final String id;
  final bool justBooked;
  const TokenScreen({super.key, required this.id, this.justBooked = false});

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      frame: loadingPage,
      every: const Duration(seconds: 15),
      load: () => session.api.getJson('/api/customer/tokens/$id'),
      builder: (context, d, reload) {
        final t = d.m('token');
        final s = d.m('salon');
        final br = d.m('branch');
        final color = parseHexColor(s.s('color'), Tk.bqueePurple);
        final b = Brand(color);
        final st = t.s('status');
        final active = _active(t);
        final cur = s.s('currency', '₹');
        return Theme(
          data: buildTheme(color),
          child: Scaffold(
            backgroundColor: Tk.canvas,
            appBar: AppBar(
              backgroundColor: Colors.white,
              title: Text(s.s('name'), maxLines: 1, overflow: TextOverflow.ellipsis),
              leading: IconButton(
                icon: const AppIcon('back', size: 22),
                tooltip: 'Back',
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            body: RefreshIndicator(
              onRefresh: reload,
              color: color,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                children: [
                  if (justBooked)
                    Container(
                      margin: const EdgeInsets.only(bottom: 14),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: Tk.doneBg, borderRadius: BorderRadius.circular(16)),
                      child: const Row(
                        children: [
                          AppIcon('check', size: 20, color: Tk.doneFg, stroke: 2.4),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Token booked! Keep this page – your place in the queue updates by itself.',
                              style: TextStyle(color: Tk.doneFg, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    ),
                  // Ticket
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: fade(color, 0.18),
                          blurRadius: 28,
                          offset: const Offset(0, 12),
                          spreadRadius: -12,
                        ),
                      ],
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [b.deep, b.c, b.rose],
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  BizMark(logo: s.s('logo'), color: color, size: 34, onDark: true),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      br.s('name'),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(color: fade(Colors.white, 0.9), fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                  _whitePill(kStatusText[st] ?? st),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Text('Your token', style: TextStyle(color: fade(Colors.white, 0.8), fontSize: 13)),
                              Text(
                                tokenNo(t),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 52,
                                  fontWeight: FontWeight.w800,
                                  height: 1.05,
                                  letterSpacing: -1,
                                ),
                              ),
                              Text(
                                t.i('appointmentAt') > 0
                                    ? 'Appointment · ${appointmentText(t.i('appointmentAt'))}'
                                    : dayText(t.s('date')),
                                style: TextStyle(
                                  color: fade(Colors.white, t.i('appointmentAt') > 0 ? 0.95 : 0.8),
                                  fontSize: 13,
                                  fontWeight: t.i('appointmentAt') > 0 ? FontWeight.w700 : FontWeight.w400,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (active)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                            child: Row(
                              children: [
                                _big(
                                  b,
                                  st == 'serving'
                                      ? 'Now'
                                      : t.b('upcoming')
                                      ? clock(t.i('appointmentAt'))
                                      : (d.i('ahead') == 0 ? 'Next' : '${d.i('ahead')}'),
                                  st == 'serving'
                                      ? 'Your turn'
                                      : t.b('upcoming')
                                      ? 'Appointment'
                                      : 'Ahead of you',
                                ),
                                const SizedBox(width: 10),
                                _big(
                                  b,
                                  st == 'serving' ? '—' : '~${waitText(d.i('wait'))}',
                                  t.b('upcoming') ? 'Starts in' : 'Estimated wait',
                                ),
                              ],
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                          child: Column(
                            children: [
                              for (final i in t.l('items'))
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 6),
                                  child: Row(
                                    children: [
                                      Avatar(i.s('staffName'), photo: d.m('staffPhotos').s(i.s('staffId')), size: 38),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              i.s('serviceName'),
                                              style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                                            ),
                                            Text(
                                              '${i.s('staffName')} · ${i.i('duration')} min · ${kStatusText[i.s('status')] ?? i.s('status')}',
                                              style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Text(
                                        money(i.d('price'), cur),
                                        style: const TextStyle(fontWeight: FontWeight.w600),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const Divider(height: 20, indent: 16, endIndent: 16),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          child: Row(
                            children: [
                              const Text('Total', style: TextStyle(color: Tk.ink3)),
                              if (t.d('discount') > 0)
                                Text(
                                  '  (offer −${money(t.d('discount'), cur)})',
                                  style: const TextStyle(color: Tk.doneFg, fontSize: 12.5),
                                ),
                              const Spacer(),
                              Text(
                                money(t.d('total'), cur),
                                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: b.ink),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (active) ...[
                    const SizedBox(height: 16),
                    AppCard(
                      child: Column(
                        children: [
                          const Text(
                            'Show this to the staff',
                            style: TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'They scan it to start your service.',
                            style: TextStyle(color: Tk.ink3, fontSize: 12.5),
                          ),
                          const SizedBox(height: 14),
                          QrView(data: '$kDefaultServer/t/${t.s('id')}', size: 190),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  AppCard(
                    child: Row(
                      children: [
                        IconChip('pin', color: color, size: 42),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${s.s('name')} · ${br.s('name')}',
                                style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                              ),
                              if (br.s('address').isNotEmpty)
                                Text(br.s('address'), style: const TextStyle(color: Tk.ink3, fontSize: 12.5)),
                            ],
                          ),
                        ),
                        if (br.s('address').isNotEmpty)
                          CardAction(
                            'map',
                            tooltip: 'Open in maps',
                            onPressed: () => Native.openUrl(mapLink(br.s('address'))),
                          ),
                        if (br.s('phone').isNotEmpty) ...[
                          const SizedBox(width: 8),
                          CardAction(
                            'phone',
                            tooltip: 'Call',
                            onPressed: () => Native.openUrl('tel:${br.s('phone').replaceAll(' ', '')}'),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (!active && br.b('active', true))
                    Btn('Book again', icon: 'refresh', expand: true, onPressed: () => bookAgain(context, t))
                  else if (active)
                    Text(
                      'Updates every few seconds · last checked ${clock(DateTime.now().millisecondsSinceEpoch)}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Tk.ink3, fontSize: 12),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _whitePill(String text) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(
      color: fade(Colors.white, 0.2),
      borderRadius: BorderRadius.circular(99),
      border: Border.all(color: fade(Colors.white, 0.35)),
    ),
    child: Text(
      text,
      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12.5),
    ),
  );

  Widget _big(Brand b, String value, String label) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: b.wash,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: b.lineC),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: b.ink),
          ),
          Text(label, style: const TextStyle(color: Tk.ink3, fontSize: 12)),
        ],
      ),
    ),
  );
}
