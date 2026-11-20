// Super admin → menus and features a business's owner and staff can use – for one business, or for
// many at once (only the settings picked change).

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';

/// Change many businesses at once. Every setting starts at "No change", so only what is picked
/// here changes; each business keeps the rest. Returns true when applied.
Future<bool> editBusinessesBulk(BuildContext context, List<String> ids) async {
  final canToggle = session.can('salons.toggle');
  final canEdit = session.can('salons.edit');
  var active = '';
  final flags = {'maskContacts': '', 'reportExport': '', 'staffReports': '', 'appButtons': ''};
  final menus = {for (final m in kFeatureMenus) m.$1: ''};
  bool? asBool(String v) => v == 'on'
      ? true
      : v == 'off'
      ? false
      : null;
  Widget row(
    String label,
    String hint,
    String value,
    ValueChanged<String> onChanged, {
    String on = 'On',
    String off = 'Off',
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
        ),
        if (hint.isNotEmpty) Text(hint, style: const TextStyle(color: Tk.ink3, fontSize: 12.5)),
        const SizedBox(height: 8),
        FilterChips<String>(options: {'': 'No change', 'on': on, 'off': off}, value: value, onChanged: onChanged),
      ],
    ),
  );
  final ok = await FormPage.open(
    context,
    title: 'Change ${plural(ids.length, 'business', 'businesses')}',
    submitLabel: 'Apply to selected',
    builder: (ctx, setState) => [
      const Text(
        'Only the settings you change here are applied. Everything left at “No change” stays as it is for each business.',
        style: TextStyle(color: Tk.ink3, fontSize: 13, height: 1.35),
      ),
      const SizedBox(height: 16),
      if (canToggle)
        FieldGroup(
          'Business',
          children: [
            row(
              'Business on / off',
              'Off stops online booking and the business’s sign-ins',
              active,
              (v) => setState(() => active = v),
              on: 'Enable',
              off: 'Disable',
            ),
          ],
        ),
      if (canEdit) ...[
        FieldGroup(
          'Customer privacy',
          children: [
            row(
              'Customers’ mobile numbers and emails',
              'Hidden: owner and staff see them partly hidden (98•••210)',
              flags['maskContacts']!,
              (v) => setState(() => flags['maskContacts'] = v),
              on: 'Hide',
              off: 'Show',
            ),
          ],
        ),
        FieldGroup(
          'Owner menus',
          children: [
            for (final m in kFeatureMenus) row(m.$3, m.$4, menus[m.$1]!, (v) => setState(() => menus[m.$1] = v)),
          ],
        ),
        FieldGroup(
          'Features',
          children: [
            row(
              'Excel (CSV) export',
              'Export in Tokens and Reports',
              flags['reportExport']!,
              (v) => setState(() => flags['reportExport'] = v),
            ),
            row(
              'Staff reports',
              'Staff can see their own reports',
              flags['staffReports']!,
              (v) => setState(() => flags['staffReports'] = v),
            ),
            row(
              'BQuee app download buttons',
              'Google Play / App Store buttons on the business page',
              flags['appButtons']!,
              (v) => setState(() => flags['appButtons'] = v),
            ),
          ],
        ),
      ],
    ],
    onSubmit: () async {
      final features = <String, dynamic>{
        for (final e in flags.entries)
          if (asBool(e.value) != null) e.key: asBool(e.value),
      };
      final m = {
        for (final e in menus.entries)
          if (asBool(e.value) != null) e.key: asBool(e.value),
      };
      if (m.isNotEmpty) features['menus'] = m;
      final body = <String, dynamic>{'ids': ids};
      if (asBool(active) != null) body['active'] = asBool(active);
      if (features.isNotEmpty) body['features'] = features;
      if (body.length == 1) throw ApiException(400, 'Choose at least one setting to change');
      await session.api.post('/api/admin/salons/bulk', body);
    },
  );
  if (ok && context.mounted) toast(context, '${plural(ids.length, 'business', 'businesses')} updated');
  return ok;
}

/* ---------------- menus & features of one business ---------------- */

const List<(String, String, String, String)> kFeatureMenus = [
  ('tokens', 'list', 'Tokens', 'Today’s and past tokens list'),
  ('reports', 'chart', 'Reports', 'Owner reports'),
  ('branches', 'qr', 'Branches & QR', 'Add branches, print QR codes'),
  ('services', 'tag', 'Services', 'Add and edit services'),
  ('staff', 'users', 'Staff', 'Add staff and their sign-ins'),
  ('offers', 'gift', 'Offers', 'Discounts and promo codes'),
  ('reviews', 'star', 'Reviews', 'Customer reviews on the business page'),
  ('settings', 'gear', 'Business profile', 'Name, logo, colours and contact details'),
];

int menusOff(Json f) => kFeatureMenus.where((m) => f.m('menus')[m.$1] == false).length;

/// What the owner and staff of [x] can see and do. Returns true when saved.
Future<bool> editFeatures(BuildContext context, Json x) async {
  final f = x.m('features');
  final menus = {for (final m in kFeatureMenus) m.$1: f.m('menus')[m.$1] != false};
  var mask = f.b('maskContacts');
  var allowExport = f.b('reportExport', true);
  var staffReports = f.b('staffReports', true);
  var appButtons = f.b('appButtons', true);
  final ok = await FormPage.open(
    context,
    title: 'Menus & features',
    submitLabel: 'Save',
    builder: (ctx, setState) => [
      Text(
        x.s('name'),
        style: const TextStyle(fontFamily: Tk.serif, fontSize: 20, fontWeight: FontWeight.w600, color: Tk.ink),
      ),
      const SizedBox(height: 4),
      const Text(
        'Changes apply to this business’s owner and staff on their next refresh, in the app and on the web.',
        style: TextStyle(color: Tk.ink3, fontSize: 13, height: 1.35),
      ),
      const SizedBox(height: 18),
      FieldGroup(
        'Customer privacy',
        children: [
          SwitchRow(
            'Hide customers’ mobile numbers and emails',
            hint: 'Owner and staff see them partly hidden (98•••210) in tokens, reports and exports',
            value: mask,
            onChanged: (v) => setState(() => mask = v),
          ),
        ],
      ),
      FieldGroup(
        'Owner menus',
        hint: 'Overview is always on.',
        children: [
          for (final m in kFeatureMenus)
            SwitchRow(m.$3, hint: m.$4, value: menus[m.$1]!, onChanged: (v) => setState(() => menus[m.$1] = v)),
        ],
      ),
      FieldGroup(
        'Features',
        children: [
          SwitchRow(
            'Excel (CSV) export',
            hint: 'Export in Tokens and Reports for owner and staff',
            value: allowExport,
            onChanged: (v) => setState(() => allowExport = v),
          ),
          SwitchRow(
            'Staff reports',
            hint: 'Staff can see their own reports',
            value: staffReports,
            onChanged: (v) => setState(() => staffReports = v),
          ),
          SwitchRow(
            'BQuee app download buttons',
            hint: 'Google Play and App Store buttons for the customer app on this business’s page',
            value: appButtons,
            onChanged: (v) => setState(() => appButtons = v),
          ),
        ],
      ),
    ],
    onSubmit: () async {
      await session.api.put('/api/admin/salons/${x.s('id')}/features', {
        'features': {'maskContacts': mask, 'reportExport': allowExport, 'staffReports': staffReports, 'appButtons': appButtons, 'menus': menus},
      });
    },
  );
  if (ok && context.mounted) toast(context, 'Menus and features saved');
  return ok;
}
