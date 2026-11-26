// Reports for every role (owner, staff, super admin / team): date range + filters, totals,
// a daily bar chart, breakdowns, the detailed list, and CSV export through the share sheet.

import 'dart:convert';
import 'dart:typed_data';

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'common.dart';

const _endpoint = {'owner': '/api/owner/reports', 'staff': '/api/staff/reports', 'admin': '/api/admin/reports'};

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// Date-range presets: id → (label, from, to).
Map<String, (String, DateTime, DateTime)> _presets() {
  final t = _day(DateTime.now());
  return {
    'today': ('Today', t, t),
    'yesterday': ('Yesterday', t.subtract(const Duration(days: 1)), t.subtract(const Duration(days: 1))),
    '7': ('Last 7 days', t.subtract(const Duration(days: 6)), t),
    '30': ('Last 30 days', t.subtract(const Duration(days: 29)), t),
    'month': ('This month', DateTime(t.year, t.month, 1), t),
    'lastmonth': ('Last month', DateTime(t.year, t.month - 1, 1), DateTime(t.year, t.month, 0)),
  };
}

class ReportsScreen extends StatefulWidget {
  final String kind; // owner | staff | admin
  const ReportsScreen({super.key, required this.kind});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String preset = '30';
  late DateTime from;
  late DateTime to;
  final Map<String, String> filters = {};
  Json? data;
  Object? error;
  bool busy = false;
  bool exporting = false;
  String metric = '';
  String q = '';

  @override
  void initState() {
    super.initState();
    final p = _presets()['30']!;
    from = p.$2;
    to = p.$3;
    _load();
  }

  String _url({bool export = false}) {
    // tzOffset: the phone's offset from UTC in minutes, so "busy hours" follow the local clock.
    final params = <String, String>{
      'from': isoOf(from),
      'to': isoOf(to),
      'tzOffset': '${DateTime.now().timeZoneOffset.inMinutes}',
      ...filters,
    };
    if (export) params['export'] = '1';
    params.removeWhere((k, v) => v.isEmpty);
    return '${_endpoint[widget.kind]}?${params.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&')}';
  }

  Future<void> _load() async {
    setState(() => busy = true);
    try {
      final r = await session.api.getJson(_url());
      if (!mounted) return;
      setState(() {
        data = r;
        error = null;
        busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = e;
        busy = false;
      });
      if (data != null) showError(context, e);
    }
  }

  void _choose(String id) {
    final p = _presets()[id];
    if (p == null) return;
    setState(() {
      preset = id;
      from = p.$2;
      to = p.$3;
    });
    _load();
  }

  Future<void> _pick(bool isFrom) async {
    final now = _day(DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: isFrom ? from : to,
      firstDate: DateTime(2024),
      lastDate: now,
      helpText: isFrom ? 'Report starts on' : 'Report ends on',
    );
    if (picked == null) return;
    setState(() {
      preset = 'custom';
      if (isFrom) {
        from = picked;
        if (from.isAfter(to)) to = from;
      } else {
        to = picked;
        if (to.isBefore(from)) from = to;
      }
      if (to.difference(from).inDays > 365) from = to.subtract(const Duration(days: 365));
    });
    _load();
  }

  void _setFilter(String key, String value) {
    setState(() => filters[key] = value);
    _load();
  }

  Future<void> _export() async {
    setState(() => exporting = true);
    try {
      final r = await session.api.getJson(_url(export: true));
      final csv = r.s('csv');
      final name = r.s('fileName', 'report.csv');
      final ok = await Native.shareFile(name, 'text/csv', Uint8List.fromList(utf8.encode(csv)));
      if (!ok) await Native.shareText(csv, subject: name);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => exporting = false);
    }
  }

  /// Opens a bottom sheet to pick one option.
  Future<void> _pickOption(String title, String key, Map<String, String> options) async {
    final b = brandOf(context);
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                ),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final e in options.entries)
                      ListTile(
                        title: Text(e.value),
                        trailing: (filters[key] ?? '') == e.key ? AppIcon('check', color: b.c) : null,
                        onTap: () => Navigator.pop(ctx, e.key),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) _setFilter(key, picked);
  }

  @override
  Widget build(BuildContext context) {
    final d = data;
    final presets = _presets();
    final cur = d?.s('currency', '₹') ?? '₹';
    final opts = d?.m('options') ?? <String, dynamic>{};
    return PageScroll(
      title: widget.kind == 'staff' ? 'My reports' : 'Reports',
      subtitle:
          '${dayText(isoOf(from))} – ${dayText(isoOf(to))}${d == null ? '' : ' · ${plural(d.m('range').i('days'), 'day')}'}',
      onRefresh: _load,
      actions: [
        if (widget.kind == 'admin' || session.canExport)
          HeaderAction(
            'download',
            tooltip: 'Export CSV',
            label: exporting ? '…' : 'Export',
            onPressed: () {
              if (exporting) return;
              if (d == null || d.i('rowCount') == 0) {
                toast(context, 'Nothing to export in this range', error: true);
              } else {
                _export();
              }
            },
          ),
      ],
      children: [
        // ---- range ----
        FilterChips<String>(
          options: {for (final e in presets.entries) e.key: e.value.$1, 'custom': 'Custom'},
          value: preset,
          onChanged: (v) => v == 'custom' ? _pick(true) : _choose(v),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _PickButton(
                label: 'From',
                value: dayText(isoOf(from)),
                icon: 'calendar',
                onTap: () => _pick(true),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _PickButton(label: 'To', value: dayText(isoOf(to)), icon: 'calendar', onTap: () => _pick(false)),
            ),
          ],
        ),
        // ---- filters ----
        if (d != null) ...[const SizedBox(height: 10), _filterRow(opts)],
        const SizedBox(height: 16),
        if (d == null && error != null)
          ErrorView(error!, onRetry: _load)
        else if (d == null)
          const Loader()
        else
          AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: busy ? 0.5 : 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Figures(_figures(d, cur)),
                const SizedBox(height: 18),
                _chart(d, cur),
                ..._breakdowns(d, cur),
                const SizedBox(height: 18),
                _rows(d, cur),
              ],
            ),
          ),
      ],
    );
  }

  Widget _filterRow(Json opts) {
    final chips = <Widget>[];
    String nameOf(List<Json> list, String id, String all) => id.isEmpty
        ? all
        : list.firstWhere((x) => x.s('id') == id, orElse: () => <String, dynamic>{'name': all}).s('name');
    if (widget.kind == 'owner') {
      final branches = opts.l('branches');
      final staff = opts.l('staff');
      if (branches.length > 1) {
        chips.add(
          _FilterPill(
            icon: 'store',
            text: nameOf(branches, filters['branchId'] ?? '', 'All branches'),
            on: (filters['branchId'] ?? '').isNotEmpty,
            onTap: () => _pickOption('Branch', 'branchId', {
              '': 'All branches',
              for (final x in branches) x.s('id'): x.s('name'),
            }),
          ),
        );
      }
      chips.add(
        _FilterPill(
          icon: 'users',
          text: nameOf(staff, filters['staffId'] ?? '', 'All staff'),
          on: (filters['staffId'] ?? '').isNotEmpty,
          onTap: () =>
              _pickOption('Staff', 'staffId', {'': 'All staff', for (final x in staff) x.s('id'): x.s('name')}),
        ),
      );
      final st = filters['status'] ?? '';
      chips.add(
        _FilterPill(
          icon: 'list',
          text: st.isEmpty ? 'All statuses' : (kStatusText[st] ?? st),
          on: st.isNotEmpty,
          onTap: () => _pickOption('Status', 'status', {
            '': 'All statuses',
            for (final s in opts.ls('statuses')) s: kStatusText[s] ?? s,
          }),
        ),
      );
    } else if (widget.kind == 'staff') {
      final st = filters['status'] ?? '';
      const labels = {'waiting': 'Waiting', 'in_progress': 'In service', 'done': 'Completed', 'missed': 'Missed'};
      chips.add(
        _FilterPill(
          icon: 'list',
          text: st.isEmpty ? 'All statuses' : labels[st] ?? st,
          on: st.isNotEmpty,
          onTap: () => _pickOption('Status', 'status', {'': 'All statuses', ...labels}),
        ),
      );
    } else {
      final cats = opts.l('categories');
      final c = filters['categoryId'] ?? '';
      chips.add(
        _FilterPill(
          icon: 'grid',
          text: c == 'none' ? 'No category' : nameOf(cats, c, 'All categories'),
          on: c.isNotEmpty,
          onTap: () => _pickOption('Category', 'categoryId', {
            '': 'All categories',
            for (final x in cats) x.s('id'): x.s('name'),
            'none': 'No category',
          }),
        ),
      );
      final st = filters['status'] ?? '';
      const labels = {'active': 'Active', 'expired': 'Expired', 'disabled': 'Disabled'};
      chips.add(
        _FilterPill(
          icon: 'check',
          text: st.isEmpty ? 'All statuses' : labels[st] ?? st,
          on: st.isNotEmpty,
          onTap: () => _pickOption('Status', 'status', {'': 'All statuses', ...labels}),
        ),
      );
    }
    if (filters.values.any((v) => v.isNotEmpty)) {
      chips.add(
        _FilterPill(
          icon: 'x',
          text: 'Clear',
          on: false,
          onTap: () {
            setState(filters.clear);
            _load();
          },
        ),
      );
    }
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [for (final c in chips) Padding(padding: const EdgeInsets.only(right: 8), child: c)],
      ),
    );
  }

  List<FigureItem> _figures(Json d, String cur) {
    final s = d.m('summary');
    String mins(double v) => v > 0 ? '${v.round()} min' : '—';
    if (widget.kind == 'owner') {
      return [
        FigureItem('Tokens', '${s.i('tokens')}', 'ticket', Tk.rose),
        FigureItem('Completed', '${s.i('done')}', 'check', Tk.green),
        FigureItem('Revenue', money(s.d('revenue'), cur), 'chart', Tk.teal),
        FigureItem('Customers', '${s.i('customers')}', 'users', Tk.sky),
        FigureItem('Avg bill', money(s.d('avgTicket'), cur), 'tag', Tk.amber),
        FigureItem('Avg wait', mins(s.d('avgWaitMin')), 'clock', Tk.rose),
        FigureItem('Cancelled', '${s.i('cancelled')}', 'x', Tk.badFg),
        FigureItem('Discounts', money(s.d('discount'), cur), 'gift', Tk.amber),
      ];
    }
    if (widget.kind == 'staff') {
      return [
        FigureItem('Services done', '${s.i('done')}', 'check', Tk.green),
        FigureItem('Earned', money(s.d('revenue'), cur), 'chart', Tk.teal),
        FigureItem('Customers', '${s.i('customers')}', 'users', Tk.sky),
        FigureItem('Avg time', mins(s.d('avgServiceMin')), 'clock', Tk.amber),
        FigureItem('Missed', '${s.i('missed')}', 'x', Tk.badFg),
      ];
    }
    return [
      FigureItem('Businesses', '${s.i('businesses')}', 'store', Tk.rose),
      FigureItem('Active', '${s.i('active')}', 'check', Tk.green),
      FigureItem('New', '${s.i('newBusinesses')}', 'plus', Tk.sky),
      FigureItem('Tokens', '${s.i('tokens')}', 'ticket', Tk.teal),
      FigureItem('Customers', '${s.i('customers')}', 'users', Tk.amber),
      if (s['revenue'] != null) FigureItem('Plan revenue', money(s.d('revenue')), 'chart', Tk.teal),
      FigureItem('Expired', '${s.i('expired')}', 'clock', Tk.amber),
      FigureItem('Disabled', '${s.i('disabled')}', 'x', Tk.badFg),
    ];
  }

  Widget _chart(Json d, String cur) {
    final metrics = widget.kind == 'owner'
        ? const {'tokens': 'Tokens', 'revenue': 'Revenue'}
        : widget.kind == 'staff'
        ? const {'services': 'Services', 'revenue': 'Earned'}
        : const {'tokens': 'Tokens', 'newBusinesses': 'New businesses'};
    final m = metrics.containsKey(metric) ? metric : metrics.keys.first;
    final days = d.l('byDay');
    final values = days.map((x) => x.d(m)).toList();
    final total = values.fold<double>(0, (a, v) => a + v);
    String fmt(double v) =>
        m == 'revenue' ? money(v, cur) : (v == v.roundToDouble() ? '${v.toInt()}' : v.toStringAsFixed(1));
    final b = brandOf(context);
    return AppCard(
      accent: b.c,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${metrics[m]} by day',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Tk.ink),
                    ),
                    Text('Total ${fmt(total)}', style: const TextStyle(color: Tk.ink3, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          FilterChips<String>(options: metrics, value: m, onChanged: (v) => setState(() => metric = v)),
          const SizedBox(height: 14),
          if (total == 0)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: EmptyState(
                icon: 'chart',
                title: 'Nothing in this range',
                text: 'Try a longer range or clear the filters.',
              ),
            )
          else
            SizedBox(
              height: 170,
              child: CustomPaint(
                painter: _BarsPainter(
                  values: values,
                  labels: days.map((x) => x.s('date')).toList(),
                  color: b.c,
                  top: b.rose,
                ),
                child: const SizedBox.expand(),
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _breakdowns(Json d, String cur) {
    final out = <Widget>[];
    void add(
      String title,
      String icon,
      List<Json> rows,
      String valueKey,
      String Function(Json) value,
      String Function(Json) sub,
    ) {
      if (rows.isEmpty) return;
      out
        ..add(const SizedBox(height: 18))
        ..add(
          _Breakdown(title: title, icon: icon, rows: rows.take(8).toList(), valueKey: valueKey, value: value, sub: sub),
        );
    }

    String n(Json r, String k) => '${r.i(k)}';
    if (widget.kind == 'owner') {
      add(
        'By staff',
        'users',
        d.l('byStaff'),
        'revenue',
        (r) => money(r.d('revenue'), cur),
        (r) => '${plural(r.i('services'), 'service')} · avg ${r.d('avgServiceMin').round()} min',
      );
      add(
        'By service',
        'tag',
        d.l('byService'),
        'revenue',
        (r) => money(r.d('revenue'), cur),
        (r) => '${n(r, 'count')} done',
      );
      if (d.l('byBranch').length > 1)
        add(
          'By branch',
          'store',
          d.l('byBranch'),
          'revenue',
          (r) => money(r.d('revenue'), cur),
          (r) => '${plural(r.i('tokens'), 'token')} · ${n(r, 'done')} done',
        );
      final hours = d.l('byHour')..sort((a, b) => b.i('tokens').compareTo(a.i('tokens')));
      add(
        'Busiest hours',
        'clock',
        hours.take(6).map((h) => <String, dynamic>{...h, 'name': _hourLabel(h.i('hour'))}).toList(),
        'tokens',
        (r) => plural(r.i('tokens'), 'token'),
        (r) => '',
      );
    } else if (widget.kind == 'staff') {
      add(
        'By service',
        'tag',
        d.l('byService'),
        'revenue',
        (r) => money(r.d('revenue'), cur),
        (r) => '${n(r, 'count')} done',
      );
    } else {
      final money_ = d.m('summary')['revenue'] != null;
      add(
        'By category',
        'grid',
        d.l('byCategory'),
        money_ ? 'revenue' : 'businesses',
        (r) => money_ ? money(r.d('revenue')) : plural(r.i('businesses'), 'business', 'businesses'),
        (r) => '${plural(r.i('businesses'), 'business', 'businesses')} · ${plural(r.i('tokens'), 'token')}',
      );
    }
    return out;
  }

  Widget _rows(Json d, String cur) {
    final all = d.l('rows');
    final rows = all.where((r) => textMatches(q, r.values.map((v) => '$v'))).toList();
    final title = widget.kind == 'admin'
        ? 'Businesses'
        : widget.kind == 'staff'
        ? 'My services'
        : 'Tokens';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(
          title,
          sub: d.i('rowCount') > all.length
              ? 'Showing the latest ${all.length} of ${d.i('rowCount')} – export for all'
              : plural(d.i('rowCount'), 'row'),
        ),
        if (all.isNotEmpty) ListFilters(hint: 'Search ${title.toLowerCase()}', onSearch: (v) => setState(() => q = v)),
        if (rows.isEmpty)
          AppCard(
            child: EmptyState(
              icon: q.isEmpty ? 'list' : 'search',
              title: q.isEmpty ? 'Nothing in this range' : 'Nothing matches',
              text: q.isEmpty ? 'Try a longer range or clear the filters.' : 'Try another word.',
            ),
          )
        else
          PagedColumn<Json>(
            key: ValueKey('$q|${isoOf(from)}|${isoOf(to)}|${filters.values.join()}'),
            all: rows,
            gap: 12,
            itemBuilder: (r) => widget.kind == 'admin' ? _adminRow(r) : _tokenRow(r, cur),
          ),
      ],
    );
  }

  Widget _tokenRow(Json r, String cur) {
    final staff = widget.kind == 'staff';
    return ListCard(
      leading: _TokenBadge(r.s('token')),
      title: r.s('customer'),
      subtitle: [
        dayText(r.s('date')),
        if (r.s('time').isNotEmpty) r.s('time'),
        if (r.s('started').isNotEmpty) r.s('started'),
      ].join(' · '),
      subtitleIcon: 'calendar',
      trailing: Text(
        money(staff ? r.d('earned') : r.d('paid'), cur),
        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5, color: Tk.ink),
      ),
      detailIcon: 'scissors',
      detail: staff
          ? [r.s('service'), if (r['minutes'] is num) '${r.i('minutes')} min'].join(' · ')
          : [r.s('services'), if (r.s('staff').isNotEmpty) r.s('staff')].join(' · '),
      tags: [
        Pill.status(r.s('status')),
        if (!staff && r.s('branch').isNotEmpty && (data?.m('options').l('branches').length ?? 0) > 1)
          Tag(r.s('branch'), icon: 'store'),
        if (!staff && r.s('offer').isNotEmpty) Tag(r.s('offer'), icon: 'gift', tone: TagTone.brand),
      ],
    );
  }

  Widget _adminRow(Json r) {
    final tone = r.s('status') == 'active' ? TagTone.green : (r.s('status') == 'expired' ? TagTone.amber : TagTone.red);
    return ListCard(
      leading: Avatar(r.s('name'), size: 50),
      title: r.s('name'),
      subtitle: r.s('category'),
      subtitleIcon: 'grid',
      trailing: Tag('${r.s('status')[0].toUpperCase()}${r.s('status').substring(1)}', dot: true, tone: tone),
      detailIcon: 'ticket',
      detail: '${plural(r.i('tokens'), 'token')} · ${r.i('done')} completed · ${plural(r.i('customers'), 'customer')}',
      tags: [
        Tag(
          [r.s('plan', 'No plan'), if (r['amount'] != null) money(r.d('amount'))].join(' · '),
          icon: 'calendar',
          tone: TagTone.brand,
        ),
        if (r.s('owner').isNotEmpty) Tag(r.s('owner'), icon: 'user'),
      ],
    );
  }
}

String _hourLabel(int h) {
  String one(int x) => '${x % 12 == 0 ? 12 : x % 12} ${x < 12 || x == 24 ? 'AM' : 'PM'}';
  return '${one(h)} – ${one(h + 1)}';
}

class _PickButton extends StatelessWidget {
  final String label;
  final String value;
  final String icon;
  final VoidCallback onTap;
  const _PickButton({required this.label, required this.value, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Tk.line),
          ),
          child: Row(
            children: [
              IconChip(icon, color: b.c, size: 32),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: const TextStyle(fontSize: 11.5, color: Tk.ink3)),
                    Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  final String icon;
  final String text;
  final bool on;
  final VoidCallback onTap;
  const _FilterPill({required this.icon, required this.text, required this.on, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final fg = on ? Colors.white : Tk.ink2;
    return Material(
      color: on ? b.c : Colors.white,
      borderRadius: BorderRadius.circular(99),
      child: InkWell(
        borderRadius: BorderRadius.circular(99),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(99),
            border: Border.all(color: on ? b.c : Tk.line2),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(icon, size: 15, color: fg, stroke: 2),
              const SizedBox(width: 7),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 160),
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: fg),
                ),
              ),
              const SizedBox(width: 4),
              AppIcon('chevd', size: 14, color: fg),
            ],
          ),
        ),
      ),
    );
  }
}

class _TokenBadge extends StatelessWidget {
  final String text;
  const _TokenBadge(this.text);

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Container(
      width: 64,
      height: 50,
      alignment: Alignment.center,
      decoration: BoxDecoration(gradient: b.gradBtn, borderRadius: BorderRadius.circular(14)),
      child: FittedBox(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Text(
            text,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: 0.3),
          ),
        ),
      ),
    );
  }
}

class _Breakdown extends StatelessWidget {
  final String title;
  final String icon;
  final List<Json> rows;
  final String valueKey;
  final String Function(Json) value;
  final String Function(Json) sub;
  const _Breakdown({
    required this.title,
    required this.icon,
    required this.rows,
    required this.valueKey,
    required this.value,
    required this.sub,
  });

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final top = rows.fold<double>(0, (a, r) => r.d(valueKey) > a ? r.d(valueKey) : a);
    return AppCard(
      accent: b.c,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconChip(icon, color: b.c),
              const SizedBox(width: 10),
              Text(
                title,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Tk.ink),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          r.s('name', '—'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        value(r),
                        style: const TextStyle(fontWeight: FontWeight.w800, color: Tk.ink),
                      ),
                    ],
                  ),
                  if (sub(r).isNotEmpty) Text(sub(r), style: const TextStyle(fontSize: 12, color: Tk.ink3)),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(
                      value: top <= 0 ? 0 : (r.d(valueKey) / top).clamp(0.0, 1.0),
                      minHeight: 6,
                      backgroundColor: b.wash,
                      valueColor: AlwaysStoppedAnimation<Color>(b.c),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Simple bar chart (one bar per day) with a few date labels underneath.
class _BarsPainter extends CustomPainter {
  final List<double> values;
  final List<String> labels;
  final Color color;
  final Color top;
  _BarsPainter({required this.values, required this.labels, required this.color, required this.top});

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    const labelH = 20.0;
    final h = size.height - labelH;
    final maxV = values.fold<double>(0, (a, v) => v > a ? v : a);
    final n = values.length;
    final gap = n > 60 ? 1.0 : (n > 20 ? 2.0 : 4.0);
    final bw = ((size.width - gap * (n - 1)) / n).clamp(1.5, 40.0);
    final grid = Paint()
      ..color = const Color(0xFFE7E3EC)
      ..strokeWidth = 1;
    for (final f in [0.25, 0.5, 0.75, 1.0]) {
      final y = h - h * f;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    for (var i = 0; i < n; i++) {
      final v = values[i];
      if (v <= 0) continue;
      final bh = maxV <= 0 ? 0.0 : (v / maxV) * (h - 6);
      final x = i * (bw + gap);
      final rect = Rect.fromLTWH(x, h - bh, bw, bh < 2 ? 2 : bh);
      final paint = Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [top, color],
        ).createShader(rect);
      canvas.drawRRect(
        RRect.fromRectAndCorners(
          rect,
          topLeft: Radius.circular(bw / 2 > 5 ? 5 : bw / 2),
          topRight: Radius.circular(bw / 2 > 5 ? 5 : bw / 2),
        ),
        paint,
      );
    }
    final step = (n / 5).ceil();
    for (var i = 0; i < n; i += step) {
      final d = labels[i];
      final tp = TextPainter(
        text: TextSpan(
          text: '${d.substring(8)}/${d.substring(5, 7)}',
          style: const TextStyle(fontSize: 10.5, color: Color(0xFF777085)),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final x = (i * (bw + gap) + bw / 2 - tp.width / 2).clamp(0.0, size.width - tp.width);
      tp.paint(canvas, Offset(x, h + 6));
    }
    final maxTp = TextPainter(
      text: TextSpan(
        text: maxV == maxV.roundToDouble() ? '${maxV.toInt()}' : maxV.toStringAsFixed(0),
        style: const TextStyle(fontSize: 10.5, color: Color(0xFF777085)),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    maxTp.paint(canvas, Offset(size.width - maxTp.width, 0));
  }

  @override
  bool shouldRepaint(covariant _BarsPainter old) => old.values != values || old.color != color;
}
