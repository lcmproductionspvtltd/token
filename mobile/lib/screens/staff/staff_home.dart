// Staff app: my queue, completed today, online/offline, and the scanner
// (first scan starts the customer's service, the next scan finishes it).

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../../ui/token_flow.dart';
import '../common.dart';
import '../reports.dart';
import '../scanner.dart';
import '../shell.dart';
import '../token_detail.dart';
import 'new_token.dart';

class StaffHome extends StatefulWidget {
  const StaffHome({super.key});

  @override
  State<StaffHome> createState() => _StaffHomeState();
}

class _StaffHomeState extends State<StaffHome> {
  final GlobalKey<LoadedState<Json>> queueKey = GlobalKey<LoadedState<Json>>();
  final GlobalKey<LoadedState<Json>> doneKey = GlobalKey<LoadedState<Json>>();

  Future<Json> _load() async {
    final d = await session.api.getJson('/api/staff/queue');
    final s = d.m('salon');
    session.setBusiness(s.s('name'), s.s('logo'), parseHexColor(s.s('color')));
    session.setFeatures(d.m('features'));
    return d;
  }

  Future<void> scan() async {
    final id = await scanToken(context, title: 'Scan to start or finish');
    if (id == null || !mounted) return;
    final r = await runAction(context, () => session.api.post('/api/token/$id/next'), done: null);
    if (r is Map && mounted) {
      final t = asJson(r['token']);
      toast(context, '${tokenNo(t)} · ${r['message'] ?? 'Updated'}');
    }
    queueKey.currentState?.reload();
    doneKey.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return AppShell(
      fab: FloatingActionButton.extended(
        onPressed: scan,
        backgroundColor: b.c,
        foregroundColor: Colors.white,
        elevation: 6,
        icon: const AppIcon('camera', size: 22, color: Colors.white, stroke: 2),
        label: const Text('Scan', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      items: [
        NavItem(
          'queue',
          'My queue',
          'list',
          () => Loaded<Json>(
            key: queueKey,
            load: _load,
            every: const Duration(seconds: 15),
            builder: (c, d, r) => _QueueView(d: d, reload: r, onScan: scan),
          ),
        ),
        NavItem(
          'done',
          'Completed',
          'check',
          () => Loaded<Json>(
            key: doneKey,
            load: _load,
            builder: (c, d, r) => _DoneView(d: d, reload: r),
          ),
        ),
        if (session.staffReports) NavItem('reports', 'Reports', 'chart', () => const ReportsScreen(kind: 'staff')),
      ],
    );
  }
}

List<Json> _mine(Json t, String me) => t.l('items').where((i) => i.s('staffId') == me).toList();

class _QueueView extends StatefulWidget {
  final Json d;
  final Future<void> Function() reload;
  final VoidCallback onScan;
  const _QueueView({required this.d, required this.reload, required this.onScan});

  @override
  State<_QueueView> createState() => _QueueViewState();
}

class _QueueViewState extends State<_QueueView> {
  String busyId = '';

  Future<void> _act(Json t, String action, {int? index}) async {
    setState(() => busyId = t.s('id'));
    final r = await runAction(
      context,
      () => session.api.post('/api/token/${t.s('id')}/$action', index == null ? <String, dynamic>{} : {'index': index}),
      done: null,
    );
    if (r is Map && mounted) toast(context, '${tokenNo(t)} · ${r['message'] ?? 'Updated'}');
    if (mounted) setState(() => busyId = '');
    await widget.reload();
  }

  Future<void> _setOnline(bool online) async {
    final r = await runAction(
      context,
      () => session.api.put('/api/staff/status', {'online': online}),
      done: online ? 'You’re online – customers can book you' : 'You’re offline – new bookings skip you',
    );
    if (r != null) await widget.reload();
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final d = widget.d;
    final staff = d.m('staff');
    final me = staff.s('id');
    final cur = d.m('salon').s('currency', '₹');
    final tokens = d.l('tokens');
    final serving = tokens.where((t) => _mine(t, me).any((i) => i.s('status') == 'in_progress')).toList();
    final waiting = tokens
        .where(
          (t) =>
              !['cancelled', 'missed', 'done'].contains(t.s('status')) &&
              _mine(t, me).any((i) => i.s('status') == 'waiting') &&
              !serving.contains(t),
        )
        .toList();
    // Appointments not due yet: shown apart, soonest first. They join the queue 15 minutes before.
    final upcoming = waiting.where((t) => t.b('upcoming')).toList()
      ..sort((a, b) => a.i('appointmentAt').compareTo(b.i('appointmentAt')));
    waiting.removeWhere((t) => t.b('upcoming'));
    final stats = d.m('stats');
    final online = staff.b('online', true);
    final busy = staff.b('busy');
    final presence = !online ? 'off' : (busy ? 'busy' : 'on');
    final presenceColor = presence == 'off' ? Tk.offFg : (presence == 'busy' ? Tk.amber : Tk.green);

    return PageScroll(
      title: 'My queue',
      subtitle: '${staff.s('name')} · ${d.m('branch').s('name')}',
      onRefresh: widget.reload,
      children: [
        AppCard(
          color: presence == 'off'
              ? Tk.porcelain
              : (presence == 'busy' ? const Color(0xFFFFF6E5) : const Color(0xFFEFFAF3)),
          child: Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: presenceColor,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: fade(presenceColor, 0.5), blurRadius: 8)],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      presence == 'off'
                          ? 'You’re offline'
                          : (presence == 'busy' ? 'You’re busy – serving a customer' : 'You’re online'),
                      style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                    ),
                    Text(
                      presence == 'off'
                          ? 'Customers can’t book you. Switch on when you’re back.'
                          : 'Customers can book you. Scanning a token to start makes you busy automatically.',
                      style: const TextStyle(color: Tk.ink2, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              Switch(value: online, onChanged: _setOnline),
            ],
          ),
        ),
        const SizedBox(height: 14),
        InkWell(
          onTap: widget.onScan,
          borderRadius: BorderRadius.circular(Tk.rLg),
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: b.gradBtn,
              borderRadius: BorderRadius.circular(Tk.rLg),
              boxShadow: [
                BoxShadow(color: fade(b.c, 0.4), blurRadius: 24, offset: const Offset(0, 12), spreadRadius: -12),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: fade(Colors.white, 0.18), borderRadius: BorderRadius.circular(14)),
                  alignment: Alignment.center,
                  child: const AppIcon('camera', size: 24, color: Colors.white, stroke: 2),
                ),
                const SizedBox(width: 14),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Scan a customer’s token',
                        style: TextStyle(color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w700),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'The first scan starts their service, the next scan finishes it.',
                        style: TextStyle(color: Color(0xDDFFFFFF), fontSize: 12.5),
                      ),
                    ],
                  ),
                ),
                const AppIcon('chevr', size: 20, color: Colors.white),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        Btn(
          'New token for a walk-in',
          icon: 'plus',
          kind: BtnKind.soft,
          expand: true,
          onPressed: () async {
            if (await openNewToken(context, cur)) await widget.reload();
          },
        ),
        const SizedBox(height: 14),
        Figures([
          FigureItem('Waiting for me', '${stats.i('waiting')}', 'clock', Tk.amber),
          FigureItem('In service', '${stats.i('serving')}', 'play', Tk.sky),
          FigureItem('Completed', '${stats.i('done')}', 'check', Tk.green),
          FigureItem('My queue time', stats.i('load') > 0 ? waitText(stats.i('load')) : '—', 'clock', b.c),
        ]),
        const SizedBox(height: 22),
        if (serving.isNotEmpty) ...[
          const SectionTitle('Serving now'),
          for (final t in serving) ...[_tokenCard(context, t, me, cur, serving: true), const SizedBox(height: 10)],
          const SizedBox(height: 12),
        ],
        SectionTitle('Customers waiting for me', sub: waiting.isEmpty ? null : plural(waiting.length, 'customer')),
        if (waiting.isEmpty)
          const AppCard(
            child: EmptyState(
              icon: 'check',
              title: 'Nobody waiting for you',
              text: 'New bookings for you appear here by themselves.',
            ),
          )
        else
          PagedColumn<Json>(all: waiting, itemBuilder: (t) => _tokenCard(context, t, me, cur)),
        if (upcoming.isNotEmpty) ...[
          const SizedBox(height: 22),
          SectionTitle(
            'Upcoming appointments',
            sub: 'Join your queue $kAppointmentLeadMinutes minutes before their time',
          ),
          PagedColumn<Json>(all: upcoming, itemBuilder: (t) => _tokenCard(context, t, me, cur)),
        ],
      ],
    );
  }

  Widget _tokenCard(BuildContext context, Json t, String me, String cur, {bool serving = false}) {
    final b = brandOf(context);
    final mine = _mine(t, me);
    final running = mine.any((i) => i.s('status') == 'in_progress');
    final isBusy = busyId == t.s('id');
    // The owner's setting: one Start / Finish for the whole token, or one for each service.
    final whole = wholeTokens(widget.d.m('salon'));
    final open = !['cancelled', 'missed', 'done'].contains(t.s('status'));
    final items = t.l('items');
    // (index on the token, service) for each of this staff member's services.
    final mineAt = [for (var k = 0; k < items.length; k++) if (items[k].s('staffId') == me) (k, items[k])];
    final all = mine.where((i) => i.s('status') == (running ? 'in_progress' : 'waiting')).length > 1 ? ' all' : '';
    final offer = t.mn('offer');
    final appt = t.i('appointmentAt') > 0;
    final upcoming = t.b('upcoming');
    return AppCard(
      padding: const EdgeInsets.all(14),
      borderColor: serving ? b.lineC : null,
      // Appointment tokens stand out with a warm left edge.
      accent: appt ? kApptFg : null,
      onTap: () async {
        await openToken(context, t.s('id'));
        widget.reload();
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (appt) ...[ApptPill(t), const SizedBox(height: 8)],
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                tokenNo(t),
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: b.ink, letterSpacing: -0.5),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.m('customer').s('name'),
                      style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink, fontSize: 15),
                    ),
                    Text(t.m('customer').s('mobile'), style: const TextStyle(color: Tk.ink3, fontSize: 12.5)),
                    if (offer != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Pill(
                          offer.s('code').isNotEmpty ? offer.s('code') : offer.s('title'),
                          bg: const Color(0xFFFCE7F3),
                          fg: const Color(0xFF9D174D),
                          icon: 'gift',
                        ),
                      ),
                  ],
                ),
              ),
              if (!serving && t.s('status') == 'waiting')
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      upcoming
                          ? clock(t.i('appointmentAt'))
                          : t.d('wait') > 0
                          ? '~${waitText(t.d('wait'))}'
                          : 'Next',
                      style: TextStyle(fontWeight: FontWeight.w700, color: b.ink),
                    ),
                    Text(
                      upcoming
                          ? 'in ~${waitText(t.d('wait'))}'
                          : t.i('ahead') > 0
                          ? '${t.i('ahead')} ahead'
                          : 'up next',
                      style: const TextStyle(color: Tk.ink3, fontSize: 12),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              for (final (k, i) in mineAt)
                Container(
                  padding: const EdgeInsets.fromLTRB(10, 5, 6, 5),
                  decoration: BoxDecoration(color: b.wash, borderRadius: BorderRadius.circular(10)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        i.s('serviceName'),
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Tk.ink),
                      ),
                      const SizedBox(width: 6),
                      // Each service has its own Start / Finish unless the business starts whole tokens.
                      if (!whole && open && i.s('status') == 'waiting')
                        Btn(
                          'Start',
                          icon: 'play',
                          small: true,
                          busy: isBusy,
                          onPressed: () => _act(t, 'start', index: k),
                        )
                      else if (!whole && open && i.s('status') == 'in_progress')
                        Btn(
                          'Finish',
                          icon: 'stop',
                          kind: BtnKind.dark,
                          small: true,
                          busy: isBusy,
                          onPressed: () => _act(t, 'finish', index: k),
                        )
                      else
                        Pill.status(i.s('status')),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              if (whole && open) ...[
                Expanded(
                  child: running
                      ? Btn(
                          'Finish$all',
                          icon: 'stop',
                          kind: BtnKind.dark,
                          small: true,
                          busy: isBusy,
                          onPressed: () => _act(t, 'finish'),
                        )
                      : Btn('Start$all', icon: 'play', small: true, busy: isBusy, onPressed: () => _act(t, 'start')),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Btn(
                  'Add service',
                  icon: 'plus',
                  kind: BtnKind.soft,
                  small: true,
                  onPressed: () async {
                    final added = await openAddServices(context, t, cur);
                    if (added) widget.reload();
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DoneView extends StatelessWidget {
  final Json d;
  final Future<void> Function() reload;
  const _DoneView({required this.d, required this.reload});

  @override
  Widget build(BuildContext context) {
    final me = d.m('staff').s('id');
    final cur = d.m('salon').s('currency', '₹');
    final done = d.l('tokens').where((t) {
      final mine = _mine(t, me);
      return mine.isNotEmpty && mine.every((i) => i.s('status') == 'done' || i.s('status') == 'removed');
    }).toList();
    final earned = done.fold<double>(
      0,
      (a, t) => a + _mine(t, me).where((i) => i.s('status') == 'done').fold<double>(0, (x, i) => x + i.d('price')),
    );
    return PageScroll(
      title: 'Completed today',
      subtitle: '${plural(done.length, 'customer')} · ${money(earned, cur)}',
      onRefresh: reload,
      children: [
        if (done.isEmpty)
          const AppCard(
            child: EmptyState(
              icon: 'check',
              title: 'Nothing completed yet',
              text: 'Customers you finish today are listed here.',
            ),
          )
        else
          PagedColumn<Json>(
            all: done,
            itemBuilder: (t) => AppCard(
              padding: const EdgeInsets.all(14),
              onTap: () => openToken(context, t.s('id')),
              child: Row(
                children: [
                  Text(
                    tokenNo(t),
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: brandOf(context).ink),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          t.m('customer').s('name'),
                          style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                        ),
                        Text(
                          _mine(t, me).map((i) => i.s('serviceName')).join(', '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                  Pill.status('done'),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
