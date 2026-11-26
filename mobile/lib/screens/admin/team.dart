// Super admin → team & permissions (platform staff, separate from business staff).

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';
import '../mfa.dart';

const Map<String, List<String>> kPermissionInfo = {
  'salons.create': ['Create businesses', 'Add new businesses with their owner sign-in'],
  'salons.edit': ['Edit businesses', 'Change business details, plan, expiry and owner sign-in'],
  'salons.toggle': ['Enable / disable businesses', 'Pause or restart a business’s booking and sign-ins'],
  'salons.delete': ['Delete businesses', 'Permanently remove a business and all its data'],
  'revenue.view': ['See plan amounts', 'View what each business pays and total plan revenue'],
  'defaults.manage': ['Manage default services', 'Add, edit and delete categories, groups and default services'],
};

class AdminTeam extends StatefulWidget {
  const AdminTeam({super.key});

  @override
  State<AdminTeam> createState() => _AdminTeamState();
}

class _AdminTeamState extends State<AdminTeam> {
  String q = '';
  String show = 'all';

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: () => session.api.getJson('/api/admin/team'),
      builder: (context, d, reload) {
        final b = brandOf(context);
        final team = d.l('team');
        final perms = d.ls('permissions');
        final shown = team.where((m) {
          if (show == 'active' && !m.b('active', true)) return false;
          if (show == 'disabled' && m.b('active', true)) return false;
          return textMatches(q, [m.s('name'), m.s('username'), m.s('email')]);
        }).toList();
        return PageScroll(
          title: 'Team & permissions',
          subtitle: 'People who help you run BQuee – separate from business staff',
          onRefresh: reload,
          actions: [
            HeaderAction(
              'plus',
              tooltip: 'Add team member',
              label: 'Add',
              onPressed: () async {
                if (await editMember(context, null, perms)) reload();
              },
            ),
          ],
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: b.wash, borderRadius: BorderRadius.circular(Tk.rLg)),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppIcon('shield', size: 20, color: b.ink),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Team members sign in like you. They always see the business list and can only do what you tick. They can’t see or manage this team. Service owners and business staff never appear here.',
                      style: TextStyle(color: b.ink, fontSize: 13, height: 1.45),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (team.isNotEmpty)
              ListFilters(
                hint: 'Search team',
                onSearch: (v) => setState(() => q = v),
                chips: [
                  FilterChips<String>(
                    options: const {'all': 'All', 'active': 'Active', 'disabled': 'Disabled'},
                    value: show,
                    onChanged: (v) => setState(() => show = v),
                  ),
                ],
              ),
            SectionTitle(plural(shown.length, 'team member')),
            if (team.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'users',
                  title: 'No team members yet',
                  text:
                      'Add people who help you sell and set up businesses. You decide exactly what each person can do.',
                ),
              )
            else if (shown.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'search',
                  title: 'No one matches',
                  text: 'Try another name or clear the filter.',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$show'),
                all: shown,
                gap: 14,
                itemBuilder: (m) => ListCard(
                  dim: !m.b('active', true),
                  onTap: () async {
                    if (await editMember(context, m, perms)) reload();
                  },
                  leading: Avatar(m.s('name'), size: 54),
                  title: m.s('name'),
                  subtitle: [
                    m.s('username').isEmpty ? '' : '@${m.s('username')}',
                    m.s('email'),
                  ].where((e) => e.isNotEmpty).join(' · '),
                  subtitleIcon: 'user',
                  trailing: m.b('active', true)
                      ? const Tag('Active', dot: true, tone: TagTone.green)
                      : const Tag('Disabled', dot: true),
                  detailIcon: 'shield',
                  detail: m.ls('permissions').isEmpty
                      ? 'Can view businesses only'
                      : m.ls('permissions').map((p) => (kPermissionInfo[p] ?? [p])[0]).join(', '),
                  actions: [
                    CardAction(
                      'trash',
                      tooltip: 'Remove',
                      danger: true,
                      onPressed: () async {
                        final ok = await confirmDialog(
                          context,
                          title: 'Remove ${m.s('name')}?',
                          message: 'Their sign-in stops working immediately. Businesses they created stay as they are.',
                          confirm: 'Remove',
                        );
                        if (!ok || !context.mounted) return;
                        final r = await runAction(
                          context,
                          () => session.api.delete('/api/admin/team/${m.s('id')}'),
                          done: '${m.s('name')} removed',
                        );
                        if (r != null) reload();
                      },
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

Future<bool> editMember(BuildContext context, Json? member, List<String> perms) {
  final isNew = member == null;
  final m = member ?? <String, dynamic>{};
  final name = TextEditingController(text: m.s('name'));
  final email = TextEditingController(text: m.s('email'));
  final username = TextEditingController(text: m.s('username'));
  final password = TextEditingController();
  final chosen = <String>{
    ...(isNew ? ['salons.create'] : m.ls('permissions')),
  };
  var active = m.b('active', true);
  return FormPage.open(
    context,
    title: isNew ? 'Add team member' : 'Edit ${m.s('name')}',
    submitLabel: isNew ? 'Add team member' : 'Save changes',
    builder: (ctx, setState) => [
      FieldX('Name', name, required: true, maxLength: 60, caps: TextCapitalization.words),
      FieldX('Email', email, keyboard: TextInputType.emailAddress, helper: 'Optional – they can sign in with it.'),
      FieldX('Username', username, required: true),
      FieldX(
        isNew ? 'Password' : 'New password',
        password,
        obscure: true,
        required: isNew,
        helper: isNew ? 'At least 12 characters.' : 'Leave blank to keep the current one (new: 12+ characters).',
        validate: (v) => v.isNotEmpty && v.length < 12 ? 'Use at least 12 characters' : null,
      ),
      FieldGroup(
        'What can they do?',
        hint: 'They can always see the business list. Tick anything else they need.',
        children: [
          for (final p in perms)
            SwitchRow(
              (kPermissionInfo[p] ?? [p])[0],
              hint: (kPermissionInfo[p] ?? [p, ''])[1],
              value: chosen.contains(p),
              onChanged: (v) => setState(() => v ? chosen.add(p) : chosen.remove(p)),
            ),
        ],
      ),
      SwitchRow(
        'Account active',
        hint: 'Turn off to block sign-in without deleting them.',
        value: active,
        onChanged: (v) => setState(() => active = v),
      ),
      if (!isNew) MfaResetTile(userId: m.s('id'), name: m.s('name'), enabled: m.b('mfa')),
    ],
    onSubmit: () async {
      final body = <String, dynamic>{
        'name': name.text.trim(),
        'email': email.text.trim(),
        'username': username.text.trim(),
        'permissions': chosen.toList(),
        'active': active,
      };
      if (password.text.isNotEmpty) body['password'] = password.text;
      if (isNew) {
        await session.api.post('/api/admin/team', body);
      } else {
        await session.api.put('/api/admin/team/${m.s('id')}', body);
      }
    },
  );
}
