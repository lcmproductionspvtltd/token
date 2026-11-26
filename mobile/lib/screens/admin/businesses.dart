// Super admin → businesses: figures, search and filters, the business list and its cards, and
// selecting many businesses to change their settings together.
// The form, links, menus & features and referral links are in the business_*.dart / referral_links.dart files.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';
import 'business_features.dart';
import 'business_form.dart';
import 'referral_links.dart';

class CategoryChip extends StatelessWidget {
  final Json? category;
  final String none;
  const CategoryChip(this.category, {super.key, this.none = ''});

  @override
  Widget build(BuildContext context) {
    if (category == null)
      return none.isEmpty ? const SizedBox.shrink() : Pill(none, bg: Tk.offBg, fg: Tk.offFg, icon: 'globe');
    final c = parseHexColor(category!.s('color'));
    return Pill(
      category!.s('name'),
      bg: mix(c, 0.12, Colors.white),
      fg: mix(c, 0.8, Colors.black),
      icon: category!.s('icon', 'store'),
    );
  }
}

class AdminBusinesses extends StatefulWidget {
  const AdminBusinesses({super.key});

  @override
  State<AdminBusinesses> createState() => _AdminBusinessesState();
}

class _AdminBusinessesState extends State<AdminBusinesses> {
  final GlobalKey<LoadedState<Json>> key = GlobalKey<LoadedState<Json>>();
  String q = '';
  String status = 'all';
  String cat = '';
  String onboard = '';
  bool selecting = false; // ticking businesses for a bulk change
  final Set<String> picked = {};

  @override
  Widget build(BuildContext context) {
    final canBulk = session.can('salons.edit') || session.can('salons.toggle');
    return Loaded<Json>(
      key: key,
      load: () => session.api.getJson('/api/admin/data'),
      builder: (context, d, reload) {
        final b = brandOf(context);
        final st = d.m('stats');
        final cats = d.l('categories');
        final ql = q.trim().toLowerCase();
        final all = d.l('salons');
        final shown = all.where((x) {
          final okStatus =
              status == 'all' ||
              (status == 'active' && x.b('active') && !x.b('expired')) ||
              (status == 'expired' && x.b('expired')) ||
              (status == 'disabled' && !x.b('active'));
          final okCat = cat.isEmpty || (cat == 'none' ? x.s('categoryId').isEmpty : x.s('categoryId') == cat);
          final ob = x.m('onboard');
          final okOnboard =
              onboard.isEmpty ||
              (onboard.startsWith('by:')
                  ? ob.s('byId') == onboard.substring(3)
                  : onboard.startsWith('label:')
                  ? ob.s('label') == onboard.substring(6)
                  : ob.s('source') == onboard);
          final hay = [
            x.s('name'),
            x.s('slug'),
            x.s('ownerName'),
            x.s('ownerEmail'),
            x.s('ownerMobile'),
            x.s('ownerUsername'),
          ].join(' ').toLowerCase();
          return okStatus && okCat && okOnboard && (ql.isEmpty || hay.contains(ql));
        }).toList();
        final showMoney = st['revenue'] != null;
        picked.removeWhere((id) => !all.any((x) => x.s('id') == id));
        final page = PageScroll(
          title: 'Businesses',
          subtitle: 'Everything sold on this BQuee platform',
          onRefresh: reload,
          actions: [
            if (canBulk)
              HeaderAction(
                selecting ? 'x' : 'check',
                tooltip: selecting ? 'Stop selecting' : 'Select businesses',
                label: selecting ? 'Done' : 'Select',
                onPressed: () => setState(() {
                  selecting = !selecting;
                  picked.clear();
                }),
              ),
            HeaderAction('share', tooltip: 'Referral links', onPressed: () => openReferral(context)),
            if (session.can('salons.create'))
              HeaderAction(
                'plus',
                tooltip: 'New business',
                label: 'New',
                onPressed: () async {
                  final created = await editBusiness(context, null, cats, showMoney);
                  await reload();
                  if (created != null && context.mounted) {
                    final fresh = (key.currentState?.data ?? d)
                        .l('salons')
                        .where((x) => x.s('id') == created.s('id'))
                        .toList();
                    if (fresh.isNotEmpty) showLinks(context, fresh.first, password: created.s('password'));
                  }
                },
              ),
          ],
          children: [
            Figures([
              FigureItem('Businesses', '${st.i('salons')}', 'store', b.c),
              FigureItem('Active', '${st.i('active')}', 'check', Tk.green),
              FigureItem('Expired', '${st.i('expired')}', 'calendar', Tk.amber),
              FigureItem('Disabled', '${st.i('disabled')}', 'x', const Color(0xFF64748B)),
              FigureItem('Tokens today', '${st.i('tokensToday')}', 'ticket', Tk.rose),
              if (showMoney) FigureItem('Plan revenue', money(st.d('revenue')), 'chart', Tk.teal),
            ]),
            const SizedBox(height: 18),
            ListFilters(
              hint: 'Search business, owner, phone',
              onSearch: (v) => setState(() => q = v),
              chips: [
                FilterChips<String>(
                  options: const {'all': 'All', 'active': 'Active', 'expired': 'Expired', 'disabled': 'Disabled'},
                  value: status,
                  onChanged: (v) => setState(() => status = v),
                ),
                if (cats.isNotEmpty)
                  FilterChips<String>(
                    options: {
                      '': 'All categories',
                      for (final c in cats) c.s('id'): c.s('name'),
                      'none': 'No category',
                    },
                    value: cat,
                    onChanged: (v) => setState(() => cat = v),
                  ),
                FilterChips<String>(
                  options: {
                    '': 'All onboarding',
                    'signup': 'Direct sign-up',
                    'admin': 'Created by team',
                    'referral': 'Referral links',
                    for (final x in all)
                      if (x.m('onboard').s('byId').isNotEmpty)
                        'by:${x.m('onboard').s('byId')}': 'By ${x.m('onboard').s('byName')}',
                    for (final x in all)
                      if (x.m('onboard').s('label').isNotEmpty)
                        'label:${x.m('onboard').s('label')}': 'Link: ${x.m('onboard').s('label')}',
                  },
                  value: onboard,
                  onChanged: (v) => setState(() => onboard = v),
                ),
              ],
            ),
            const SizedBox(height: 16),
            SectionTitle(plural(shown.length, 'business', 'businesses')),
            if (shown.isEmpty)
              AppCard(
                child: EmptyState(
                  icon: all.isEmpty ? 'store' : 'search',
                  title: all.isEmpty ? 'No businesses yet' : 'No businesses match',
                  text: all.isEmpty
                      ? 'Each business gets an owner sign-in, a first branch and its own booking pages.'
                      : '',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$status|$cat'),
                all: shown,
                gap: 14,
                itemBuilder: (x) => _BusinessCard(
                  x: x,
                  cats: cats,
                  showMoney: showMoney,
                  reload: reload,
                  picked: selecting ? picked.contains(x.s('id')) : null,
                  onPick: () =>
                      setState(() => picked.contains(x.s('id')) ? picked.remove(x.s('id')) : picked.add(x.s('id'))),
                ),
              ),
          ],
        );
        if (!selecting) return page;
        return Column(
          children: [
            Expanded(child: page),
            _BulkBar(
              count: picked.length,
              shown: shown.length,
              allShown: shown.every((x) => picked.contains(x.s('id'))),
              onAll: () => setState(() => picked.addAll(shown.map((x) => x.s('id')))),
              onChange: () async {
                if (await editBusinessesBulk(context, picked.toList())) {
                  setState(() {
                    picked.clear();
                    selecting = false;
                  });
                  reload();
                }
              },
            ),
          ],
        );
      },
    );
  }
}

/// Bar under the list while selecting: how many are ticked, tick all shown, change their settings.
class _BulkBar extends StatelessWidget {
  final int count;
  final int shown;
  final bool allShown;
  final VoidCallback onAll;
  final VoidCallback onChange;
  const _BulkBar({
    required this.count,
    required this.shown,
    required this.allShown,
    required this.onAll,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
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
                    count == 0 ? 'Tap businesses to select' : '${plural(count, 'business', 'businesses')} selected',
                    style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                  ),
                  if (!allShown && shown > 0)
                    GestureDetector(
                      onTap: onAll,
                      child: Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          'Select all $shown shown',
                          style: TextStyle(color: brandOf(context).c, fontWeight: FontWeight.w600, fontSize: 13),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Btn('Change settings', icon: 'shield', small: true, onPressed: count == 0 ? null : onChange),
          ],
        ),
      ),
    );
  }
}

class _BusinessCard extends StatelessWidget {
  final Json x;
  final List<Json> cats;
  final bool showMoney;
  final Future<void> Function() reload;

  /// null when not selecting; otherwise whether this business is ticked.
  final bool? picked;
  final VoidCallback onPick;
  const _BusinessCard({
    required this.x,
    required this.cats,
    required this.showMoney,
    required this.reload,
    required this.picked,
    required this.onPick,
  });

  @override
  Widget build(BuildContext context) {
    final category = cats.where((c) => c.s('id') == x.s('categoryId')).toList();
    final status = !x.b('active')
        ? const Tag('Disabled', dot: true, tone: TagTone.red)
        : (x.b('expired')
              ? const Tag('Expired', dot: true, tone: TagTone.amber)
              : const Tag('Active', dot: true, tone: TagTone.green));
    final plan = [
      x.s('plan', 'No plan'),
      if (showMoney && x['amount'] != null) money(x.d('amount'), x.s('currency', '₹')),
      x.s('expiresAt').isNotEmpty ? 'till ${dayText(x.s('expiresAt'))}' : 'no expiry',
    ].join(' · ');
    final selecting = picked != null;
    final mark = BizMark(logo: x.s('logo'), color: parseHexColor(x.s('color')), size: 54);
    return ListCard(
      dim: !x.b('active') && !selecting,
      onTap: selecting
          ? onPick
          : session.can('salons.edit')
          ? () async {
              await editBusiness(context, x, cats, showMoney);
              reload();
            }
          : null,
      leading: selecting ? _Ticked(on: picked!, child: mark) : mark,
      title: x.s('name'),
      subtitle: category.isNotEmpty ? category.first.s('name') : '/s/${x.s('slug')}',
      subtitleIcon: 'store',
      trailing: status,
      detailIcon: 'user',
      detail: [
        x.s('ownerName', 'No owner name'),
        if (x.s('ownerUsername').isNotEmpty) '@${x.s('ownerUsername')}',
        x.s('ownerMobile'),
      ].where((e) => e.isNotEmpty).join(' · '),
      body: Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                _activity('qr', '${x.i('branches')}', 'Branches'),
                _activity('users', '${x.i('staff')}', 'Staff'),
                _activity('ticket', '${x.i('tokensToday')}', 'Today'),
                _activity('chart', '${x.i('tokensTotal')}', 'Total'),
              ],
            ),
          ],
        ),
      ),
      tags: [
        Tag(plan, icon: 'calendar', tone: TagTone.brand),
        if (x.b('selfSignup')) const Tag('Signed up', icon: 'user', tone: TagTone.blue),
        onboardTag(x.m('onboard')),
        if (x.m('features').b('maskContacts')) const Tag('Contacts hidden', icon: 'eye', tone: TagTone.amber),
        if (menusOff(x.m('features')) > 0) Tag('${plural(menusOff(x.m('features')), 'menu')} off', icon: 'menu'),
      ],
      actions: selecting
          ? const <Widget>[]
          : [
              CardAction('link', tooltip: 'Sign-in links', onPressed: () => showLinks(context, x)),
              if (session.can('salons.edit'))
                CardAction(
                  'shield',
                  tooltip: 'Menus & features',
                  onPressed: () async {
                    if (await editFeatures(context, x)) reload();
                  },
                ),
              if (session.can('salons.toggle'))
                CardAction(
                  'power',
                  tooltip: x.b('active') ? 'Disable' : 'Enable',
                  onPressed: () async {
                    if (x.b('active')) {
                      final ok = await confirmDialog(
                        context,
                        title: 'Disable ${x.s('name')}?',
                        message: 'Online booking and the business’s sign-ins stop until you enable it again.',
                        confirm: 'Disable',
                      );
                      if (!ok) return;
                    }
                    if (!context.mounted) return;
                    final r = await runAction(
                      context,
                      () => session.api.put('/api/admin/salons/${x.s('id')}', {'active': !x.b('active')}),
                      done: x.b('active') ? 'Business disabled' : 'Business enabled',
                    );
                    if (r != null) reload();
                  },
                ),
              if (session.can('salons.delete'))
                CardAction(
                  'trash',
                  tooltip: 'Delete',
                  danger: true,
                  onPressed: () async {
                    final ok = await confirmDialog(
                      context,
                      title: 'Delete ${x.s('name')}?',
                      message: 'This deletes the business with all its branches, staff, tokens, sign-ins and images. It can’t be undone.',
                      confirm: 'Delete business',
                    );
                    if (!ok || !context.mounted) return;
                    final r = await runAction(
                      context,
                      () => session.api.delete('/api/admin/salons/${x.s('id')}'),
                      done: 'Business deleted',
                    );
                    if (r != null) reload();
                  },
                ),
            ],
    );
  }

  Widget _activity(String icon, String value, String label) => Expanded(
    child: Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AppIcon(icon, size: 15, color: Tk.ink3),
            const SizedBox(width: 5),
            Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Tk.ink),
            ),
          ],
        ),
        Text(
          label,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: Tk.ink3, fontSize: 11.5),
        ),
      ],
    ),
  );
}

/// A business's mark with a tick circle on its corner (select mode).
class _Ticked extends StatelessWidget {
  final bool on;
  final Widget child;
  const _Ticked({required this.on, required this.child});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        child,
        Positioned(
          right: -4,
          bottom: -4,
          child: Container(
            width: 24,
            height: 24,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: on ? b.c : Colors.white,
              border: Border.all(color: on ? Colors.white : Tk.line2, width: 2),
            ),
            child: on ? const AppIcon('check', size: 13, color: Colors.white, stroke: 2.8) : null,
          ),
        ),
      ],
    );
  }
}
