// Owner tokens: any date, any branch, completed revenue, and CSV export.

import 'dart:convert';
import 'dart:typed_data';

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';
import 'overview.dart';
import 'owner_home.dart';

class OwnerTokens extends StatefulWidget {
  const OwnerTokens({super.key});

  @override
  State<OwnerTokens> createState() => _OwnerTokensState();
}

class _OwnerTokensState extends State<OwnerTokens> {
  DateTime date = DateTime.now();
  String branchId = '';
  String q = '';
  String status = 'all';
  Json? owner;
  List<Json>? list;
  Object? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      owner ??= await loadOwner();
      final r = await session.api.get(
        '/api/owner/tokens?date=${isoOf(date)}&branchId=${Uri.encodeQueryComponent(branchId)}',
      );
      if (mounted) {
        setState(() {
          list = asJsonList(r);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: date,
      firstDate: DateTime(2024),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked == null) return;
    setState(() {
      date = picked;
      list = null;
    });
    _load();
  }

  Future<void> _export() async {
    final l = list ?? const <Json>[];
    if (l.isEmpty) return;
    final branches = {for (final b in owner!.l('branches')) b.s('id'): b.s('name')};
    String q(Object? v) => '"${(v ?? '').toString().replaceAll('"', '""')}"';
    final rows = <List<Object?>>[
      [
        'Token',
        'Date',
        'Time',
        'Branch',
        'Customer',
        'Mobile',
        'Email',
        'Service',
        'Staff',
        'Price',
        'Duration',
        'Service status',
        'Started',
        'Finished',
        'Token status',
        'Offer',
        'Offer code',
        'Token discount',
        'Token total',
      ],
    ];
    for (final t in l) {
      final offer = t.mn('offer');
      for (final i in t.l('items')) {
        rows.add([
          tokenNo(t),
          t.s('date'),
          clock(t.i('createdAt')),
          branches[t.s('branchId')] ?? '',
          t.m('customer').s('name'),
          t.m('customer').s('mobile'),
          t.m('customer').s('email'),
          i.s('serviceName'),
          i.s('staffName'),
          i.d('price'),
          i.i('duration'),
          i.s('status'),
          clock(i.i('startedAt')),
          clock(i.i('endedAt')),
          t.s('status'),
          offer?.s('title') ?? '',
          offer?.s('code') ?? '',
          t.d('discount'),
          t.d('total'),
        ]);
      }
    }
    final csv = '﻿${rows.map((r) => r.map(q).join(',')).join('\r\n')}';
    final name = 'tokens-${isoOf(date)}.csv';
    final ok = await Native.shareFile(name, 'text/csv', Uint8List.fromList(utf8.encode(csv)));
    if (!ok) await Native.shareText(csv, subject: name);
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final cur = owner?.m('salon').s('currency', '₹') ?? '₹';
    final branches = owner?.l('branches') ?? const <Json>[];
    final l = list;
    final revenue = (l ?? const <Json>[])
        .where((t) => t.s('status') != 'cancelled')
        .fold<double>(0, (a, t) => a + t.d('doneTotal'));
    final isToday = isoOf(date) == todayIso();
    return PageScroll(
      title: 'Tokens',
      subtitle: l == null
          ? (isToday ? 'Today' : dayText(isoOf(date)))
          : '${plural(l.length, 'token')} · completed revenue ${money(revenue, cur)}',
      onRefresh: _load,
      actions: [
        if (session.canExport)
          HeaderAction(
            'download',
            tooltip: 'Export CSV',
            label: 'CSV',
            onPressed: () {
              if ((list ?? const []).isEmpty) {
                toast(context, 'No tokens to export for this day', error: true);
              } else {
                _export();
              }
            },
          ),
      ],
      headerExtra: Row(
        children: [
          Expanded(
            child: _FilterChip(icon: 'calendar', text: isToday ? 'Today' : dayText(isoOf(date)), onTap: _pickDate),
          ),
          if (branches.length > 1) ...[
            const SizedBox(width: 8),
            Expanded(
              child: _FilterChip(
                icon: 'store',
                text: branchId.isEmpty
                    ? 'All branches'
                    : branches
                          .firstWhere((x) => x.s('id') == branchId, orElse: () => <String, dynamic>{})
                          .s('name', 'Branch'),
                onTap: () async {
                  final picked = await showModalBottomSheet<String>(
                    context: context,
                    builder: (ctx) => SafeArea(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ListTile(
                            title: const Text('All branches'),
                            trailing: branchId.isEmpty ? AppIcon('check', color: b.c) : null,
                            onTap: () => Navigator.pop(ctx, ''),
                          ),
                          for (final x in branches)
                            ListTile(
                              title: Text(x.s('name')),
                              trailing: branchId == x.s('id') ? AppIcon('check', color: b.c) : null,
                              onTap: () => Navigator.pop(ctx, x.s('id')),
                            ),
                        ],
                      ),
                    ),
                  );
                  if (picked == null) return;
                  setState(() {
                    branchId = picked;
                    list = null;
                  });
                  _load();
                },
              ),
            ),
          ],
        ],
      ),
      children: [
        if (error != null && l == null)
          ErrorView(
            error!,
            onRetry: () {
              setState(() => error = null);
              _load();
            },
          )
        else if (l == null)
          const Loader()
        else if (l.isEmpty)
          AppCard(
            child: EmptyState(
              icon: 'list',
              title: 'No tokens',
              text: isToday ? 'Bookings made today appear here.' : 'There were no bookings on this day.',
            ),
          )
        else ...[
          ListFilters(
            hint: 'Search name, mobile or token',
            onSearch: (v) => setState(() => q = v),
            chips: [
              FilterChips<String>(
                options: {
                  'all': 'All ${l.length}',
                  for (final st in ['waiting', 'serving', 'done', 'cancelled', 'missed'])
                    if (l.any((t) => t.s('status') == st))
                      st: '${kStatusText[st] ?? st} ${l.where((t) => t.s('status') == st).length}',
                },
                value: status,
                onChanged: (v) => setState(() => status = v),
              ),
            ],
          ),
          Builder(
            builder: (context) {
              final shown = l
                  .where(
                    (t) =>
                        (status == 'all' || t.s('status') == status) &&
                        textMatches(q, [
                          t.m('customer').s('name'),
                          t.m('customer').s('mobile'),
                          tokenNo(t),
                          ...t.l('items').map((i) => i.s('serviceName')),
                        ]),
                  )
                  .toList();
              if (shown.isEmpty)
                return const AppCard(
                  child: EmptyState(icon: 'search', title: 'No tokens match', text: 'Try another search or status.'),
                );
              return PagedColumn<Json>(
                key: ValueKey('$q|$status|${isoOf(date)}|$branchId'),
                all: shown,
                gap: 14,
                itemBuilder: (t) => OwnerTokenCard(t: t, d: owner!, onChanged: _load),
              );
            },
          ),
        ],
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String icon;
  final String text;
  final VoidCallback onTap;
  const _FilterChip({required this.icon, required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: fade(Colors.white, 0.16),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            children: [
              AppIcon(icon, size: 18, color: Colors.white),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                ),
              ),
              const AppIcon('chevd', size: 16, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}
