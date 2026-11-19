// Book a token at one branch: services → staff member (optional) → confirm.
// Same rules as the web booking form: a one-service business skips the services step,
// a one-staff business skips the staff step. The customer's own details come from their profile.

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'common.dart';
import 'tokens.dart';

/// Opens booking for a branch. [preselect] = service ids to start with (used by "Book again").
Future<void> openBooking(BuildContext context, String branchId, {Set<String> preselect = const {}}) {
  return Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => BookScreen(branchId: branchId, preselect: preselect),
    ),
  );
}

class BookScreen extends StatelessWidget {
  final String branchId;
  final Set<String> preselect;
  const BookScreen({super.key, required this.branchId, this.preselect = const {}});

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      frame: loadingPage,
      load: () => session.api.getJson('/api/public/branch/${Uri.encodeComponent(branchId)}'),
      builder: (context, d, reload) {
        final color = parseHexColor(d.m('salon').s('color'), Tk.bqueePurple);
        return Theme(
          data: buildTheme(color),
          child: _BookFlow(d: d, branchId: branchId, preselect: preselect),
        );
      },
    );
  }
}

const _stepLabels = {1: 'Services', 2: 'Staff member', 3: 'Confirm'};
String _catOf(Json x) => x.s('category').isEmpty ? 'Other' : x.s('category');

class _BookFlow extends StatefulWidget {
  final Json d;
  final String branchId;
  final Set<String> preselect;
  const _BookFlow({required this.d, required this.branchId, required this.preselect});

  @override
  State<_BookFlow> createState() => _BookFlowState();
}

class _BookFlowState extends State<_BookFlow> {
  late final Json s = widget.d.m('salon');
  late final List<Json> staff = widget.d.l('staff');
  late final List<Json> services;
  late final List<int> flow;
  late int step;
  final Set<String> sel = {};
  final Set<String> stSel = {};
  String q = '';
  String cat = 'all';
  bool busy = false;

  bool get singleService => s.s('serviceMode') == 'single';
  bool get singleStaff => s.s('staffMode') == 'single';
  String get cur => s.s('currency', '₹');

  List<Json> staffFor(String sid) => staff.where((st) => st.ls('serviceIds').contains(sid)).toList();
  List<Json> availableFor(String sid) => staffFor(sid).where((st) => st['online'] != false).toList();

  @override
  void initState() {
    super.initState();
    services = widget.d.l('services').where((x) => staffFor(x.s('id')).isNotEmpty).toList();
    final auto = singleService && services.length == 1 && availableFor(services.first.s('id')).isNotEmpty
        ? services.first
        : null;
    flow = [if (auto == null) 1, if (!singleStaff) 2, 3];
    if (auto != null) sel.add(auto.s('id'));
    // "Book again": start with the same services when they can still be booked.
    final again = widget.preselect
        .where((id) => services.any((x) => x.s('id') == id) && availableFor(id).isNotEmpty)
        .toList();
    if (again.isNotEmpty) sel.addAll(singleService ? [again.first] : again);
    step = again.isNotEmpty && flow.length > 1 ? flow[1] : flow.first;
  }

  int get at => flow.indexOf(step) < 0 ? 0 : flow.indexOf(step);

  /// Each chosen service goes to the staff member with the shortest queue (chosen staff first).
  List<({Json svc, Json st, bool pref, int wait})> get plan {
    final extra = <String, int>{};
    final out = <({Json svc, Json st, bool pref, int wait})>[];
    for (final x in services) {
      if (!sel.contains(x.s('id'))) continue;
      final eligible = availableFor(x.s('id'));
      if (eligible.isEmpty) continue;
      final preferred = eligible.where((st) => stSel.contains(st.s('id'))).toList();
      final pool = preferred.isNotEmpty ? preferred : eligible;
      pool.sort((a, b) => (a.i('wait') + (extra[a.s('id')] ?? 0)).compareTo(b.i('wait') + (extra[b.s('id')] ?? 0)));
      final st = pool.first;
      extra[st.s('id')] = (extra[st.s('id')] ?? 0) + x.i('duration');
      out.add((svc: x, st: st, pref: preferred.isNotEmpty, wait: st.i('wait')));
    }
    return out;
  }

  void _toggle(Json x) {
    final id = x.s('id');
    setState(() {
      if (singleService) {
        sel
          ..clear()
          ..add(id);
      } else if (!sel.remove(id)) {
        sel.add(id);
      }
    });
  }

  Future<void> _next() async {
    if (sel.isEmpty) {
      toast(context, 'Choose a service first', error: true);
      return;
    }
    if (step != 3) {
      setState(() => step = flow[at + 1]);
      return;
    }
    setState(() => busy = true);
    try {
      final r = asJson(
        await session.api.post('/api/customer/book', {
          'branchId': widget.branchId,
          'items': [
            for (final p in plan) {'serviceId': p.svc.s('id'), 'staffId': p.pref ? p.st.s('id') : 'any'},
          ],
        }),
      );
      session.bookedToken();
      if (!mounted) return;
      Navigator.of(context)
          .pushReplacement(MaterialPageRoute(builder: (_) => TokenScreen(id: r.s('id'), justBooked: true)));
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => busy = false);
        toast(context, e.message, error: true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => busy = false);
        showError(context, e);
      }
    }
  }

  void _back() {
    if (at > 0) {
      setState(() => step = flow[at - 1]);
    } else {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final d = widget.d;
    final p = plan;
    final total = p.fold<double>(0, (a, x) => a + x.svc.d('price'));
    final minutes = p.fold<int>(0, (a, x) => a + x.svc.i('duration'));
    final wait = p.fold<int>(0, (a, x) => x.wait > a ? x.wait : a);

    Widget body;
    if (!d.b('open')) {
      body = const _Closed(text: 'This business isn’t taking tokens right now. Please try again later.');
    } else if (services.isEmpty) {
      body = const _Closed(text: 'No services can be booked at this branch right now.');
    } else {
      body = switch (step) {
        1 => _servicesStep(b),
        2 => _staffStep(b),
        _ => _confirmStep(b, p, total, minutes, wait),
      };
    }

    final canBook = d.b('open') && services.isNotEmpty;
    return PopScope(
      canPop: at == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        backgroundColor: Tk.canvas,
        appBar: AppBar(
          backgroundColor: Colors.white,
          leading: IconButton(
            icon: const AppIcon('back', size: 22),
            tooltip: at > 0 ? 'Previous step' : 'Back',
            onPressed: _back,
          ),
          titleSpacing: 0,
          title: Row(
            children: [
              BizMark(logo: s.s('logo'), color: b.c, size: 34),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.s('name'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                    Text(
                      d.m('branch').s('name'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: Tk.ink3),
                    ),
                  ],
                ),
              ),
            ],
          ),
          bottom: canBook && flow.length > 1
              ? PreferredSize(
                  preferredSize: const Size.fromHeight(46),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: Row(
                      children: [
                        for (var i = 0; i < flow.length; i++) ...[
                          if (i > 0)
                            Expanded(
                              child: Container(
                                height: 2,
                                margin: const EdgeInsets.symmetric(horizontal: 6),
                                color: i <= at ? b.c : Tk.line,
                              ),
                            ),
                          _StepDot(n: i + 1, label: _stepLabels[flow[i]]!, on: i == at, done: i < at),
                        ],
                      ],
                    ),
                  ),
                )
              : null,
        ),
        body: SafeArea(child: body),
        bottomNavigationBar: canBook
            ? SafeArea(
                child: Container(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    border: Border(top: BorderSide(color: Tk.line)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              p.isEmpty ? 'Nothing chosen yet' : '${money(total, cur)} · $minutes min',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15.5,
                                color: p.isEmpty ? Tk.ink3 : b.ink,
                              ),
                            ),
                            if (p.isNotEmpty)
                              Text(
                                '${plural(p.length, 'service')} · wait ~${waitText(wait)}',
                                style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Btn(
                        step == 3 ? 'Book my token' : (step == 2 && stSel.isEmpty ? 'Any staff' : 'Continue'),
                        iconRight: step == 3 ? 'check' : 'arrow',
                        busy: busy,
                        onPressed: sel.isEmpty ? null : _next,
                      ),
                    ],
                  ),
                ),
              )
            : null,
      ),
    );
  }

  /* ---------- step: services ---------- */
  Widget _servicesStep(Brand b) {
    final cats = services.map(_catOf).toSet().toList();
    final shown = services
        .where(
          (x) =>
              (cat == 'all' || _catOf(x) == cat) && textMatches(q, [x.s('name'), x.s('category'), x.s('description')]),
        )
        .toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        Text(
          'What would you like?',
          style: TextStyle(fontFamily: Tk.serif, fontSize: 24, fontWeight: FontWeight.w600, color: b.ink),
        ),
        const SizedBox(height: 4),
        Text(singleService ? 'Pick a service.' : 'Pick one or more services.', style: const TextStyle(color: Tk.ink3)),
        const SizedBox(height: 14),
        ListFilters(
          hint: 'Search services',
          onSearch: (v) => setState(() => q = v),
          chips: [
            if (cats.length > 1)
              FilterChips<String>(
                options: {'all': 'All', for (final c in cats) c: c},
                value: cat,
                onChanged: (v) => setState(() => cat = v),
              ),
          ],
        ),
        if (shown.isEmpty)
          const AppCard(
            child: EmptyState(icon: 'search', title: 'No services match', text: 'Try another word or category.'),
          ),
        for (final x in shown) _serviceTile(b, x),
      ],
    );
  }

  Widget _serviceTile(Brand b, Json x) {
    final on = sel.contains(x.s('id'));
    final none = availableFor(x.s('id')).isEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Opacity(
        opacity: none ? 0.55 : 1,
        child: Material(
          color: on ? b.wash : Colors.white,
          borderRadius: BorderRadius.circular(18),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: none ? null : () => _toggle(x),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: on ? b.c : Tk.line, width: on ? 1.8 : 1.2),
              ),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: SizedBox(
                      width: 56,
                      height: 56,
                      child: NetImage(
                        x.s('image'),
                        fallback: Container(
                          color: b.tint,
                          alignment: Alignment.center,
                          child: AppIcon('sparkle', size: 24, color: b.c),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          x.s('name'),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink, fontSize: 15),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          none
                              ? 'No one free for this right now'
                              : '${x.i('duration')} min${x.s('category').isEmpty ? '' : ' · ${x.s('category')}'}',
                          style: TextStyle(color: none ? Tk.badFg : Tk.ink3, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        money(x.d('price'), cur),
                        style: TextStyle(fontWeight: FontWeight.w700, color: b.ink),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          shape: singleService ? BoxShape.circle : BoxShape.rectangle,
                          borderRadius: singleService ? null : BorderRadius.circular(7),
                          color: on ? b.c : Colors.white,
                          border: Border.all(color: on ? b.c : Tk.line2, width: 1.5),
                        ),
                        alignment: Alignment.center,
                        child: on ? const AppIcon('check', size: 14, color: Colors.white, stroke: 2.6) : null,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /* ---------- step: staff ---------- */
  Widget _staffStep(Brand b) {
    final relevant = staff.where((st) => sel.any((sid) => st.ls('serviceIds').contains(sid))).toList();
    Widget card({
      required bool on,
      required Widget leading,
      required String title,
      required String sub,
      VoidCallback? onTap,
      bool dim = false,
    }) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Opacity(
        opacity: dim ? 0.5 : 1,
        child: Material(
          color: on ? b.wash : Colors.white,
          borderRadius: BorderRadius.circular(18),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: on ? b.c : Tk.line, width: on ? 1.8 : 1.2),
              ),
              child: Row(
                children: [
                  leading,
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink, fontSize: 15),
                        ),
                        Text(sub, style: const TextStyle(color: Tk.ink3, fontSize: 12.5)),
                      ],
                    ),
                  ),
                  if (on) AppIcon('check', size: 20, color: b.c, stroke: 2.4),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        Text(
          'Who would you like?',
          style: TextStyle(fontFamily: Tk.serif, fontSize: 24, fontWeight: FontWeight.w600, color: b.ink),
        ),
        const SizedBox(height: 4),
        const Text('Optional. Pick someone, or let the first free person serve you.', style: TextStyle(color: Tk.ink3)),
        const SizedBox(height: 16),
        card(
          on: stSel.isEmpty,
          leading: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(gradient: b.gradBtn, shape: BoxShape.circle),
            alignment: Alignment.center,
            child: const AppIcon('users', size: 22, color: Colors.white),
          ),
          title: 'Any staff member',
          sub: 'Fastest – whoever is free first',
          onTap: () => setState(stSel.clear),
        ),
        for (final st in relevant)
          Builder(
            builder: (context) {
              final offline = st['online'] == false;
              final on = stSel.contains(st.s('id')) && !offline;
              return card(
                on: on,
                dim: offline,
                leading: Avatar(st.s('name'), photo: st.s('photo'), size: 48),
                title: st.s('name'),
                sub: offline
                    ? 'Not available now'
                    : [
                        if (st.s('title').isNotEmpty) st.s('title'),
                        st.b('busy') ? 'busy · ~${waitText(st.i('wait'))}' : 'free now',
                      ].join(' · '),
                onTap: offline
                    ? null
                    : () => setState(() {
                        if (!stSel.remove(st.s('id'))) stSel.add(st.s('id'));
                      }),
              );
            },
          ),
      ],
    );
  }

  /* ---------- step: confirm ---------- */
  Widget _confirmStep(
    Brand b,
    List<({Json svc, Json st, bool pref, int wait})> p,
    double total,
    int minutes,
    int wait,
  ) {
    final me = session.user ?? <String, dynamic>{};
    final next = widget.d.i('nextNumber', 1);
    final prefix = widget.d.m('branch').s('prefix');
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        Text(
          'Check and book',
          style: TextStyle(fontFamily: Tk.serif, fontSize: 24, fontWeight: FontWeight.w600, color: b.ink),
        ),
        const SizedBox(height: 14),
        // Draft ticket
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(22),
            boxShadow: [
              BoxShadow(color: fade(b.c, 0.16), blurRadius: 24, offset: const Offset(0, 10), spreadRadius: -12),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                decoration: BoxDecoration(gradient: b.gradBtn),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Your token number', style: TextStyle(color: Colors.white, fontSize: 13)),
                          Text(
                            'Confirmed when you book',
                            style: TextStyle(color: fade(Colors.white, 0.75), fontSize: 11.5),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      tokenNo({'prefix': prefix, 'number': next}),
                      style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
              for (final x in p)
                ListTile(
                  leading: Avatar(x.st.s('name'), photo: x.st.s('photo'), size: 38),
                  title: Text(x.svc.s('name'), style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(singleStaff || x.pref ? x.st.s('name') : '${x.st.s('name')} (first free)'),
                  trailing: Text(money(x.svc.d('price'), cur), style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    _sum('Total', money(total, cur), b),
                    _sum('Time', '$minutes min', b),
                    _sum('Wait', '~${waitText(wait)}', b),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        AppCard(
          child: Row(
            children: [
              Avatar(me.s('name', '?'), photo: me.s('photo'), size: 46),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Booking for', style: TextStyle(color: Tk.ink3, fontSize: 12)),
                    Text(
                      me.s('name'),
                      style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                    ),
                    Text(
                      [me.s('mobile'), me.s('email')].where((e) => e.isNotEmpty).join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        const Text(
          'The business uses your mobile number only to reach you about this visit.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Tk.ink3, fontSize: 12),
        ),
      ],
    );
  }

  Widget _sum(String label, String value, Brand b) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Tk.ink3, fontSize: 12)),
        Text(
          value,
          style: TextStyle(fontWeight: FontWeight.w700, color: b.ink, fontSize: 15.5),
        ),
      ],
    ),
  );
}

class _StepDot extends StatelessWidget {
  final int n;
  final String label;
  final bool on;
  final bool done;
  const _StepDot({required this.n, required this.label, required this.on, required this.done});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: on || done ? b.c : Colors.white,
            border: Border.all(color: on || done ? b.c : Tk.line2, width: 1.5),
          ),
          alignment: Alignment.center,
          child: done
              ? const AppIcon('check', size: 13, color: Colors.white, stroke: 2.6)
              : Text(
                  '$n',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: on ? Colors.white : Tk.ink3),
                ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: on ? FontWeight.w700 : FontWeight.w500,
            color: on ? b.ink : Tk.ink3,
          ),
        ),
      ],
    );
  }
}

class _Closed extends StatelessWidget {
  final String text;
  const _Closed({required this.text});

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const SizedBox(height: 40),
      AppCard(
        child: EmptyState(icon: 'clock', title: 'Booking is closed', text: text),
      ),
    ],
  );
}
