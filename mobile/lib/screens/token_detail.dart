// One token, as staff and owners see it after scanning or tapping it: services with
// start / finish / remove, add services, cancel (owner), the offer and the totals.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'common.dart';

Future<void> openToken(BuildContext context, String id) {
  return Navigator.of(context).push(MaterialPageRoute(builder: (_) => TokenDetail(id: id)));
}

class TokenDetail extends StatefulWidget {
  final String id;
  const TokenDetail({super.key, required this.id});

  @override
  State<TokenDetail> createState() => _TokenDetailState();
}

class _TokenDetailState extends State<TokenDetail> {
  final GlobalKey<LoadedState<Json>> _loaded = GlobalKey<LoadedState<Json>>();
  bool busy = false;

  Future<Json> _load() => session.api.getJson('/api/public/token/${widget.id}');

  Future<void> _act(String action, {int? index}) async {
    setState(() => busy = true);
    await runAction(
      context,
      () => session.api.post('/api/token/${widget.id}/$action', index == null ? <String, dynamic>{} : {'index': index}),
    );
    if (mounted) setState(() => busy = false);
    await _loaded.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const AppIcon('back', size: 22),
          onPressed: () => Navigator.pop(context),
          tooltip: 'Back',
        ),
        title: const Text('Token'),
      ),
      body: Loaded<Json>(
        key: _loaded,
        load: _load,
        every: const Duration(seconds: 15),
        builder: (context, d, reload) => RefreshIndicator(onRefresh: reload, child: _body(context, d)),
      ),
    );
  }

  Widget _body(BuildContext context, Json d) {
    final b = brandOf(context);
    final t = d.m('token');
    final s = d.m('salon');
    final branch = d.m('branch');
    final cur = s.s('currency', '₹');
    final items = t.l('items');
    final status = t.s('status');
    final user = session.user ?? <String, dynamic>{};
    final isOwner = session.role == 'owner';
    // Open tokens stay editable until they're finished, cancelled or expire – whichever day they were booked.
    final editable = !['cancelled', 'missed'].contains(status);
    final appt = t.i('appointmentAt') > 0;
    final upcoming = t.b('upcoming');
    bool mine(Json it) => isOwner || it.s('staffId') == user.s('staffId');
    // The business's setting: one Start / Finish for the whole token, or one for each service.
    final whole = s.s('tokenFlow') == 'whole';
    final myRunning = items.where((i) => mine(i) && i.s('status') == 'in_progress').length;
    final myWaiting = items.where((i) => mine(i) && i.s('status') == 'waiting').length;
    final offer = t.mn('offer');
    final discount = t.d('discount');
    final waitValue = upcoming
        ? clock(t.i('appointmentAt'))
        : status == 'waiting'
        ? waitText(d.d('wait'))
        : status == 'serving'
        ? 'Now'
        : status == 'done'
        ? 'Done'
        : '—';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        // ticket header
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [b.deep, b.c, b.rose],
              stops: const [0, 0.6, 1],
            ),
            borderRadius: BorderRadius.circular(Tk.rXl),
            boxShadow: [
              BoxShadow(color: fade(b.c, 0.4), blurRadius: 30, offset: const Offset(0, 14), spreadRadius: -14),
            ],
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      branch.s('name', s.s('name')),
                      style: TextStyle(color: fade(Colors.white, 0.8), fontWeight: FontWeight.w500),
                    ),
                  ),
                  Pill.status(status),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                tokenNo(t),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 48,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                t.m('customer').s('name'),
                style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
              ),
              Text(t.m('customer').s('mobile'), style: TextStyle(color: fade(Colors.white, 0.8))),
              const SizedBox(height: 16),
              Row(
                children: [
                  _stat(upcoming ? 'Appointment' : 'Wait', waitValue),
                  _stat('Ahead', status == 'waiting' && !upcoming ? '${d.i('ahead')}' : '—'),
                  _stat('Booked', clock(t.i('createdAt'))),
                ],
              ),
            ],
          ),
        ),
        if (appt) ...[
          const SizedBox(height: 14),
          Center(child: ApptPill(t)),
          if (upcoming)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Joins the queue $kAppointmentLeadMinutes minutes before this time.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
              ),
            ),
        ],
        const SizedBox(height: 18),
        SectionTitle('Services', sub: plural(items.length, 'service')),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var k = 0; k < items.length; k++) ...[
                if (k > 0) const Divider(),
                _itemRow(context, items[k], k, mine(items[k]), editable, cur, whole: whole),
              ],
              if (offer != null)
                Container(
                  margin: const EdgeInsets.fromLTRB(14, 6, 14, 6),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: b.wash,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: b.lineC),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(gradient: b.gradBtn, borderRadius: BorderRadius.circular(12)),
                        alignment: Alignment.center,
                        child: const AppIcon('gift', size: 19, color: Colors.white, stroke: 2),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              offer.s('title'),
                              style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                            ),
                            Text(
                              [
                                if (offer.s('code').isNotEmpty) 'Code ${offer.s('code')}',
                                discount > 0 ? 'Discount applied' : 'Apply it at the desk',
                              ].join(' · '),
                              style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                            ),
                          ],
                        ),
                      ),
                      if (discount > 0)
                        Text(
                          '−${money(discount, cur)}',
                          style: const TextStyle(color: Tk.green, fontWeight: FontWeight.w700),
                        ),
                    ],
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Total',
                        style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink2),
                      ),
                    ),
                    if (discount > 0)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Text(
                          money(t.d('subtotal'), cur),
                          style: const TextStyle(color: Tk.ink3, decoration: TextDecoration.lineThrough),
                        ),
                      ),
                    Text(
                      money(t.d('total'), cur),
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Tk.ink),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (whole && editable && (myRunning > 0 || myWaiting > 0)) ...[
          Btn(
            myRunning > 0 ? (myRunning > 1 ? 'Finish all' : 'Finish') : (myWaiting > 1 ? 'Start all' : 'Start'),
            icon: myRunning > 0 ? 'stop' : 'play',
            kind: myRunning > 0 ? BtnKind.dark : BtnKind.primary,
            expand: true,
            onPressed: busy ? null : () => _act(myRunning > 0 ? 'finish' : 'start'),
          ),
          const SizedBox(height: 10),
        ],
        if (editable)
          Btn(
            'Add services',
            icon: 'plus',
            kind: BtnKind.soft,
            expand: true,
            onPressed: busy
                ? null
                : () async {
                    final added = await openAddServices(context, t, cur);
                    if (added) _loaded.currentState?.reload();
                  },
          ),
        if (isOwner && status == 'waiting') ...[
          const SizedBox(height: 10),
          Btn(
            'Cancel token',
            icon: 'x',
            kind: BtnKind.danger,
            expand: true,
            onPressed: busy
                ? null
                : () async {
                    final ok = await confirmDialog(
                      context,
                      title: 'Cancel ${tokenNo(t)}?',
                      message: 'The customer’s token stops working and they leave the queue.',
                      confirm: 'Cancel token',
                    );
                    if (ok) _act('cancel');
                  },
          ),
        ],
        if (status == 'missed')
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text(
              'This token expired – it wasn’t used in time.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Tk.ink3),
            ),
          ),
      ],
    );
  }

  Widget _stat(String label, String value) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: fade(Colors.white, 0.7), fontSize: 12)),
        Text(
          value,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16),
        ),
      ],
    ),
  );

  Widget _itemRow(
    BuildContext context,
    Json it,
    int index,
    bool mine,
    bool editable,
    String cur, {
    bool whole = false,
  }) {
    final st = it.s('status');
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
      child: Row(
        children: [
          Avatar(it.s('staffName'), size: 38),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  it.s('serviceName'),
                  style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                ),
                Text(
                  '${it.s('staffName')} · ${it.i('duration')} min · ${money(it.d('price'), cur)}',
                  style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                ),
                const SizedBox(height: 4),
                Pill.status(st),
              ],
            ),
          ),
          if (mine && editable && st == 'waiting') ...[
            if (!whole) ...[
              Btn(
                'Start',
                icon: 'play',
                small: true,
                onPressed: busy ? null : () => _act('start', index: index),
              ),
              const SizedBox(width: 6),
            ],
            IconBtn(
              'trash',
              tooltip: 'Remove service',
              danger: true,
              size: 36,
              onPressed: busy
                  ? null
                  : () async {
                      final ok = await confirmDialog(
                        context,
                        title: 'Remove ${it.s('serviceName')}?',
                        message: 'It comes off this token and the waiting times update.',
                        confirm: 'Remove',
                      );
                      if (ok) _act('remove-service', index: index);
                    },
            ),
          ],
          if (!whole && mine && editable && st == 'in_progress')
            Btn(
              'Finish',
              icon: 'stop',
              kind: BtnKind.dark,
              small: true,
              onPressed: busy ? null : () => _act('finish', index: index),
            ),
        ],
      ),
    );
  }
}

/// Add one or more services to a token (each goes to the signed-in staff member if they do
/// it, otherwise to whoever is free first). Returns true when something was added.
Future<bool> openAddServices(BuildContext context, Json token, String currency) async {
  final r = await Navigator.of(context).push<bool>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => AddServicesPage(token: token, currency: currency),
    ),
  );
  return r == true;
}

class AddServicesPage extends StatefulWidget {
  final Json token;
  final String currency;
  const AddServicesPage({super.key, required this.token, required this.currency});

  @override
  State<AddServicesPage> createState() => _AddServicesPageState();
}

class _AddServicesPageState extends State<AddServicesPage> {
  Json? data;
  Object? error;
  final Map<String, String> picked = {}; // serviceId → staffId
  String query = '';
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await session.api.getJson('/api/token/${widget.token.s('id')}/services');
      if (mounted) setState(() => data = d);
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  String? _defaultStaff(Json svc) {
    final online = svc.l('staff').where((x) => x.b('online', true)).toList();
    if (online.isEmpty) return null;
    final me = data!.s('me');
    if (me.isNotEmpty && online.any((x) => x.s('id') == me)) return me;
    online.sort((a, b) => a.i('load').compareTo(b.i('load')));
    return online.first.s('id');
  }

  Future<void> _submit() async {
    final services = data!.l('services');
    final chosen = services.where((s) => picked.containsKey(s.s('id'))).toList();
    if (chosen.isEmpty) return;
    setState(() => busy = true);
    var added = 0;
    try {
      for (final s in chosen) {
        await session.api.post('/api/token/${widget.token.s('id')}/add-service', {
          'serviceId': s.s('id'),
          'staffId': picked[s.s('id')],
        });
        added++;
      }
      if (mounted) {
        toast(context, added == 1 ? 'Added ${chosen.first.s('name')}' : 'Added $added services');
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => busy = false);
        if (added > 0) Navigator.pop(context, true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final cur = widget.currency;
    Widget body;
    if (data == null && error == null) {
      body = const Loader();
    } else if (data == null) {
      body = ErrorView(
        error!,
        onRetry: () {
          setState(() => error = null);
          _load();
        },
      );
    } else {
      final services = data!.l('services');
      final ql = query.trim().toLowerCase();
      final shown = services
          .where((s) => ql.isEmpty || '${s.s('name')} ${s.s('category')}'.toLowerCase().contains(ql))
          .toList();
      final already = widget.token
          .l('items')
          .where((i) => i.s('status') != 'done')
          .map((i) => i.s('serviceId'))
          .toSet();
      final chosen = services.where((s) => picked.containsKey(s.s('id'))).toList();
      final minutes = chosen.fold<int>(0, (a, s) => a + s.i('duration'));
      final price = chosen.fold<double>(0, (a, s) => a + s.d('price'));
      body = Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => query = v),
              decoration: const InputDecoration(
                hintText: 'Search services',
                prefixIcon: Padding(
                  padding: EdgeInsets.all(13),
                  child: AppIcon('search', size: 20, color: Tk.ink3),
                ),
              ),
            ),
          ),
          Expanded(
            child: shown.isEmpty
                ? const EmptyState(icon: 'search', title: 'No services match')
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    itemCount: shown.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, i) {
                      final s = shown[i];
                      final id = s.s('id');
                      final on = picked.containsKey(id);
                      final staff = s.l('staff');
                      final canPick = _defaultStaff(s) != null;
                      return AppCard(
                        padding: const EdgeInsets.all(14),
                        borderColor: on ? b.c : null,
                        onTap: canPick
                            ? () => setState(() {
                                if (on) {
                                  picked.remove(id);
                                } else {
                                  picked[id] = _defaultStaff(s)!;
                                }
                              })
                            : null,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        s.s('name'),
                                        style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                                      ),
                                      Text(
                                        [
                                          '${s.i('duration')} min',
                                          if (already.contains(id)) 'already on this token',
                                          if (!canPick) 'nobody online for it',
                                        ].join(' · '),
                                        style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                                      ),
                                    ],
                                  ),
                                ),
                                Text(
                                  money(s.d('price'), cur),
                                  style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                                ),
                                const SizedBox(width: 10),
                                Container(
                                  width: 26,
                                  height: 26,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: on ? b.gradBtn : null,
                                    border: on ? null : Border.all(color: Tk.line2, width: 1.5),
                                  ),
                                  child: on
                                      ? const Center(
                                          child: AppIcon('check', size: 15, color: Colors.white, stroke: 2.6),
                                        )
                                      : null,
                                ),
                              ],
                            ),
                            if (on) ...[
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  for (final st in staff.where((x) => x.b('online', true)))
                                    ChoiceChip(
                                      label: Text(
                                        '${st.s('name')}${st.i('load') > 0 ? ' · ${waitText(st.i('load'))}' : ' · free'}',
                                      ),
                                      selected: picked[id] == st.s('id'),
                                      onSelected: (_) => setState(() => picked[id] = st.s('id')),
                                      selectedColor: b.tint,
                                      backgroundColor: Colors.white,
                                      side: BorderSide(color: picked[id] == st.s('id') ? b.c : Tk.line),
                                      labelStyle: TextStyle(
                                        fontSize: 12.5,
                                        color: picked[id] == st.s('id') ? b.ink : Tk.ink2,
                                        fontWeight: FontWeight.w500,
                                      ),
                                      showCheckmark: false,
                                    ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      );
                    },
                  ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Tk.line)),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          chosen.isEmpty ? 'Pick services' : '+${money(price, cur)} · +$minutes min',
                          style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                        ),
                        Text(
                          chosen.isEmpty ? 'Waiting times update for everyone after' : plural(chosen.length, 'service'),
                          style: const TextStyle(color: Tk.ink3, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Btn(
                    chosen.length > 1 ? 'Add ${chosen.length}' : 'Add',
                    icon: 'plus',
                    busy: busy,
                    onPressed: chosen.isEmpty ? null : _submit,
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }
    return Scaffold(
      backgroundColor: Tk.canvas,
      appBar: AppBar(
        leading: IconButton(
          icon: const AppIcon('x', size: 22),
          onPressed: () => Navigator.pop(context, false),
          tooltip: 'Close',
        ),
        title: Text('Add to ${tokenNo(widget.token)}'),
      ),
      body: body,
    );
  }
}
