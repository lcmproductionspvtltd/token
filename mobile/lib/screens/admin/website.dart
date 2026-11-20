// Super admin → Website: edit the BQuee home (landing) page and the business sign-up settings.
// Same content and API as the web editor (/api/admin/site).

import 'dart:convert';

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';

Json _copy(Json x) => asJson(jsonDecode(jsonEncode(x)));

Future<void> _save(Json content) => session.api.put('/api/admin/site', content);

const List<MapEntry<String, String>> _sections = [
  MapEntry('stats', 'Numbers strip'),
  MapEntry('replace', 'Replace paper tokens (problems and fixes)'),
  MapEntry('features', 'Features'),
  MapEntry('steps', 'How it works'),
  MapEntry('categories', 'Business types'),
  MapEntry('app', 'Mobile app download'),
  MapEntry('locations', 'Locations'),
  MapEntry('plans', 'Pricing'),
  MapEntry('testimonials', 'Testimonials'),
  MapEntry('faqs', 'FAQ'),
  MapEntry('contact', 'Contact'),
];

/// One editable field: key, label, kind (text, area, link, email, icon, stars, check), max length.
typedef _F = (String key, String label, String kind, int max);

class _ListSpec {
  final String key;
  final String title;
  final String item;
  final String icon;
  final int max;
  final Json blank;
  final List<_F> fields;
  const _ListSpec(this.key, this.title, this.item, this.icon, this.max, this.blank, this.fields);
}

final List<_ListSpec> _lists = [
  _ListSpec(
    'replace',
    'Replace paper tokens and token machines',
    'problem',
    'ticket',
    10,
    {'problem': '', 'solution': ''},
    const [('problem', 'Problem (what goes wrong today)', 'text', 120), ('solution', 'How BQuee fixes it', 'area', 240)],
  ),
  _ListSpec(
    'locations',
    'Locations',
    'region',
    'pin',
    20,
    {'region': '', 'places': ''},
    const [('region', 'Country or region', 'text', 60), ('places', 'Cities – separated by commas', 'area', 300)],
  ),
  _ListSpec(
    'stats',
    'Numbers strip',
    'number',
    'chart',
    6,
    {'value': '', 'label': ''},
    const [('value', 'Value', 'text', 20), ('label', 'Label', 'text', 60)],
  ),
  _ListSpec(
    'features',
    'Features',
    'feature',
    'sparkle',
    12,
    {'icon': 'check', 'title': '', 'text': ''},
    const [('icon', 'Icon', 'icon', 0), ('title', 'Title', 'text', 60), ('text', 'Text', 'area', 240)],
  ),
  _ListSpec(
    'steps',
    'How it works',
    'step',
    'list',
    8,
    {'title': '', 'text': ''},
    const [('title', 'Title', 'text', 60), ('text', 'Text', 'area', 240)],
  ),
  _ListSpec(
    'plans',
    'Pricing',
    'plan',
    'tag',
    6,
    {'name': '', 'price': '', 'period': '', 'features': '', 'highlight': false},
    const [
      ('name', 'Plan name', 'text', 40),
      ('price', 'Main price, e.g. ₹999, Free or Talk to us', 'text', 30),
      ('period', 'Per (e.g. per month)', 'text', 40),
      ('priceUSD', 'Fixed price in US\$ (also used for countries without their own price) – optional', 'number', 12),
      ('priceINR', 'Fixed price in ₹ India – optional', 'number', 12),
      ('priceAED', 'Fixed price in AED UAE – optional', 'number', 12),
      ('priceSAR', 'Fixed price in SAR Saudi Arabia – optional', 'number', 12),
      ('priceQAR', 'Fixed price in QAR Qatar – optional', 'number', 12),
      ('priceOMR', 'Fixed price in OMR Oman – optional', 'number', 12),
      ('priceKWD', 'Fixed price in KWD Kuwait – optional', 'number', 12),
      ('priceBHD', 'Fixed price in BHD Bahrain – optional', 'number', 12),
      ('features', 'What’s included – one per line', 'area', 600),
      ('highlight', 'Mark as most popular', 'check', 0),
    ],
  ),
  _ListSpec(
    'testimonials',
    'Testimonials',
    'testimonial',
    'quote',
    12,
    {'name': '', 'role': '', 'text': '', 'rating': 5},
    const [
      ('name', 'Name', 'text', 60),
      ('role', 'Business or role', 'text', 60),
      ('rating', 'Stars', 'stars', 0),
      ('text', 'What they said', 'area', 400),
    ],
  ),
  _ListSpec(
    'faqs',
    'FAQ',
    'question',
    'chat',
    20,
    {'q': '', 'a': ''},
    const [('q', 'Question', 'text', 160), ('a', 'Answer', 'area', 800)],
  ),
];

_ListSpec _list(String key) => _lists.firstWhere((l) => l.key == key);

/// The editor's pages, in the order they appear on the home page (same as the web).
const _kPages = ['Setup', 'Top of page', 'Features', 'Pricing & reviews', 'FAQ & contact', 'Google & locations'];

class AdminWebsite extends StatefulWidget {
  const AdminWebsite({super.key});

  @override
  State<AdminWebsite> createState() => _AdminWebsiteState();
}

class _AdminWebsiteState extends State<AdminWebsite> {
  int page = 0;

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: () => session.api.getJson('/api/admin/site'),
      builder: (context, d, reload) {
        final c = d.m('content');
        final icons = d.ls('icons');
        final sec = c.m('sections');
        final signup = c.m('signup');
        final hero = c.m('hero');
        final app = c.m('app');
        final contact = c.m('contact');
        final onCount = _sections.where((s) => sec.b(s.key, true)).length;

        Future<void> open(Future<bool> Function() editor) async {
          if (await editor()) reload();
        }

        Widget group(
          String icon,
          String title,
          String sub,
          Future<bool> Function() editor, {
          List<Widget> tags = const [],
        }) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: ListCard(
            leading: IconChip(icon, color: brandOf(context).c, size: 42),
            title: title,
            subtitle: sub,
            trailing: const AppIcon('chevr', size: 20, color: Tk.ink3),
            tags: tags,
            onTap: () => open(editor),
          ),
        );

        Widget listGroup(String key) {
          final spec = _list(key);
          final items = c.l(key);
          final on = sec.b(key, true);
          return group(
            spec.icon,
            spec.title,
            plural(items.length, spec.item),
            () => _ListPage.show(context, spec: spec, content: c, icons: icons),
            tags: [if (!on) const Tag('Hidden on page', tone: TagTone.neutral)],
          );
        }

        return PageScroll(
          title: 'Website',
          subtitle: 'Edit the BQuee home page and business sign-up',
          onRefresh: reload,
          actions: [
            HeaderAction(
              'refresh',
              tooltip: 'Reset to defaults',
              label: 'Reset',
              onPressed: () async {
                final ok = await confirmDialog(
                  context,
                  title: 'Reset the website?',
                  message: 'All home page text, lists and sign-up settings go back to the BQuee defaults. This can’t be undone.',
                  confirm: 'Reset website',
                );
                if (!ok || !context.mounted) return;
                final r = await runAction(
                  context,
                  () => session.api.delete('/api/admin/site'),
                  done: 'Website reset to the defaults',
                );
                if (r != null) reload();
              },
            ),
          ],
          children: [
            const AppCard(
              padding: EdgeInsets.fromLTRB(16, 14, 16, 14),
              child: Row(
                children: [
                  AppIcon('globe', size: 20, color: Tk.ink3),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Changes go live on the home page as soon as you save each part.',
                      style: TextStyle(color: Tk.ink2, fontSize: 13.5, height: 1.35),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            FilterChips<int>(
              options: {for (var i = 0; i < _kPages.length; i++) i: _kPages[i]},
              value: page,
              onChanged: (v) => setState(() => page = v),
            ),
            const SizedBox(height: 14),
            if (page == 0) ...[
              group(
                'grid',
                'Sections',
                '$onCount of ${_sections.length} shown on the page',
                () => _editSections(context, c),
              ),
              group(
                'store',
                'Business sign-up',
                !signup.b('enabled', true)
                    ? 'Closed'
                    : (signup.s('mode') == 'approval'
                          ? 'Open – needs your approval'
                          : 'Open – ${signup.i('trialDays', 14)}-day free trial'),
                () => _editSignup(context, c),
                tags: [
                  Tag(
                    signup.b('enabled', true) ? 'Open' : 'Closed',
                    dot: true,
                    tone: signup.b('enabled', true) ? TagTone.green : TagTone.neutral,
                  ),
                ],
              ),
              group(
                'tag',
                'Currency rates',
                '1 US\$ = ${c.m('rates').s('AED')} AED · ${c.m('rates').s('INR')} ₹ · ${c.m('rates').s('SAR')} SAR',
                () => _editFields(context, c, 'Currency rates (1 US\$ = …)', 'rates', const [
                  ('INR', '1 US\$ = ? ₹ (India)', 'number', 12),
                  ('AED', '1 US\$ = ? AED (UAE)', 'number', 12),
                  ('SAR', '1 US\$ = ? SAR (Saudi Arabia)', 'number', 12),
                  ('QAR', '1 US\$ = ? QAR (Qatar)', 'number', 12),
                  ('OMR', '1 US\$ = ? OMR (Oman)', 'number', 12),
                  ('KWD', '1 US\$ = ? KWD (Kuwait)', 'number', 12),
                  ('BHD', '1 US\$ = ? BHD (Bahrain)', 'number', 12),
                ]),
              ),
              for (final h in _kHeadings)
                group(
                  'edit',
                  'Section title – ${h.$2}',
                  c.m('headings').m(h.$1).s('title'),
                  () => _editHeading(context, c, h.$1, h.$2),
                ),
            ],
            if (page == 1) ...[
              group(
                'home',
                'Hero (top of the page)',
                '${hero.s('title')} ${hero.s('highlight')}'.trim(),
                () => _editFields(context, c, 'Hero', 'hero', const [
                  ('badge', 'Small badge', 'text', 80),
                  ('title', 'Title', 'req', 60),
                  ('highlight', 'Coloured second line', 'text', 80),
                  ('text', 'Intro text', 'area', 400),
                  ('primary', 'Sign-up button', 'text', 30),
                  ('secondary', 'Sign-in button', 'text', 30),
                ]),
              ),
              listGroup('stats'),
            ],
            if (page == 2) ...[
              listGroup('replace'),
              listGroup('features'),
              listGroup('steps'),
              group(
                'grid',
                'Business types',
                c.s('categoriesTitle'),
                () => _editFields(context, c, 'Business types', null, const [
                  ('categoriesTitle', 'Title', 'text', 80),
                  ('categoriesText', 'Text', 'area', 240),
                ]),
                tags: [if (!sec.b('categories', true)) const Tag('Hidden on page')],
              ),
              group(
                'phoneapp',
                'Mobile app download',
                (app.s('playUrl').isEmpty && app.s('appStoreUrl').isEmpty)
                    ? 'Store links not added yet'
                    : 'Store links added',
                () => _editFields(context, c, 'Mobile app download', 'app', const [
                  ('title', 'Title', 'text', 80),
                  ('text', 'Text', 'area', 300),
                  ('playUrl', 'Google Play link (https://…)', 'link', 300),
                  ('appStoreUrl', 'App Store link (https://…)', 'link', 300),
                ]),
                tags: [if (!sec.b('app', true)) const Tag('Hidden on page')],
              ),
              group(
                'phone',
                'Customer app on business pages',
                (c.m('customerApp').s('playUrl').isEmpty && c.m('customerApp').s('appStoreUrl').isEmpty)
                    ? 'No links – buttons hidden'
                    : 'Buttons shown on business pages',
                () => _editFields(context, c, 'Customer app on business pages', 'customerApp', const [
                  ('playUrl', 'BQuee app – Google Play link (https://…)', 'link', 300),
                  ('appStoreUrl', 'BQuee app – App Store link (https://…)', 'link', 300),
                ]),
              ),
            ],
            if (page == 3) ...[listGroup('plans'), listGroup('testimonials')],
            if (page == 4) ...[
              listGroup('faqs'),
              group(
                'sparkle',
                'Call to action',
                c.m('cta').s('title'),
                () => _editFields(context, c, 'Call to action', 'cta', const [
                  ('title', 'Title', 'text', 80),
                  ('text', 'Text', 'area', 240),
                ]),
              ),
              group(
                'mail',
                'Contact',
                [
                  contact.s('email'),
                  contact.s('phone'),
                ].where((x) => x.isNotEmpty).join(' · ').ifEmpty('No contact details yet'),
                () => _editFields(context, c, 'Contact', 'contact', const [
                  ('email', 'Email', 'email', 120),
                  ('phone', 'Phone', 'phone', 30),
                  ('whatsapp', 'WhatsApp number', 'phone', 30),
                  ('address', 'Address', 'area', 240),
                ]),
                tags: [if (!sec.b('contact', true)) const Tag('Hidden on page')],
              ),
              group(
                'menu',
                'Footer',
                c.m('footer').s('text'),
                () => _editFields(context, c, 'Footer', 'footer', const [('text', 'Footer text', 'area', 240)]),
              ),
            ],
            if (page == 5) ...[
              group(
                'search',
                'Google search result',
                c.m('seo').s('title'),
                () => _editFields(context, c, 'Google search result', 'seo', const [
                  ('title', 'Title – best under 60 characters', 'text', 70),
                  ('description', 'Description – best under 160 characters', 'area', 170),
                ]),
              ),
              listGroup('locations'),
            ],
          ],
        );
      },
    );
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

/* ---------------- simple groups ---------------- */

Future<bool> _editSections(BuildContext context, Json content) {
  final next = _copy(content);
  final sec = next.m('sections');
  return FormPage.open(
    context,
    title: 'Sections',
    submitLabel: 'Save',
    builder: (context, setState) => [
      const Padding(
        padding: EdgeInsets.only(bottom: 8),
        child: Text('Turn parts of the home page on or off.', style: TextStyle(color: Tk.ink3, fontSize: 13.5)),
      ),
      for (final s in _sections)
        SwitchRow(s.value, value: sec.b(s.key, true), onChanged: (v) => setState(() => sec[s.key] = v)),
    ],
    onSubmit: () async {
      next['sections'] = sec;
      await _save(next);
    },
  );
}

Future<bool> _editSignup(BuildContext context, Json content) {
  final next = _copy(content);
  final s = next.m('signup');
  final days = TextEditingController(text: '${s.i('trialDays', 14)}');
  final plan = TextEditingController(text: s.s('planName', 'Free trial'));
  return FormPage.open(
    context,
    title: 'Business sign-up',
    submitLabel: 'Save',
    builder: (context, setState) => [
      const Padding(
        padding: EdgeInsets.only(bottom: 8),
        child: Text(
          'Only business owners can sign up. Staff are added by owners, and the BQuee team by you.',
          style: TextStyle(color: Tk.ink3, fontSize: 13.5, height: 1.35),
        ),
      ),
      SwitchRow(
        'Allow new businesses to sign up',
        hint: 'Shows Sign up buttons on the website and in the app',
        value: s.b('enabled', true),
        onChanged: (v) => setState(() => s['enabled'] = v),
      ),
      const SizedBox(height: 10),
      SelectX<String>(
        'New sign-ups',
        value: s.s('mode', 'trial'),
        options: const [
          MapEntry('trial', 'Start right away with a free trial'),
          MapEntry('approval', 'Wait until I approve them'),
        ],
        onChanged: (v) => setState(() => s['mode'] = v),
      ),
      if (s.s('mode', 'trial') == 'trial')
        FieldX(
          'Trial length (days)',
          days,
          required: true,
          keyboard: TextInputType.number,
          maxLength: 3,
          validate: (v) {
            final n = int.tryParse(v);
            return n == null || n < 1 || n > 365 ? 'Enter 1 to 365' : null;
          },
        ),
      FieldX('Plan name for new sign-ups', plan, maxLength: 40),
      if (s.s('mode', 'trial') == 'approval')
        const Text(
          'New businesses appear as Disabled in Businesses with a “Signed up” tag. Enable them to let them sign in.',
          style: TextStyle(color: Tk.ink3, fontSize: 12.5, height: 1.35),
        ),
    ],
    onSubmit: () async {
      s['trialDays'] = int.tryParse(days.text.trim()) ?? s.i('trialDays', 14);
      s['planName'] = plan.text.trim();
      next['signup'] = s;
      await _save(next);
    },
  );
}

/// Edits plain text fields of one object ([path]) or of the top level (path null).
Future<bool> _editFields(BuildContext context, Json content, String title, String? path, List<_F> fields) {
  final next = _copy(content);
  final obj = path == null ? next : next.m(path);
  final ctrl = {for (final f in fields) f.$1: TextEditingController(text: obj.s(f.$1))};
  return FormPage.open(
    context,
    title: title,
    submitLabel: 'Save',
    builder: (context, setState) => [
      for (final f in fields)
        FieldX(
          f.$2,
          ctrl[f.$1]!,
          required: f.$3 == 'req',
          maxLength: f.$4,
          maxLines: f.$3 == 'area' ? 5 : 1,
          caps: f.$3 == 'area' || f.$3 == 'text' || f.$3 == 'req'
              ? TextCapitalization.sentences
              : TextCapitalization.none,
          keyboard: switch (f.$3) {
            'link' => TextInputType.url,
            'email' => TextInputType.emailAddress,
            'phone' => TextInputType.phone,
            'area' => TextInputType.multiline,
            'number' => const TextInputType.numberWithOptions(decimal: true),
            _ => null,
          },
          validate: f.$3 == 'link'
              ? (v) => v.isEmpty || RegExp(r'^https://\S+$', caseSensitive: false).hasMatch(v)
                    ? null
                    : 'Use a full https:// link'
              : null,
        ),
    ],
    onSubmit: () async {
      for (final f in fields) {
        obj[f.$1] = ctrl[f.$1]!.text.trim();
      }
      if (path != null) next[path] = obj;
      await _save(next);
    },
  );
}

/* ---------------- lists ---------------- */

class _ListPage extends StatefulWidget {
  final _ListSpec spec;
  final Json content;
  final List<String> icons;
  const _ListPage({required this.spec, required this.content, required this.icons});

  static Future<bool> show(
    BuildContext context, {
    required _ListSpec spec,
    required Json content,
    required List<String> icons,
  }) async {
    final r = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _ListPage(spec: spec, content: content, icons: icons),
      ),
    );
    return r == true;
  }

  @override
  State<_ListPage> createState() => _ListPageState();
}

class _ListPageState extends State<_ListPage> {
  late final Json next = _copy(widget.content);
  late List<Json> items = next.l(widget.spec.key);
  bool dirty = false;
  bool busy = false;

  void _change(VoidCallback fn) => setState(() {
    fn();
    dirty = true;
  });

  String _label(Json it) {
    for (final k in ['title', 'name', 'q', 'value']) {
      final v = it.s(k);
      if (v.isNotEmpty) return v;
    }
    return 'New ${widget.spec.item}';
  }

  String _sub(Json it) {
    for (final k in ['label', 'text', 'a', 'price', 'role']) {
      final v = it.s(k);
      if (v.isNotEmpty) return v.replaceAll('\n', ' · ');
    }
    return '';
  }

  Future<void> _edit(int? index) async {
    final spec = widget.spec;
    final it = index == null ? _copy(spec.blank) : _copy(items[index]);
    final ctrl = {
      for (final f in spec.fields)
        if (f.$3 == 'text' || f.$3 == 'area') f.$1: TextEditingController(text: it.s(f.$1)),
    };
    final ok = await FormPage.open(
      context,
      title: index == null ? 'Add ${spec.item}' : 'Edit ${spec.item}',
      submitLabel: index == null ? 'Add' : 'Done',
      builder: (context, setState) => [
        for (final f in spec.fields)
          switch (f.$3) {
            'icon' => _IconPicker(
              icons: widget.icons,
              value: it.s('icon', 'check'),
              onChanged: (v) => setState(() => it['icon'] = v),
            ),
            'stars' => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    f.$2,
                    style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                  ),
                  const SizedBox(height: 8),
                  Segmented<int>(
                    options: [for (var n = 1; n <= 5; n++) MapEntry(n, '$n ★')],
                    value: it.i('rating', 5),
                    onChanged: (v) => setState(() => it['rating'] = v),
                  ),
                ],
              ),
            ),
            'check' => SwitchRow(f.$2, value: it.b(f.$1), onChanged: (v) => setState(() => it[f.$1] = v)),
            _ => FieldX(
              f.$2,
              ctrl[f.$1]!,
              required: f == spec.fields.firstWhere((x) => x.$3 == 'text'),
              maxLength: f.$4,
              maxLines: f.$3 == 'area' ? 5 : 1,
              keyboard: switch (f.$3) {
                'area' => TextInputType.multiline,
                'number' => const TextInputType.numberWithOptions(decimal: true),
                _ => null,
              },
              caps: TextCapitalization.sentences,
            ),
          },
      ],
      onSubmit: () async {
        for (final e in ctrl.entries) {
          it[e.key] = e.value.text.trim();
        }
      },
    );
    if (!ok) return;
    _change(() {
      if (index == null) {
        items.add(it);
      } else {
        items[index] = it;
      }
    });
  }

  Future<void> _saveAll() async {
    setState(() => busy = true);
    next[widget.spec.key] = items;
    final r = await runAction(context, () => _save(next), done: '${widget.spec.title} saved');
    if (!mounted) return;
    setState(() => busy = false);
    if (r != null) Navigator.of(context).pop(true);
  }

  Future<bool> _leave() async {
    if (!dirty) return true;
    return confirmDialog(
      context,
      title: 'Discard changes?',
      message: 'Your changes to ${widget.spec.title} are not saved yet.',
      confirm: 'Discard',
    );
  }

  @override
  Widget build(BuildContext context) {
    final spec = widget.spec;
    final b = brandOf(context);
    return PopScope(
      canPop: !dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _leave() && context.mounted) Navigator.of(context).pop(false);
      },
      child: Scaffold(
        backgroundColor: Tk.canvas,
        appBar: AppBar(
          backgroundColor: Colors.white,
          leading: IconButton(
            icon: const AppIcon('back', size: 22),
            tooltip: 'Back',
            onPressed: () async {
              if (await _leave() && context.mounted) Navigator.of(context).pop(false);
            },
          ),
          title: Text(spec.title),
        ),
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${plural(items.length, spec.item)} · up to ${spec.max}',
                            style: const TextStyle(color: Tk.ink3, fontSize: 13.5),
                          ),
                        ),
                        Btn(
                          'Add ${spec.item}',
                          icon: 'plus',
                          kind: BtnKind.soft,
                          small: true,
                          onPressed: items.length >= spec.max ? null : () => _edit(null),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (items.isEmpty)
                      AppCard(
                        child: EmptyState(
                          icon: spec.icon,
                          title: 'Nothing here yet',
                          text: 'Add a ${spec.item}, or turn this section off in Sections.',
                        ),
                      )
                    else
                      for (var i = 0; i < items.length; i++)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: ListCard(
                            leading: spec.key == 'features'
                                ? IconChip(items[i].s('icon', 'check'), color: b.c, size: 40)
                                : Container(
                                    width: 40,
                                    height: 40,
                                    decoration: BoxDecoration(color: b.wash, borderRadius: BorderRadius.circular(12)),
                                    alignment: Alignment.center,
                                    child: Text(
                                      '${i + 1}',
                                      style: TextStyle(color: b.c, fontWeight: FontWeight.w700, fontSize: 15),
                                    ),
                                  ),
                            title: _label(items[i]),
                            subtitle: _sub(items[i]),
                            tags: [
                              if (spec.key == 'plans' && items[i].b('highlight'))
                                const Tag('Most popular', icon: 'star', tone: TagTone.green),
                              if (spec.key == 'testimonials') StarPill(items[i].i('rating', 5)),
                            ],
                            actions: [
                              CardAction(
                                'chevd',
                                tooltip: 'Move down',
                                onPressed: i == items.length - 1
                                    ? null
                                    : () => _change(() => items.insert(i + 1, items.removeAt(i))),
                              ),
                              _UpAction(
                                onPressed: i == 0 ? null : () => _change(() => items.insert(i - 1, items.removeAt(i))),
                              ),
                              CardAction('edit', tooltip: 'Edit', onPressed: () => _edit(i)),
                              CardAction(
                                'trash',
                                tooltip: 'Remove',
                                danger: true,
                                onPressed: () => _change(() => items.removeAt(i)),
                              ),
                            ],
                            onTap: () => _edit(i),
                          ),
                        ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Tk.line)),
                ),
                child: Btn(
                  dirty ? 'Save changes' : 'No changes yet',
                  icon: 'check',
                  expand: true,
                  busy: busy,
                  onPressed: dirty ? _saveAll : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Move up" – the down chevron turned over.
class _UpAction extends StatelessWidget {
  final VoidCallback? onPressed;
  const _UpAction({this.onPressed});

  @override
  Widget build(BuildContext context) => RotatedBox(
    quarterTurns: 2,
    child: CardAction('chevd', tooltip: 'Move up', onPressed: onPressed),
  );
}

class _IconPicker extends StatelessWidget {
  final List<String> icons;
  final String value;
  final ValueChanged<String> onChanged;
  const _IconPicker({required this.icons, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Icon',
            style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final ic in icons)
                Semantics(
                  button: true,
                  selected: ic == value,
                  label: ic,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => onChanged(ic),
                    child: Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: ic == value ? b.c : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: ic == value ? b.c : Tk.line, width: 1.4),
                      ),
                      alignment: Alignment.center,
                      child: AppIcon(ic, size: 21, color: ic == value ? Colors.white : Tk.ink2, stroke: 1.9),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Home page sections whose heading the super admin can change (same list as the website editor).
const _kHeadings = [
  ('replace', 'Why switch'),
  ('features', 'Features'),
  ('steps', 'How it works'),
  ('locations', 'Locations'),
  ('plans', 'Pricing'),
  ('testimonials', 'Reviews'),
  ('faqs', 'FAQ'),
  ('contact', 'Contact'),
];

/// One section's heading: small label above, title, line under it. An empty title goes back to the built-in one.
Future<bool> _editHeading(BuildContext context, Json content, String key, String label) {
  final next = _copy(content);
  final all = next.m('headings');
  final h = all.m(key);
  final kicker = TextEditingController(text: h.s('kicker'));
  final title = TextEditingController(text: h.s('title'));
  final text = TextEditingController(text: h.s('text'));
  return FormPage.open(
    context,
    title: 'Section title – $label',
    submitLabel: 'Save',
    builder: (context, setState) => [
      FieldX('Small label above', kicker, maxLength: 30, caps: TextCapitalization.sentences),
      FieldX('Title', title, maxLength: 100, caps: TextCapitalization.sentences, helper: 'Leave empty for the built-in title'),
      FieldX('Line under the title', text, maxLength: 300, maxLines: 4, caps: TextCapitalization.sentences),
    ],
    onSubmit: () async {
      all[key] = {'kicker': kicker.text.trim(), 'title': title.text.trim(), 'text': text.text.trim()};
      next['headings'] = all;
      await _save(next);
    },
  );
}
