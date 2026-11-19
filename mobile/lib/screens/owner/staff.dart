// Owner → Staff: who works where, which services they do, their sign-in, online status and on/off.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';
import 'owner_home.dart';

class OwnerStaff extends StatefulWidget {
  const OwnerStaff({super.key});

  @override
  State<OwnerStaff> createState() => _OwnerStaffState();
}

class _OwnerStaffState extends State<OwnerStaff> {
  String q = '';
  String show = 'all';
  String branch = '';

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: loadOwner,
      every: const Duration(seconds: 30),
      builder: (context, d, reload) {
        final all = d.l('staff');
        final branches = d.l('branches');
        final branchName = {for (final br in branches) br.s('id'): br.s('name')};
        final serviceName = {for (final s in d.l('services')) s.s('id'): s.s('name')};
        final staff = all.where((x) {
          final online = x.b('online', true) && x.b('active', true);
          if (show == 'online' && !online) return false;
          if (show == 'offline' && (online || !x.b('active', true))) return false;
          if (show == 'inactive' && x.b('active', true)) return false;
          if (show == 'nologin' && (x.s('email').isNotEmpty || x.s('username').isNotEmpty)) return false;
          if (branch.isNotEmpty && x.s('branchId') != branch) return false;
          return textMatches(q, [x.s('name'), x.s('title'), x.s('mobile'), x.s('email')]);
        }).toList();
        return PageScroll(
          title: 'Staff',
          subtitle: '${plural(all.length, 'staff member', 'staff members')} · each has their own queue',
          onRefresh: reload,
          actions: [
            HeaderAction(
              'plus',
              tooltip: 'Add staff',
              label: 'Add',
              onPressed: () async {
                if (await editStaff(context, d, null)) reload();
              },
            ),
          ],
          children: [
            if (all.isNotEmpty)
              ListFilters(
                hint: 'Search staff',
                onSearch: (v) => setState(() => q = v),
                chips: [
                  FilterChips<String>(
                    options: const {
                      'all': 'All',
                      'online': 'Online',
                      'offline': 'Offline',
                      'inactive': 'Inactive',
                      'nologin': 'No login',
                    },
                    value: show,
                    onChanged: (v) => setState(() => show = v),
                  ),
                  if (branches.length > 1)
                    FilterChips<String>(
                      options: {'': 'All branches', for (final br in branches) br.s('id'): br.s('name')},
                      value: branch,
                      onChanged: (v) => setState(() => branch = v),
                    ),
                ],
              ),
            if (all.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'users',
                  title: 'No staff yet',
                  text: 'Add your staff and link each one to the services they do.',
                ),
              )
            else if (staff.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'search',
                  title: 'No one matches',
                  text: 'Try another name or clear the filters.',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$show|$branch'),
                all: staff,
                gap: 14,
                itemBuilder: (x) {
                  final active = x.b('active', true);
                  final online = x.b('online', true);
                  final names = x
                      .ls('serviceIds')
                      .map((id) => serviceName[id] ?? '')
                      .where((n) => n.isNotEmpty)
                      .toList();
                  final login = x.s('email').isNotEmpty ? x.s('email') : x.s('username');
                  return ListCard(
                    dim: !active,
                    onTap: () async {
                      if (await editStaff(context, d, x)) reload();
                    },
                    leading: Avatar(x.s('name'), photo: x.s('photo'), size: 54),
                    title: x.s('name'),
                    subtitle: [
                      x.s('title'),
                      if (branches.length > 1) branchName[x.s('branchId')] ?? '',
                    ].where((e) => e.isNotEmpty).join(' · '),
                    subtitleIcon: 'lotus',
                    trailing: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Switch(
                          value: online && active,
                          onChanged: !active
                              ? null
                              : (v) async {
                                  final r = await runAction(
                                    context,
                                    () => session.api.put('/api/owner/staff/${x.s('id')}/status', {'online': v}),
                                    done: v ? '${x.s('name')} is online' : '${x.s('name')} is offline',
                                  );
                                  if (r != null) reload();
                                },
                        ),
                        _presence(
                          !active
                              ? 'Inactive'
                              : !online
                              ? 'Offline'
                              : (x.b('busy') ? 'Busy' : 'Online'),
                          !active || !online ? Tk.offFg : (x.b('busy') ? Tk.amber : Tk.green),
                        ),
                      ],
                    ),
                    detailIcon: 'scissors',
                    detail: names.isEmpty ? 'No services linked yet' : names.join(', '),
                    detailWarn: names.isEmpty,
                    tags: [
                      login.isEmpty
                          ? const Tag('No login', icon: 'lock')
                          : Tag(login, icon: 'mail', tone: TagTone.blue),
                      if (x.i('load') > 0) Tag('Queue ${waitText(x.i('load'))}', icon: 'clock', tone: TagTone.amber),
                    ],
                    actions: [
                      // Owners switch staff on and off; deleting is only done by the BQuee admin on the staff member's own request.
                      CardAction(
                        'power',
                        tooltip: active ? 'Switch off' : 'Switch on',
                        danger: active,
                        onPressed: () async {
                          if (active) {
                            final ok = await confirmDialog(
                              context,
                              title: 'Switch off ${x.s('name')}?',
                              message: 'They can’t sign in and customers can’t book them until you switch them on again. Their past tokens stay.',
                              confirm: 'Switch off',
                            );
                            if (!ok || !context.mounted) return;
                          }
                          final r = await runAction(
                            context,
                            () => session.api.put('/api/owner/staff/${x.s('id')}/active', {'active': !active}),
                            done: active ? '${x.s('name')} is switched off' : '${x.s('name')} is switched on',
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

Widget _presence(String text, Color color) => Row(
  mainAxisSize: MainAxisSize.min,
  children: [
    Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    ),
    const SizedBox(width: 6),
    Text(
      text,
      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color),
    ),
  ],
);

Future<bool> editStaff(BuildContext context, Json d, Json? st) {
  final isNew = st == null;
  final s = st ?? <String, dynamic>{};
  final name = TextEditingController(text: s.s('name'));
  final title = TextEditingController(text: s.s('title'));
  final mobile = TextEditingController(text: s.s('mobile'));
  final email = TextEditingController(text: s.s('email'));
  final password = TextEditingController();
  var photo = s.s('photo');
  var active = s.b('active', true);
  final branches = d.l('branches');
  var branchId = s.s('branchId', branches.isEmpty ? '' : branches.first.s('id'));
  final services = d.l('services');
  final ids = <String>{...s.ls('serviceIds')};
  final hasLogin = s.s('email').isNotEmpty || s.s('username').isNotEmpty;
  return FormPage.open(
    context,
    title: isNew ? 'Add staff' : 'Edit ${s.s('name')}',
    submitLabel: isNew ? 'Add staff' : 'Save changes',
    builder: (ctx, setState) => [
      ImageField('Photo', value: photo, maxSize: 500, onChanged: (v) => setState(() => photo = v)),
      FieldX('Name', name, required: true, maxLength: 60, caps: TextCapitalization.words),
      FieldX('Title', title, maxLength: 60, hint: 'e.g. Senior consultant', caps: TextCapitalization.sentences),
      FieldX('Mobile', mobile, keyboard: TextInputType.phone, maxLength: 20),
      if (branches.length > 1)
        SelectX<String>(
          'Branch',
          value: branchId,
          options: [for (final br in branches) MapEntry(br.s('id'), br.s('name'))],
          onChanged: (v) => setState(() => branchId = v),
        ),
      FieldGroup(
        'Services they do',
        hint: 'Customers can only book them for these.',
        children: [
          if (services.isEmpty) const Text('Add services first.', style: TextStyle(color: Tk.ink3)),
          if (services.isNotEmpty)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => setState(() {
                  if (ids.length == services.length) {
                    ids.clear();
                  } else {
                    ids
                      ..clear()
                      ..addAll(services.map((x) => x.s('id')));
                  }
                }),
                child: Text(ids.length == services.length ? 'Clear all' : 'Select all'),
              ),
            ),
          for (final svc in services)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: ids.contains(svc.s('id')),
              title: Text(svc.s('name')),
              subtitle: svc.s('category').isEmpty ? null : Text(svc.s('category')),
              onChanged: (v) => setState(() => v == true ? ids.add(svc.s('id')) : ids.remove(svc.s('id'))),
            ),
        ],
      ),
      FieldGroup(
        'Login',
        hint: hasLogin
            ? 'Leave the password blank to keep the current one.'
            : 'Optional. With a login they can scan tokens and see their queue.',
        children: [
          FieldX('Email', email, keyboard: TextInputType.emailAddress, hint: 'name@business.com'),
          FieldX(
            hasLogin ? 'New password' : 'Password',
            password,
            obscure: true,
            helper: 'At least 8 characters.',
            validate: (v) => v.isNotEmpty && v.length < 8 ? 'Use at least 8 characters' : null,
          ),
        ],
      ),
      SwitchRow(
        'Active',
        hint: 'Inactive staff can’t be booked or sign in.',
        value: active,
        onChanged: (v) => setState(() => active = v),
      ),
    ],
    onSubmit: () async {
      final body = <String, dynamic>{
        'name': name.text.trim(),
        'title': title.text.trim(),
        'mobile': mobile.text.trim(),
        'photo': photo,
        'branchId': branchId,
        'serviceIds': ids.toList(),
        'email': email.text.trim(),
        'active': active,
      };
      if (password.text.isNotEmpty) body['password'] = password.text;
      if (isNew) {
        await session.api.post('/api/owner/staff', body);
      } else {
        await session.api.put('/api/owner/staff/${s.s('id')}', body);
      }
    },
  );
}

/* ======================= branches & QR ======================= */
