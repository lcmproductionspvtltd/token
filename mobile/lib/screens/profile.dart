// Edit own profile, change password and sign-in security (all roles).

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'common.dart';
import 'mfa.dart';

Future<void> openProfile(BuildContext context) async {
  final u = session.user ?? <String, dynamic>{};
  final name = TextEditingController(text: u.s('name'));
  final email = TextEditingController(text: u.s('email'));
  final username = TextEditingController(text: u.s('username'));
  final isSuper = session.role == 'superadmin';
  final ok = await FormPage.open(
    context,
    title: 'Edit profile',
    submitLabel: 'Save profile',
    builder: (ctx, setState) => [
      FieldX('Name', name, required: true, maxLength: 60, icon: 'user', caps: TextCapitalization.words),
      FieldX(
        'Email',
        email,
        keyboard: TextInputType.emailAddress,
        icon: 'mail',
        helper: 'Optional – you can sign in with it.',
      ),
      if (isSuper) FieldX('Username', username, required: true, icon: 'user'),
    ],
    onSubmit: () async {
      final body = <String, dynamic>{'name': name.text.trim(), 'email': email.text.trim()};
      if (isSuper) body['username'] = username.text.trim();
      await session.api.put('/api/me/profile', body);
      await session.refreshMe();
    },
  );
  if (ok && context.mounted) toast(context, 'Profile saved');
}

Future<void> openPassword(BuildContext context) async {
  final oldP = TextEditingController();
  final newP = TextEditingController();
  final again = TextEditingController();
  final min = session.isPlatform ? 12 : 8; // super admin and BQuee team: 12
  final ok = await FormPage.open(
    context,
    title: 'Change password',
    submitLabel: 'Change password',
    builder: (ctx, setState) => [
      FieldX('Current password', oldP, obscure: true, required: true, icon: 'lock'),
      FieldX(
        'New password',
        newP,
        obscure: true,
        required: true,
        icon: 'lock',
        helper: 'At least $min characters. Very common passwords are refused.',
        validate: (v) => v.length < min ? 'Use at least $min characters' : null,
      ),
      FieldX(
        'Repeat new password',
        again,
        obscure: true,
        required: true,
        icon: 'lock',
        validate: (v) => v != newP.text ? 'The passwords don’t match' : null,
      ),
    ],
    onSubmit: () => session.api.put('/api/me/password', {'oldPassword': oldP.text, 'newPassword': newP.text}),
  );
  if (ok && context.mounted) toast(context, 'Password changed – your other devices were signed out');
}

/// Two-step sign-in status, new backup codes, signed-in devices (same as the website).
Future<void> openSecurity(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _SecurityPage()));

class _SecurityPage extends StatefulWidget {
  const _SecurityPage();

  @override
  State<_SecurityPage> createState() => _SecurityPageState();
}

class _SecurityPageState extends State<_SecurityPage> {
  Json? mfa;
  List<Json> devices = const [];
  Object? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final m = await session.api.getJson('/api/me/mfa');
      final d = await session.api.getJson('/api/me/sessions');
      if (mounted) {
        setState(() {
          mfa = m;
          devices = d.l('sessions');
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> _newCodes() async {
    final code = TextEditingController();
    final entered = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New backup codes'),
        content: TextField(
          controller: code,
          autofocus: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(labelText: 'Code from your authenticator app', counterText: ''),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, code.text.trim()), child: const Text('Make new codes')),
        ],
      ),
    );
    if (entered == null || entered.isEmpty || !mounted) return;
    try {
      final r = asJson(await session.api.post('/api/me/mfa/backup-codes', {'code': entered}));
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (c) => Scaffold(
            backgroundColor: Colors.white,
            appBar: AppBar(backgroundColor: Colors.white, title: const Text('New backup codes')),
            body: SafeArea(
              child: BackupCodesView(
                codes: r.ls('backupCodes'),
                doneLabel: 'Done',
                onDone: () => Navigator.of(c).pop(),
              ),
            ),
          ),
        ),
      );
      _load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _signOutOthers() async {
    final r = await runAction(
      context,
      () => session.api.post('/api/me/sessions/revoke-others'),
      done: 'Other devices signed out',
    );
    if (r != null) _load();
  }

  @override
  Widget build(BuildContext context) {
    final m = mfa;
    return Scaffold(
      backgroundColor: Tk.canvas,
      appBar: AppBar(backgroundColor: Colors.white, title: const Text('Sign-in security')),
      body: error != null
          ? ErrorView(error!, onRetry: _load)
          : m == null
          ? const Loader()
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Two-step sign-in',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Tk.ink),
                            ),
                          ),
                          m.b('enabled')
                              ? const Tag('On', dot: true, tone: TagTone.green)
                              : const Tag('Not needed for staff'),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        m.b('enabled')
                            ? 'Each sign-in asks for a code from your authenticator app. You have ${m.i('backupCodesLeft')} unused backup codes for when your phone isn’t at hand.'
                            : 'Staff accounts sign in with their password. Owners, the BQuee team and the super admin also use a code from an authenticator app.',
                        style: const TextStyle(color: Tk.ink2, height: 1.4),
                      ),
                      if (m.b('enabled')) ...[
                        const SizedBox(height: 12),
                        Btn('New backup codes', icon: 'refresh', kind: BtnKind.soft, small: true, onPressed: _newCodes),
                        const SizedBox(height: 8),
                        const Text(
                          'Lost your phone and your backup codes? Ask the super admin to reset two-step sign-in for you.',
                          style: TextStyle(color: Tk.ink3, fontSize: 12),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                const SectionTitle('Signed-in devices'),
                for (final d in devices)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: ListCard(
                      leading: IconChip(
                        d.s('client') == 'web' ? 'globe' : 'phone',
                        color: brandOf(context).c,
                        size: 40,
                      ),
                      title: d.s('client') == 'web' ? 'Web browser' : 'BQuee app',
                      subtitle:
                          'Signed in ${dayText(DateTime.fromMillisecondsSinceEpoch(d.i('since')).toIso8601String().substring(0, 10))}',
                      trailing: d.b('current') ? const Tag('This device', tone: TagTone.green) : null,
                    ),
                  ),
                if (devices.length > 1)
                  Btn('Sign out all other devices', icon: 'logout', kind: BtnKind.danger, onPressed: _signOutOthers),
              ],
            ),
    );
  }
}
