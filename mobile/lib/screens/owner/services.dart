// Owner → Services: the services customers book (price per branch) and loading the default services.

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';
import 'owner_home.dart';

String categoryIcon(String text) {
  final c = text.toLowerCase();
  if (RegExp(r'hair|cut|colou?r|beard|shave|style').hasMatch(c)) return 'scissors';
  if (RegExp(r'beauty|skin|face|facial|makeup|tan|bridal').hasMatch(c)) return 'smile';
  if (RegExp(r'spa|massage|relax|body|wellness').hasMatch(c)) return 'lotus';
  if (RegExp(r'nail|hand|mani|pedi').hasMatch(c)) return 'hand';
  if (RegExp(r'consult|doctor|clinic|health|check').hasMatch(c)) return 'user';
  if (RegExp(r'express|quick|fast|priority').hasMatch(c)) return 'bolt';
  if (RegExp(r'desk|document|bill|pay|enquiry|info').hasMatch(c)) return 'list';
  return 'tag';
}

class ServiceThumb extends StatelessWidget {
  final Json service;
  final double size;
  const ServiceThumb(this.service, {super.key, this.size = 46});

  @override
  Widget build(BuildContext context) {
    final name = service.s('category').isEmpty ? service.s('name') : service.s('category');
    const hues = [292.0, 330.0, 268.0, 200.0, 28.0, 160.0, 248.0, 350.0];
    final h = hues[name.codeUnits.fold<int>(0, (a, c) => (a * 31 + c) & 0x7fffffff) % hues.length];
    final fallback = Container(
      color: HSLColor.fromAHSL(1, h, 0.6, 0.93).toColor(),
      alignment: Alignment.center,
      child: AppIcon(
        categoryIcon('${service.s('category')} ${service.s('name')}'),
        size: size * 0.46,
        color: HSLColor.fromAHSL(1, h, 0.45, 0.38).toColor(),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.3),
      child: SizedBox(
        width: size,
        height: size,
        child: NetImage(service.s('image'), width: size, height: size, fallback: fallback),
      ),
    );
  }
}

/* ======================= services ======================= */

class OwnerServices extends StatefulWidget {
  const OwnerServices({super.key});

  @override
  State<OwnerServices> createState() => _OwnerServicesState();
}

class _OwnerServicesState extends State<OwnerServices> {
  final GlobalKey<LoadedState<Json>> key = GlobalKey<LoadedState<Json>>();
  String q = '';
  String group = '';
  String show = 'all';

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      key: key,
      load: loadOwner,
      builder: (context, d, reload) {
        final cur = d.m('salon').s('currency', '₹');
        final all = d.l('services')
          ..sort((a, b) => '${a.s('category', '~')}${a.s('name')}'.compareTo('${b.s('category', '~')}${b.s('name')}'));
        int staffCount(String id) => d.l('staff').where((s) => s.ls('serviceIds').contains(id)).length;
        final groups = <String>{
          for (final x in all)
            if (x.s('category').isNotEmpty) x.s('category'),
        }.toList()..sort();
        final services = all.where((x) {
          if (group.isNotEmpty && x.s('category') != group) return false;
          if (show == 'active' && !x.b('active', true)) return false;
          if (show == 'hidden' && x.b('active', true)) return false;
          if (show == 'nostaff' && staffCount(x.s('id')) > 0) return false;
          return textMatches(q, [x.s('name'), x.s('category'), x.s('description')]);
        }).toList();
        return PageScroll(
          title: 'Services',
          subtitle: '${plural(all.length, 'service')} · customers see active services someone offers',
          onRefresh: reload,
          actions: [
            HeaderAction(
              'plus',
              tooltip: 'Add service',
              label: 'Add',
              onPressed: () async {
                if (await editService(context, d, null)) reload();
              },
            ),
          ],
          children: [
            Btn(
              'Load default services',
              icon: 'download',
              kind: BtnKind.soft,
              expand: true,
              onPressed: () async {
                if (await openLoadDefaults(context, d)) reload();
              },
            ),
            const SizedBox(height: 14),
            if (all.isNotEmpty)
              ListFilters(
                hint: 'Search services',
                onSearch: (v) => setState(() => q = v),
                chips: [
                  FilterChips<String>(
                    options: const {'all': 'All', 'active': 'Active', 'hidden': 'Hidden', 'nostaff': 'No staff'},
                    value: show,
                    onChanged: (v) => setState(() => show = v),
                  ),
                  if (groups.length > 1)
                    FilterChips<String>(
                      options: {'': 'All groups', for (final g in groups) g: g},
                      value: group,
                      onChanged: (v) => setState(() => group = v),
                    ),
                ],
              ),
            if (all.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'tag',
                  title: 'No services yet',
                  text: 'Start fast with a ready list of common services, then change prices and times to suit your business.',
                ),
              )
            else if (services.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'search',
                  title: 'No services match',
                  text: 'Try another word or clear the filters.',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$group|$show'),
                all: services,
                gap: 14,
                itemBuilder: (x) {
                  final n = staffCount(x.s('id'));
                  final active = x.b('active', true);
                  return ListCard(
                    dim: !active,
                    onTap: () async {
                      if (await editService(context, d, x)) reload();
                    },
                    leading: ServiceThumb(x, size: 54),
                    title: x.s('name'),
                    subtitle: x.s('category').isEmpty ? 'No group' : x.s('category'),
                    subtitleIcon: 'tag',
                    trailing: Text(
                      money(x.d('price'), cur),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Tk.ink),
                    ),
                    detailIcon: 'users',
                    detail: n == 0
                        ? 'No staff linked – customers can’t book it yet'
                        : '${plural(n, 'staff member', 'staff members')} can do this',
                    detailWarn: n == 0,
                    tags: [
                      Tag('${x.i('duration')} min', icon: 'clock', tone: TagTone.brand),
                      active ? const Tag('Active', dot: true, tone: TagTone.green) : const Tag('Hidden', dot: true),
                      if (d.l('branches').length > 1 &&
                          x['branchPrices'] is Map &&
                          (x['branchPrices'] as Map).isNotEmpty)
                        const Tag('Price varies by branch', icon: 'tag', tone: TagTone.amber),
                    ],
                    actions: [
                      CardAction(
                        'trash',
                        tooltip: 'Delete',
                        danger: true,
                        onPressed: () async {
                          final ok = await confirmDialog(
                            context,
                            title: 'Delete ${x.s('name')}?',
                            message: 'It disappears from booking. Past tokens keep their records.',
                            confirm: 'Delete',
                          );
                          if (!ok || !context.mounted) return;
                          final r = await runAction(
                            context,
                            () => session.api.delete('/api/owner/services/${x.s('id')}'),
                            done: 'Service deleted',
                          );
                          if (r != null) reload();
                        },
                      ),
                    ],
                  );
                },
              ),
          ],
        );
      },
    );
  }
}

Future<bool> editService(BuildContext context, Json d, Json? svc) {
  final isNew = svc == null;
  final s = svc ?? <String, dynamic>{};
  final name = TextEditingController(text: s.s('name'));
  final category = TextEditingController(text: s.s('category'));
  final desc = TextEditingController(text: s.s('description'));
  final price = TextEditingController(text: isNew ? '' : _num(s.d('price')));
  final duration = TextEditingController(text: isNew ? '30' : '${s.i('duration', 30)}');
  var image = s.s('image');
  var active = s.b('active', true);
  final branchIds = <String>{...s.ls('branchIds')};
  final branches = d.l('branches');
  // "All branches" = a default service offered everywhere; "Selected branches" = only the ticked ones.
  var scope = branchIds.isEmpty ? 'all' : 'some';
  final ownPrices = s['branchPrices'] is Map
      ? Map<String, dynamic>.from(s['branchPrices'] as Map)
      : <String, dynamic>{};
  final branchPrice = {
    for (final br in branches)
      br.s('id'): TextEditingController(
        text: ownPrices[br.s('id')] is num ? _num((ownPrices[br.s('id')] as num).toDouble()) : '',
      ),
  };
  final groups = <String>{
    ...d.l('services').map((x) => x.s('category')).where((x) => x.isNotEmpty),
    ...d.ls('serviceGroups'),
  }.toList()..sort();
  final cur = d.m('salon').s('currency', '₹');
  return FormPage.open(
    context,
    title: isNew ? 'Add service' : 'Edit service',
    submitLabel: isNew ? 'Add service' : 'Save changes',
    builder: (ctx, setState) => [
      FieldX(
        'Service name',
        name,
        required: true,
        maxLength: 80,
        hint: 'e.g. Consultation',
        caps: TextCapitalization.sentences,
      ),
      FieldX(
        'Category',
        category,
        maxLength: 40,
        helper: 'Groups services for customers.',
        caps: TextCapitalization.words,
      ),
      if (groups.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final g in groups)
                ChoiceChip(
                  label: Text(g),
                  selected: category.text.toLowerCase() == g.toLowerCase(),
                  onSelected: (_) => setState(() => category.text = g),
                  showCheckmark: false,
                ),
            ],
          ),
        ),
      Row(
        children: [
          Expanded(
            child: FieldX(
              branches.length > 1 ? 'Normal price ($cur)' : 'Price ($cur)',
              price,
              required: true,
              keyboard: const TextInputType.numberWithOptions(decimal: true),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: FieldX('Time (minutes)', duration, required: true, keyboard: TextInputType.number)),
        ],
      ),
      FieldX('Short description', desc, maxLength: 200, hint: 'Optional', maxLines: 2),
      ImageField(
        'Photo',
        value: image,
        maxSize: 600,
        hint: 'Square, shown in the booking list.',
        onChanged: (v) => setState(() => image = v),
      ),
      if (branches.length > 1)
        FieldGroup(
          'Available at',
          children: [
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                ChoiceChip(
                  label: const Text('All branches (default service)'),
                  selected: scope == 'all',
                  showCheckmark: false,
                  onSelected: (_) => setState(() => scope = 'all'),
                ),
                ChoiceChip(
                  label: const Text('Selected branches'),
                  selected: scope == 'some',
                  showCheckmark: false,
                  onSelected: (_) => setState(() => scope = 'some'),
                ),
              ],
            ),
            if (scope == 'some')
              for (final br in branches)
                CheckboxListTile(
                  contentPadding: const EdgeInsets.only(left: 16),
                  value: branchIds.contains(br.s('id')),
                  title: Text(br.s('name')),
                  onChanged: (v) =>
                      setState(() => v == true ? branchIds.add(br.s('id')) : branchIds.remove(br.s('id'))),
                ),
          ],
        ),
      if (branches.length > 1)
        FieldGroup(
          'Price at each branch',
          hint: 'Leave a branch blank to use the normal price.',
          children: [
            for (final br in branches)
              if (scope == 'all' || branchIds.contains(br.s('id')))
                FieldX(
                  br.s('name'),
                  branchPrice[br.s('id')]!,
                  hint: price.text.trim().isEmpty ? 'Normal price' : price.text.trim(),
                  keyboard: const TextInputType.numberWithOptions(decimal: true),
                ),
          ],
        ),
      SwitchRow(
        'Show to customers',
        hint: 'Turn off to hide it from booking without deleting it.',
        value: active,
        onChanged: (v) => setState(() => active = v),
      ),
    ],
    onSubmit: () async {
      if (branches.length > 1 && scope == 'some' && branchIds.isEmpty)
        throw ApiException(400, 'Tick at least one branch, or choose All branches.');
      final ids = scope == 'all' ? <String>[] : branchIds.toList();
      final prices = <String, double>{
        for (final br in branches)
          if ((scope == 'all' || ids.contains(br.s('id'))) &&
              double.tryParse(branchPrice[br.s('id')]!.text.trim()) != null)
            br.s('id'): double.parse(branchPrice[br.s('id')]!.text.trim()),
      };
      final body = {
        'name': name.text.trim(),
        'category': category.text.trim(),
        'description': desc.text.trim(),
        'price': double.tryParse(price.text.trim()) ?? 0,
        'duration': int.tryParse(duration.text.trim()) ?? 30,
        'image': image,
        'branchIds': ids,
        'branchPrices': prices,
        'active': active,
      };
      if (isNew) {
        await session.api.post('/api/owner/services', body);
      } else {
        await session.api.put('/api/owner/services/${s.s('id')}', body);
      }
    },
  );
}

String _num(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();

/// Pick from the super admin's default services (for this business's category) and copy them in.
Future<bool> openLoadDefaults(BuildContext context, Json d) async {
  final r = await Navigator.of(context)
      .push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => _LoadDefaultsPage(d: d)));
  return r == true;
}

class _LoadDefaultsPage extends StatefulWidget {
  final Json d;
  const _LoadDefaultsPage({required this.d});

  @override
  State<_LoadDefaultsPage> createState() => _LoadDefaultsPageState();
}

class _LoadDefaultsPageState extends State<_LoadDefaultsPage> {
  Json? data;
  Object? error;
  final Set<String> picked = {};
  bool assignAll = true;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await session.api.getJson('/api/owner/default-services');
      if (!mounted) return;
      setState(() {
        data = r;
        picked
          ..clear()
          ..addAll(r.l('services').where((x) => !x.b('added')).map((x) => x.s('id')));
      });
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> _submit() async {
    setState(() => busy = true);
    try {
      final r = asJson(
        await session.api.post('/api/owner/default-services/load', {'ids': picked.toList(), 'assignAll': assignAll}),
      );
      if (!mounted) return;
      final n = r.i('added');
      toast(
        context,
        n > 0 ? '${plural(n, 'service')} added – edit them any time' : 'Those services are already in your list',
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final cur = widget.d.m('salon').s('currency', '₹');
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
      final list = data!.l('services');
      final available = list.where((x) => !x.b('added')).toList();
      final category = data!.s('category');
      body = Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              children: [
                Text(
                  '${category.isNotEmpty ? 'Services for $category and for all businesses. ' : ''}They’re copied into your business. Change the price, time or photo, or delete them – it only affects your business.',
                  style: const TextStyle(color: Tk.ink2, height: 1.45),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        available.isEmpty
                            ? 'You already have all of these'
                            : '${plural(picked.length, 'service')} selected',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (available.isNotEmpty)
                      TextButton(
                        onPressed: () => setState(() {
                          if (picked.length == available.length) {
                            picked.clear();
                          } else {
                            picked
                              ..clear()
                              ..addAll(available.map((x) => x.s('id')));
                          }
                        }),
                        child: Text(
                          picked.length == available.length ? 'Clear all' : 'Select all',
                          style: TextStyle(color: b.ink),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                if (list.isEmpty) const EmptyState(icon: 'tag', title: 'There are no default services yet'),
                for (final x in list)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Opacity(
                      opacity: x.b('added') ? 0.55 : 1,
                      child: AppCard(
                        padding: const EdgeInsets.all(12),
                        borderColor: picked.contains(x.s('id')) ? b.c : null,
                        onTap: x.b('added')
                            ? null
                            : () => setState(
                                () => picked.contains(x.s('id')) ? picked.remove(x.s('id')) : picked.add(x.s('id')),
                              ),
                        child: Row(
                          children: [
                            Checkbox(
                              value: x.b('added') || picked.contains(x.s('id')),
                              onChanged: x.b('added')
                                  ? null
                                  : (_) => setState(
                                      () =>
                                          picked.contains(x.s('id')) ? picked.remove(x.s('id')) : picked.add(x.s('id')),
                                    ),
                            ),
                            ServiceThumb(x, size: 40),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          x.s('name'),
                                          style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                                        ),
                                      ),
                                      if (category.isNotEmpty && !x.b('forAll'))
                                        Padding(
                                          padding: const EdgeInsets.only(left: 6),
                                          child: Pill('For $category', bg: b.tint, fg: b.ink),
                                        ),
                                    ],
                                  ),
                                  Text(
                                    x.b('added')
                                        ? 'Already in your services'
                                        : [x.s('category'), x.s('description')].where((e) => e.isNotEmpty).join(' · '),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(money(x.d('price'), cur), style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text('${x.i('duration')} min', style: const TextStyle(color: Tk.ink3, fontSize: 12)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                if (widget.d.l('staff').isNotEmpty)
                  SwitchRow(
                    'All my staff can do these',
                    hint: 'Turn off to choose staff for each service yourself.',
                    value: assignAll,
                    onChanged: (v) => setState(() => assignAll = v),
                  ),
              ],
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
              child: Btn(
                picked.isEmpty ? 'Choose services' : 'Add ${plural(picked.length, 'service')}',
                icon: 'download',
                expand: true,
                busy: busy,
                onPressed: picked.isEmpty ? null : _submit,
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
        title: const Text('Load default services'),
      ),
      body: body,
    );
  }
}

/* ======================= staff ======================= */
