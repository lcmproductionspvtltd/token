// Profile: photo, name, mobile, email; change password; sign out; delete / deactivate request.

import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/screens/account_request.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'common.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool photoBusy = false;

  Future<void> _photo() async {
    final p = await Native.pickImage(maxSize: 600);
    if (p == null || !mounted) return;
    setState(() => photoBusy = true);
    await runAction(context, () => session.saveProfile({'photo': p}), done: 'Photo updated');
    if (mounted) setState(() => photoBusy = false);
  }

  Future<void> _edit() async {
    final u = session.user ?? <String, dynamic>{};
    final name = TextEditingController(text: u['name']?.toString() ?? '');
    final mobile = TextEditingController(text: u['mobile']?.toString() ?? '');
    final email = TextEditingController(text: u['email']?.toString() ?? '');
    final ok = await FormPage.open(
      context,
      title: 'Edit profile',
      submitLabel: 'Save',
      builder: (ctx, setState) => [
        FieldX('Your name', name, required: true, icon: 'user', caps: TextCapitalization.words, maxLength: 60),
        FieldX(
          'Mobile number',
          mobile,
          required: true,
          icon: 'phone',
          keyboard: TextInputType.phone,
          maxLength: 20,
          helper: 'You can sign in with this number.',
        ),
        FieldX(
          'Email',
          email,
          icon: 'mail',
          keyboard: TextInputType.emailAddress,
          maxLength: 120,
          validate: (v) => v.isEmpty || v.contains('@') ? null : 'Enter a valid email',
        ),
      ],
      onSubmit: () =>
          session.saveProfile({'name': name.text.trim(), 'mobile': mobile.text.trim(), 'email': email.text.trim()}),
    );
    if (ok && mounted) toast(context, 'Profile saved');
  }

  Future<void> _password() async {
    final current = TextEditingController();
    final next = TextEditingController();
    final ok = await FormPage.open(
      context,
      title: 'Change password',
      submitLabel: 'Change password',
      builder: (ctx, setState) => [
        FieldX('Current password', current, required: true, obscure: true, icon: 'lock'),
        FieldX(
          'New password',
          next,
          required: true,
          obscure: true,
          icon: 'lock',
          helper: 'At least 8 characters.',
          validate: (v) => v.length < 8 ? 'Use at least 8 characters' : null,
        ),
      ],
      onSubmit: () => session.saveProfile({'currentPassword': current.text, 'newPassword': next.text}),
    );
    if (ok && mounted) toast(context, 'Password changed');
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: session,
      builder: (context, _) {
        final b = brandOf(context);
        final u = session.user ?? <String, dynamic>{};
        String v(String k) => u[k]?.toString() ?? '';
        Widget row(String icon, String label, String value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              IconChip(icon, color: b.c, size: 38),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: const TextStyle(color: Tk.ink3, fontSize: 12)),
                    Text(
                      value.isEmpty ? 'Not added' : value,
                      style: TextStyle(fontWeight: FontWeight.w600, color: value.isEmpty ? Tk.ink3 : Tk.ink),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
        Widget item(String icon, String label, VoidCallback onTap, {bool danger = false}) => ListTile(
          leading: AppIcon(icon, size: 22, color: danger ? Tk.badFg : Tk.ink2),
          title: Text(
            label,
            style: TextStyle(fontWeight: FontWeight.w600, color: danger ? Tk.badFg : Tk.ink),
          ),
          trailing: danger ? null : const AppIcon('chevr', size: 20, color: Tk.ink3),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tk.r)),
          onTap: onTap,
        );
        return PageScroll(
          title: 'Profile',
          subtitle: 'Your details fill in every booking',
          children: [
            AppCard(
              child: Column(
                children: [
                  GestureDetector(
                    onTap: photoBusy ? null : _photo,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(3),
                          decoration: BoxDecoration(shape: BoxShape.circle, gradient: b.gradBtn),
                          child: Avatar(v('name').isEmpty ? '?' : v('name'), photo: v('photo'), size: 96),
                        ),
                        Positioned(
                          right: -2,
                          bottom: -2,
                          child: Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                              border: Border.all(color: Tk.line),
                            ),
                            alignment: Alignment.center,
                            child: photoBusy
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : AppIcon('camera', size: 17, color: b.c, stroke: 2),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    v('name'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontFamily: Tk.serif,
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      color: Tk.ink,
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Divider(),
                  row('phone', 'Mobile number', v('mobile')),
                  row('mail', 'Email', v('email')),
                  const SizedBox(height: 8),
                  Btn('Edit profile', icon: 'edit', kind: BtnKind.soft, expand: true, onPressed: _edit),
                ],
              ),
            ),
            const SizedBox(height: 16),
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
              child: Column(
                children: [
                  item('ticket', 'My tokens', () => session.goTab?.call('tokens')),
                  item('lock', 'Change password', _password),
                  item('eye', 'Privacy Policy', () => openPrivacy(context, session.api.base)),
                  item('list', 'Terms and Conditions', () => openTerms(context, session.api.base)),
                  item('logout', 'Sign out', () async {
                    final ok = await confirmDialog(
                      context,
                      title: 'Sign out?',
                      message: 'You can sign in again any time.',
                      confirm: 'Sign out',
                    );
                    if (!ok) return;
                    session.navigatorKey.currentState?.popUntil((r) => r.isFirst);
                    await session.logout();
                  }, danger: true),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: () => openAccountRequest(context, 'customer'),
                child: const Text('Delete or deactivate my account', style: TextStyle(color: Tk.ink3)),
              ),
            ),
          ],
        );
      },
    );
  }
}
