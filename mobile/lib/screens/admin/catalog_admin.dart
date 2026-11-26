// Super admin → business categories (with service groups) and default services.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';
import '../owner/services.dart' show ServiceThumb;

const List<String> kCategorySwatches = [
  '#7b2c9e',
  '#b0357a',
  '#dc2626',
  '#c2410c',
  '#ca8a04',
  '#15803d',
  '#0f8a7e',
  '#0284c7',
  '#2563eb',
  '#4f46e5',
  '#475569',
];

Future<Json> _loadCategories() => session.api.getJson('/api/admin/categories');

/* ======================= categories ======================= */

class AdminCategories extends StatelessWidget {
  const AdminCategories({super.key});

  @override
  Widget build(BuildContext context) {
    final canEdit = session.can('defaults.manage');
    return Loaded<Json>(
      load: _loadCategories,
      builder: (context, d, reload) {
        final cats = d.l('categories');
        final icons = d.ls('icons');
        final general = <String, dynamic>{
          'id': 'general',
          'name': 'All businesses',
          'icon': 'globe',
          'color': '#475569',
          'groups': d['generalGroups'] ?? <dynamic>[],
        };
        return PageScroll(
          title: 'Categories',
          subtitle: 'Group businesses by type – each gets its own default services and groups',
          onRefresh: reload,
          actions: [
            if (canEdit)
              HeaderAction(
                'plus',
                tooltip: 'Add category',
                label: 'Add',
                onPressed: () async {
                  if (await editCategory(context, null, icons)) reload();
                },
              ),
          ],
          children: [
            _CategoryCard(c: general, general: true, canEdit: canEdit, icons: icons, reload: reload),
            const SizedBox(height: 12),
            if (cats.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'grid',
                  title: 'No categories yet',
                  text: 'e.g. Clinic, Salon & spa, Service centre, Bank',
                ),
              )
            else
              PagedColumn<Json>(
                all: cats,
                gap: 12,
                itemBuilder: (c) => _CategoryCard(c: c, canEdit: canEdit, icons: icons, reload: reload),
              ),
          ],
        );
      },
    );
  }
}

class _CategoryCard extends StatelessWidget {
  final Json c;
  final bool general;
  final bool canEdit;
  final List<String> icons;
  final Future<void> Function() reload;
  const _CategoryCard({
    required this.c,
    this.general = false,
    required this.canEdit,
    required this.icons,
    required this.reload,
  });

  @override
  Widget build(BuildContext context) {
    final col = parseHexColor(c.s('color'));
    final groups = c.l('groups');
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(Tk.rLg),
        border: Border.all(color: mix(col, 0.18, Tk.line)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [mix(col, 0.10, Colors.white), Colors.white],
          stops: const [0, 0.6],
        ),
        boxShadow: [BoxShadow(color: fade(col, 0.18), blurRadius: 26, offset: const Offset(0, 12), spreadRadius: -16)],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [col, mix(col, 0.7, Colors.black)],
                  ),
                ),
                alignment: Alignment.center,
                child: AppIcon(c.s('icon', 'store'), size: 22, color: Colors.white, stroke: 2),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      c.s('name'),
                      style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700, color: Tk.ink),
                    ),
                    Text(
                      general
                          ? 'Groups every business can use'
                          : '${plural(c.i('businesses'), 'business', 'businesses')} · ${plural(c.i('services'), 'default service')}',
                      style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              if (canEdit && !general) ...[
                IconBtn(
                  'edit',
                  tooltip: 'Edit',
                  size: 36,
                  onPressed: () async {
                    if (await editCategory(context, c, icons)) reload();
                  },
                ),
                const SizedBox(width: 6),
                IconBtn(
                  'trash',
                  tooltip: 'Delete',
                  danger: true,
                  size: 36,
                  onPressed: () async {
                    final ok = await confirmDialog(
                      context,
                      title: 'Delete ${c.s('name')}?',
                      message:
                          'Its ${plural(c.i('businesses'), 'business', 'businesses')} and ${plural(c.i('services'), 'default service')} are kept but no longer have a category. Default services without a category are offered to every business.',
                      confirm: 'Delete category',
                    );
                    if (!ok || !context.mounted) return;
                    final r = await runAction(
                      context,
                      () => session.api.delete('/api/admin/categories/${c.s('id')}'),
                      done: 'Category deleted',
                    );
                    if (r != null) reload();
                  },
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          if (groups.isEmpty)
            const Text(
              'No service groups yet',
              style: TextStyle(color: Tk.ink3, fontStyle: FontStyle.italic, fontSize: 12.5),
            )
          else
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final g in groups)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: mix(col, 0.22, Tk.line)),
                    ),
                    child: Text(
                      g.s('name'),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: mix(col, 0.7, Tk.ink)),
                    ),
                  ),
              ],
            ),
          const SizedBox(height: 12),
          Btn(
            canEdit ? 'Manage service groups' : 'Service groups',
            icon: 'list',
            kind: BtnKind.soft,
            small: true,
            expand: true,
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => _GroupsPage(category: c, canEdit: canEdit),
                ),
              );
              reload();
            },
          ),
        ],
      ),
    );
  }
}

Future<bool> editCategory(BuildContext context, Json? cat, List<String> icons) {
  final isNew = cat == null;
  final c = cat ?? <String, dynamic>{};
  final name = TextEditingController(text: c.s('name'));
  var icon = c.s('icon', 'store');
  var color = c.s('color', '#7b2c9e').toLowerCase();
  return FormPage.open(
    context,
    title: isNew ? 'Add business category' : 'Edit ${c.s('name')}',
    submitLabel: isNew ? 'Add category' : 'Save changes',
    builder: (ctx, setState) {
      final col = parseHexColor(color);
      return [
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 18),
          decoration: BoxDecoration(color: mix(col, 0.08, Colors.white), borderRadius: BorderRadius.circular(16)),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  gradient: LinearGradient(colors: [col, mix(col, 0.7, Colors.black)]),
                ),
                alignment: Alignment.center,
                child: AppIcon(icon, size: 22, color: Colors.white, stroke: 2),
              ),
              const SizedBox(width: 12),
              Text(
                name.text.isEmpty ? 'Category name' : name.text,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ],
          ),
        ),
        FieldX(
          'Name',
          name,
          required: true,
          maxLength: 50,
          hint: 'e.g. Clinic & healthcare',
          caps: TextCapitalization.sentences,
          onChanged: (_) => setState(() {}),
        ),
        const Text(
          'Icon',
          style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final i in icons)
              GestureDetector(
                onTap: () => setState(() => icon = i),
                child: Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: icon == i ? mix(col, 0.13, Colors.white) : Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: icon == i ? col : Tk.line, width: icon == i ? 1.6 : 1),
                  ),
                  alignment: Alignment.center,
                  child: AppIcon(i, size: 21, color: icon == i ? col : Tk.ink2),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        const Text(
          'Colour',
          style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
        ),
        const SizedBox(height: 8),
        Swatches(
          colors: kCategorySwatches.map((h) => parseHexColor(h)).toList(),
          value: col,
          onChanged: (v) => setState(() => color = kCategorySwatches.firstWhere((h) => parseHexColor(h) == v)),
        ),
      ];
    },
    onSubmit: () async {
      final body = {'name': name.text.trim(), 'icon': icon, 'color': color};
      if (isNew) {
        await session.api.post('/api/admin/categories', body);
      } else {
        await session.api.put('/api/admin/categories/${c.s('id')}', body);
      }
    },
  );
}

class _GroupsPage extends StatefulWidget {
  final Json category;
  final bool canEdit;
  const _GroupsPage({required this.category, required this.canEdit});

  @override
  State<_GroupsPage> createState() => _GroupsPageState();
}

class _GroupsPageState extends State<_GroupsPage> {
  List<Json> groups = [];
  bool loading = true;
  final add = TextEditingController();

  String get catId => widget.category.s('id') == 'general' ? '' : widget.category.s('id');

  @override
  void initState() {
    super.initState();
    groups = widget.category.l('groups');
    loading = false;
  }

  Future<void> _refresh() async {
    try {
      final d = await _loadCategories();
      final list = catId.isEmpty
          ? d.l('generalGroups')
          : d.l('categories').firstWhere((c) => c.s('id') == catId, orElse: () => <String, dynamic>{}).l('groups');
      if (mounted) setState(() => groups = list);
    } catch (_) {}
  }

  Future<void> _add() async {
    final n = add.text.trim();
    if (n.isEmpty) return;
    final r = await runAction(
      context,
      () => session.api.post('/api/admin/service-groups', {'name': n, 'categoryId': catId}),
      done: 'Group added',
    );
    if (r != null) {
      add.clear();
      _refresh();
    }
  }

  Future<void> _rename(Json g) async {
    final ctrl = TextEditingController(text: g.s('name'));
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        title: const Text('Rename group'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLength: 40,
          decoration: const InputDecoration(counterText: ''),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Save')),
        ],
      ),
    );
    if (name == null || name.isEmpty || name == g.s('name') || !mounted) return;
    final r = await runAction(
      context,
      () => session.api.put('/api/admin/service-groups/${g.s('id')}', {'name': name}),
      done: 'Group renamed',
    );
    if (r != null) _refresh();
  }

  Future<void> _delete(Json g) async {
    final n = g.i('services');
    final ok = await confirmDialog(
      context,
      title: 'Delete ${g.s('name')}?',
      message: n > 0
          ? '${plural(n, 'default service')} keep working but will have no group. Businesses that already loaded them aren’t changed.'
          : 'No default services use it.',
      confirm: 'Delete group',
    );
    if (!ok || !mounted) return;
    final r = await runAction(
      context,
      () => session.api.delete('/api/admin/service-groups/${g.s('id')}'),
      done: 'Group deleted',
    );
    if (r != null) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final col = parseHexColor(widget.category.s('color'));
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const AppIcon('back', size: 22),
          onPressed: () => Navigator.pop(context),
          tooltip: 'Back',
        ),
        title: Text('Groups – ${widget.category.s('name')}'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Text(
            'Groups like “Hair” or “Lab” sort the default services for ${catId.isEmpty ? 'every business' : 'this kind of business'}. You pick one when adding a default service.',
            style: const TextStyle(color: Tk.ink2, height: 1.45),
          ),
          const SizedBox(height: 14),
          if (loading)
            const Loader()
          else if (groups.isEmpty)
            const AppCard(
              child: EmptyState(icon: 'list', title: 'No groups yet'),
            )
          else
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (var i = 0; i < groups.length; i++) ...[
                    if (i > 0) const Divider(),
                    ListTile(
                      leading: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(color: col, borderRadius: BorderRadius.circular(3)),
                      ),
                      minLeadingWidth: 10,
                      title: Text(groups[i].s('name'), style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        plural(groups[i].i('services'), 'default service'),
                        style: const TextStyle(fontSize: 12.5, color: Tk.ink3),
                      ),
                      trailing: !widget.canEdit
                          ? null
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconBtn('edit', tooltip: 'Rename', size: 34, onPressed: () => _rename(groups[i])),
                                const SizedBox(width: 6),
                                IconBtn(
                                  'trash',
                                  tooltip: 'Delete',
                                  danger: true,
                                  size: 34,
                                  onPressed: () => _delete(groups[i]),
                                ),
                              ],
                            ),
                    ),
                  ],
                ],
              ),
            ),
          if (widget.canEdit) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: add,
                    maxLength: 40,
                    textCapitalization: TextCapitalization.words,
                    onSubmitted: (_) => _add(),
                    decoration: const InputDecoration(hintText: 'New group, e.g. Hair', counterText: ''),
                  ),
                ),
                const SizedBox(width: 10),
                Btn('Add', icon: 'plus', onPressed: _add),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/* ======================= default services ======================= */

class AdminDefaultServices extends StatefulWidget {
  const AdminDefaultServices({super.key});

  @override
  State<AdminDefaultServices> createState() => _AdminDefaultServicesState();
}

class _AdminDefaultServicesState extends State<AdminDefaultServices> {
  String filter = '';
  String q = '';

  Future<Json> _load() async {
    final r = await Future.wait([session.api.getJson('/api/admin/default-services'), _loadCategories()]);
    return {'services': r[0]['services'], 'categories': r[1]['categories'], 'generalGroups': r[1]['generalGroups']};
  }

  @override
  Widget build(BuildContext context) {
    final canEdit = session.can('defaults.manage');
    return Loaded<Json>(
      load: _load,
      builder: (context, d, reload) {
        final all = d.l('services');
        final cats = d.l('categories');
        final list = all
            .where((x) => filter.isEmpty || (filter == 'all' ? x.s('categoryId').isEmpty : x.s('categoryId') == filter))
            .where((x) => textMatches(q, [x.s('name'), x.s('category')]))
            .toList();
        int count(String id) =>
            all.where((x) => id == 'all' ? x.s('categoryId').isEmpty : x.s('categoryId') == id).length;
        return PageScroll(
          title: 'Default services',
          subtitle: 'A starter list service owners can load into their business',
          onRefresh: reload,
          actions: [
            if (canEdit)
              HeaderAction(
                'plus',
                tooltip: 'Add default service',
                label: 'Add',
                onPressed: () async {
                  if (await editDefault(context, null, d, filter.isEmpty || filter == 'all' ? '' : filter)) reload();
                },
              ),
          ],
          children: [
            ListFilters(
              hint: 'Search default services',
              onSearch: (v) => setState(() => q = v),
              chips: [
                FilterChips<String>(
                  options: {
                    '': 'Everything ${all.length}',
                    'all': 'All businesses ${count('all')}',
                    for (final c in cats) c.s('id'): '${c.s('name')} ${count(c.s('id'))}',
                  },
                  value: filter,
                  onChanged: (v) => setState(() => filter = v),
                ),
              ],
            ),
            if (list.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'tag',
                  title: 'No default services here',
                  text: 'Try another search or category.',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$filter'),
                all: list,
                gap: 14,
                itemBuilder: (x) {
                  final cat = cats.where((c) => c.s('id') == x.s('categoryId')).toList();
                  return ListCard(
                    onTap: canEdit
                        ? () async {
                            if (await editDefault(context, x, d, '')) reload();
                          }
                        : null,
                    leading: ServiceThumb(x, size: 54),
                    title: x.s('name'),
                    subtitle: x.s('category').isEmpty ? 'No group' : x.s('category'),
                    subtitleIcon: 'tag',
                    trailing: Text(
                      money(x.d('price')),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Tk.ink),
                    ),
                    tags: [
                      Tag('${x.i('duration')} min', icon: 'clock', tone: TagTone.brand),
                      Tag(cat.isEmpty ? 'All businesses' : cat.first.s('name'), icon: 'grid'),
                    ],
                    actions: [
                      if (canEdit)
                        CardAction(
                          'trash',
                          tooltip: 'Delete',
                          danger: true,
                          onPressed: () async {
                            final ok = await confirmDialog(
                              context,
                              title: 'Delete ${x.s('name')}?',
                              message: 'It’s removed from the default list. Businesses that already loaded it keep their own copy.',
                              confirm: 'Delete',
                            );
                            if (!ok || !context.mounted) return;
                            final r = await runAction(
                              context,
                              () => session.api.delete('/api/admin/default-services/${x.s('id')}'),
                              done: 'Default service deleted',
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

Future<bool> editDefault(BuildContext context, Json? svc, Json d, String presetCategory) {
  final isNew = svc == null;
  final s = svc ?? <String, dynamic>{};
  final cats = d.l('categories');
  final general = d.l('generalGroups');
  final name = TextEditingController(text: s.s('name'));
  final desc = TextEditingController(text: s.s('description'));
  final price = TextEditingController(text: isNew ? '' : s.d('price').toString().replaceAll(RegExp(r'\.0$'), ''));
  final duration = TextEditingController(text: isNew ? '30' : '${s.i('duration', 30)}');
  var categoryId = isNew ? presetCategory : s.s('categoryId');
  var group = s.s('category');
  var image = s.s('image');
  return FormPage.open(
    context,
    title: isNew ? 'Add default service' : 'Edit default service',
    submitLabel: isNew ? 'Add service' : 'Save changes',
    builder: (ctx, setState) {
      final chosen = cats.where((c) => c.s('id') == categoryId).toList();
      final catGroups = chosen.isEmpty ? <Json>[] : chosen.first.l('groups');
      final names = [...catGroups, ...general].map((g) => g.s('name')).toList();
      final options = <MapEntry<String, String>>[
        const MapEntry('', 'No group'),
        for (final g in catGroups) MapEntry(g.s('name'), '${g.s('name')} · ${chosen.first.s('name')}'),
        for (final g in general) MapEntry(g.s('name'), '${g.s('name')} · all businesses'),
        if (group.isNotEmpty && !names.any((n) => n.toLowerCase() == group.toLowerCase()))
          MapEntry(group, '$group (not in the list)'),
      ];
      return [
        FieldX(
          'Service name',
          name,
          required: true,
          maxLength: 80,
          hint: 'e.g. Consultation',
          caps: TextCapitalization.sentences,
        ),
        SelectX<String>(
          'Offered to',
          value: categoryId,
          helper: 'Owners of this business category see it. “All businesses” shows it to everyone.',
          options: [const MapEntry('', 'All businesses'), for (final c in cats) MapEntry(c.s('id'), c.s('name'))],
          onChanged: (v) => setState(() {
            categoryId = v;
            final c = cats.where((x) => x.s('id') == v).toList();
            final allowed = [
              ...(c.isEmpty ? <Json>[] : c.first.l('groups')),
              ...general,
            ].map((g) => g.s('name').toLowerCase());
            // A group that doesn't belong to the new category is cleared.
            if (group.isNotEmpty && !allowed.contains(group.toLowerCase())) group = '';
          }),
        ),
        SelectX<String>(
          'Group',
          value: group,
          helper:
              'Groups for ${chosen.isEmpty ? 'all businesses' : chosen.first.s('name')}. Manage them under Categories.',
          options: options,
          onChanged: (v) => setState(() => group = v),
        ),
        Row(
          children: [
            Expanded(
              child: FieldX(
                'Suggested price',
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
          hint: 'Optional. Businesses get their own copy.',
          onChanged: (v) => setState(() => image = v),
        ),
      ];
    },
    onSubmit: () async {
      final body = {
        'name': name.text.trim(),
        'category': group,
        'categoryId': categoryId,
        'description': desc.text.trim(),
        'duration': int.tryParse(duration.text.trim()) ?? 30,
        'price': double.tryParse(price.text.trim()) ?? 0,
        'image': image,
      };
      if (isNew) {
        await session.api.post('/api/admin/default-services', body);
      } else {
        await session.api.put('/api/admin/default-services/${s.s('id')}', body);
      }
    },
  );
}
