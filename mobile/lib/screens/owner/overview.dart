// Owner overview: today's figures, live queue, token numbers (with reset) and staff right now.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';
import '../../ui/token_flow.dart';
import '../shell.dart';
import '../token_actions.dart';
import '../token_detail.dart';
import 'owner_home.dart';

class OwnerOverview extends StatelessWidget {
  const OwnerOverview({super.key});

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: loadOwner,
      every: const Duration(seconds: 15),
      builder: (context, d, reload) => _OverviewBody(d: d, reload: reload),
    );
  }
}

class _OverviewBody extends StatelessWidget {
  final Json d;
  final Future<void> Function() reload;
  const _OverviewBody({required this.d, required this.reload});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final s = d.m('salon');
    final cur = s.s('currency', '₹');
    final st = d.m('stats');
    final branches = d.l('branches');
    final open = d.l('tokens').where((t) => t.s('status') == 'waiting' || t.s('status') == 'serving').toList();
    // Appointments not due yet join the live queue 15 minutes before their time.
    final live = open.where((t) => !t.b('upcoming')).toList();
    final upcoming = open.where((t) => t.b('upcoming')).toList()
      ..sort((a, b) => a.i('appointmentAt').compareTo(b.i('appointmentAt')));
    final shell = context.findAncestorStateOfType<AppShellState>();
    final setup = <MapEntry<String, String>>[
      if (s.s('logo').isEmpty) const MapEntry('Add your logo', 'settings'),
      if (s.s('cover').isEmpty) const MapEntry('Add a cover photo', 'settings'),
      if (d.l('services').isEmpty) const MapEntry('Add services', 'services'),
      if (d.l('staff').isEmpty) const MapEntry('Add staff', 'staff'),
      if (d.l('offers').isEmpty) const MapEntry('Create an offer', 'offers'),
      if (s.s('phone').isEmpty && s.s('whatsapp').isEmpty && s.s('instagram').isEmpty)
        const MapEntry('Add contact links', 'settings'),
    ];

    return PageScroll(
      title: 'Overview',
      subtitle: '${s.s('name')}${s.s('expiresAt').isNotEmpty ? ' · plan valid till ${dayText(s.s('expiresAt'))}' : ''}',
      onRefresh: reload,
      actions: [HeaderAction('camera', tooltip: 'Scan token', label: 'Scan', onPressed: () => ownerScan(context))],
      children: [
        if (setup.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFFF4DE), Color(0xFFFFE9EF)],
              ),
              borderRadius: BorderRadius.circular(Tk.rLg),
              border: Border.all(color: const Color(0xFFF6D9A8)),
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
                        gradient: const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFEA580C)]),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      alignment: Alignment.center,
                      child: const AppIcon('sparkle', size: 18, color: Colors.white, stroke: 2),
                    ),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Text(
                        'Finish setting up',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF8A4B06)),
                      ),
                    ),
                    Pill('${setup.length} left', bg: Colors.white, fg: const Color(0xFF8A4B06)),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final e in setup)
                      Material(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(99),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(99),
                          onTap: () => shell?.go(e.value),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(99),
                              border: Border.all(color: const Color(0xFFF2D3A0)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const AppIcon('plus', size: 14, color: Color(0xFFB45309), stroke: 2.4),
                                const SizedBox(width: 6),
                                Text(
                                  e.key,
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Tk.ink),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
        ],
        Figures([
          FigureItem('Tokens today', '${st.i('total')}', 'ticket', b.c),
          FigureItem('Waiting', '${st.i('waiting')}', 'clock', Tk.amber),
          FigureItem('In service', '${st.i('serving')}', 'play', Tk.sky),
          FigureItem('Completed', '${st.i('done')}', 'check', Tk.green),
          FigureItem('Revenue today', money(st.d('revenue'), cur), 'chart', Tk.rose),
        ]),
        const SizedBox(height: 22),
        SectionTitle('Live queue', sub: 'Waiting and in-service tokens. Refreshes every 15 seconds.'),
        if (live.isEmpty)
          const AppCard(
            child: EmptyState(
              icon: 'check',
              title: 'The queue is clear',
              text: 'New bookings appear here as soon as they’re made.',
            ),
          )
        else
          PagedColumn<Json>(
            all: live,
            itemBuilder: (t) => OwnerTokenCard(t: t, d: d, onChanged: reload),
          ),
        if (upcoming.isNotEmpty) ...[
          const SizedBox(height: 22),
          const SectionTitle(
            'Upcoming appointments',
            sub: 'They join the live queue $kAppointmentLeadMinutes minutes before their time.',
          ),
          PagedColumn<Json>(
            all: upcoming,
            itemBuilder: (t) => OwnerTokenCard(t: t, d: d, onChanged: reload),
          ),
        ],
        const SizedBox(height: 22),
        const SectionTitle('Token numbers', sub: 'Restart at 001 any time. They restart by themselves every day.'),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < branches.length; i++) ...[
                if (i > 0) const Divider(),
                _numbersRow(context, branches[i]),
              ],
            ],
          ),
        ),
        const SizedBox(height: 22),
        const SectionTitle('Staff right now'),
        _staffNow(context),
      ],
    );
  }

  Widget _numbersRow(BuildContext context, Json br) {
    final b = brandOf(context);
    final n = d.m('numbers').m(br.s('id'));
    final last = n.i('last');
    final next = n.i('next', 1);
    String no(int x) => tokenNo({'prefix': br.s('prefix'), 'number': x});
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (d.l('branches').length > 1)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(br.s('name'), style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Last today', style: TextStyle(color: Tk.ink3, fontSize: 12)),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        last > 0 ? no(last) : '—',
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Tk.ink),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 30,
                height: 30,
                margin: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(color: b.tint, shape: BoxShape.circle),
                alignment: Alignment.center,
                child: AppIcon('arrow', size: 15, color: b.ink, stroke: 2.2),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Next token', style: TextStyle(color: Tk.ink3, fontSize: 12)),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        no(next),
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: b.ink),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Btn(
            'Reset to ${no(1)}',
            icon: 'refresh',
            kind: BtnKind.soft,
            small: true,
            expand: true,
            onPressed: last == 0
                ? null
                : () async {
                    final open = n.i('open');
                    final ok = await confirmDialog(
                      context,
                      title: 'Restart ${br.s('name')} at ${no(1)}?',
                      message:
                          'The next booking gets ${no(1)}. ${open > 0 ? '${plural(open, 'token is', 'tokens are')} still in the queue and keep their numbers.' : 'Nobody is in the queue right now.'} Numbers also restart by themselves every morning.',
                      confirm: 'Restart numbers',
                      danger: false,
                    );
                    if (!ok || !context.mounted) return;
                    final r = await runAction(
                      context,
                      () => session.api.post('/api/owner/branches/${br.s('id')}/reset-numbers'),
                      done: 'Numbers restarted – next token is ${no(1)}',
                    );
                    if (r != null) reload();
                  },
          ),
          if (n.i('resetAt') > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Restarted at ${clock(n.i('resetAt'))}',
                style: const TextStyle(color: Tk.ink3, fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }

  Widget _staffNow(BuildContext context) {
    final staff = d.l('staff').where((x) => x.b('active', true)).toList();
    if (staff.isEmpty)
      return const AppCard(
        child: EmptyState(icon: 'users', title: 'No staff yet'),
      );
    final branchName = {for (final br in d.l('branches')) br.s('id'): br.s('name')};
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        children: [
          for (var i = 0; i < staff.length; i++) ...[
            if (i > 0) const Divider(indent: 64),
            Builder(
              builder: (context) {
                final x = staff[i];
                final online = x.b('online', true);
                final busy = x.b('busy');
                final color = !online ? Tk.offFg : (busy ? Tk.amber : Tk.green);
                return ListTile(
                  leading: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Avatar(x.s('name'), photo: x.s('photo'), size: 40),
                      Positioned(
                        right: -1,
                        bottom: -1,
                        child: Container(
                          width: 13,
                          height: 13,
                          decoration: BoxDecoration(
                            color: color,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                        ),
                      ),
                    ],
                  ),
                  title: Text(x.s('name'), style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    [
                      !online ? 'Offline' : (busy ? 'Busy' : 'Free'),
                      if (d.l('branches').length > 1) branchName[x.s('branchId')] ?? '',
                    ].where((e) => e.isNotEmpty).join(' · '),
                    style: const TextStyle(fontSize: 12.5, color: Tk.ink3),
                  ),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        x.i('load') > 0 ? waitText(x.i('load')) : '—',
                        style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                      ),
                      const Text('queue', style: TextStyle(color: Tk.ink3, fontSize: 11.5)),
                    ],
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

/// Token card for owner lists, with open / add services / cancel.
class OwnerTokenCard extends StatelessWidget {
  final Json t;
  final Json d;
  final Future<void> Function() onChanged;
  const OwnerTokenCard({super.key, required this.t, required this.d, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final cur = d.m('salon').s('currency', '₹');
    final status = t.s('status');
    final offer = t.mn('offer');
    // Open = still in the queue (waiting or being served), whichever day it was booked for.
    final open = ['waiting', 'serving'].contains(status);
    final appt = t.i('appointmentAt') > 0;
    final branches = d.l('branches');
    final branchName = branches.length > 1
        ? branches.firstWhere((x) => x.s('id') == t.s('branchId'), orElse: () => <String, dynamic>{}).s('name')
        : '';
    // The owner's setting: one Start / Finish for the whole token, or one for each service.
    final whole = wholeTokens(d.m('salon'));
    final live = open;
    final items = t.l('items');
    final running = items.any((i) => i.s('status') == 'in_progress');
    final waiting = items.any((i) => i.s('status') == 'waiting');
    Future<void> act(String action, {int? index}) async {
      if (await tokenAct(context, t.s('id'), action, index: index)) await onChanged();
    }

    return AppCard(
      padding: const EdgeInsets.all(14),
      // Appointment tokens stand out with a warm border.
      accent: appt ? kApptFg : null,
      onTap: () async {
        await openToken(context, t.s('id'));
        onChanged();
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
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: b.ink, letterSpacing: -0.4),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.m('customer').s('name'),
                      style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                    ),
                    Text(
                      [
                        t.m('customer').s('mobile'),
                        clock(t.i('createdAt')),
                        if (branchName.isNotEmpty) branchName,
                      ].join(' · '),
                      style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Pill.status(status),
                  const SizedBox(height: 4),
                  Text(
                    money(t.d('total'), cur),
                    style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (var k = 0; k < items.length; k++)
            _ItemRow(
              item: items[k],
              // Each service has its own Start / Finish unless the business starts whole tokens.
              onStart: !whole && live && items[k].s('status') == 'waiting' ? () => act('start', index: k) : null,
              onFinish: !whole && live && items[k].s('status') == 'in_progress' ? () => act('finish', index: k) : null,
            ),
          if (offer != null || (status == 'waiting' && (t.d('wait') > 0 || t.b('upcoming'))))
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (offer != null)
                    Pill(
                      offer.s('code').isNotEmpty ? offer.s('code') : offer.s('title'),
                      bg: const Color(0xFFFCE7F3),
                      fg: const Color(0xFF9D174D),
                      icon: 'gift',
                    ),
                  if (status == 'waiting')
                    Pill(
                      t.b('upcoming')
                          ? 'joins the queue in ~${waitText(t.d('wait') - kAppointmentLeadMinutes)}'
                          : t.d('wait') > 0
                          ? 'wait ~${waitText(t.d('wait'))}'
                          : 'next up',
                      bg: b.wash,
                      fg: b.ink,
                      icon: 'clock',
                    ),
                ],
              ),
            ),
          if (whole && live && (running || waiting)) ...[
            const SizedBox(height: 12),
            Btn(
              running ? 'Finish' : 'Start',
              icon: running ? 'stop' : 'play',
              kind: running ? BtnKind.danger : BtnKind.primary,
              expand: true,
              onPressed: () => act(running ? 'finish' : 'start'),
            ),
          ],
          if (open) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Btn(
                    'Add services',
                    icon: 'plus',
                    kind: BtnKind.soft,
                    small: true,
                    onPressed: () async {
                      final added = await openAddServices(context, t, cur);
                      if (added) onChanged();
                    },
                  ),
                ),
                if (status == 'waiting') ...[
                  const SizedBox(width: 8),
                  Btn(
                    'Cancel',
                    icon: 'x',
                    kind: BtnKind.danger,
                    small: true,
                    onPressed: () async {
                      final ok = await confirmDialog(
                        context,
                        title: 'Cancel ${tokenNo(t)}?',
                        message: 'The customer leaves the queue and their token stops working.',
                        confirm: 'Cancel token',
                      );
                      if (!ok || !context.mounted) return;
                      final r = await runAction(
                        context,
                        () => session.api.post('/api/token/${t.s('id')}/cancel'),
                        done: 'Token cancelled',
                      );
                      if (r != null) onChanged();
                    },
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// One service on a token card: name · staff, and its status – or its own Start / Finish button.
class _ItemRow extends StatelessWidget {
  final Json item;
  final VoidCallback? onStart;
  final VoidCallback? onFinish;
  const _ItemRow({required this.item, this.onStart, this.onFinish});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: item.s('serviceName'),
                    style: const TextStyle(fontWeight: FontWeight.w500, color: Tk.ink),
                  ),
                  TextSpan(
                    text: ' · ${item.s('staffName')}',
                    style: const TextStyle(color: Tk.ink3),
                  ),
                ],
              ),
              style: const TextStyle(fontSize: 13),
            ),
          ),
          if (onStart != null)
            Btn('Start', icon: 'play', small: true, onPressed: onStart)
          else if (onFinish != null)
            Btn('Finish', icon: 'stop', kind: BtnKind.danger, small: true, onPressed: onFinish)
          else
            Pill.status(item.s('status')),
        ],
      ),
    );
  }
}
