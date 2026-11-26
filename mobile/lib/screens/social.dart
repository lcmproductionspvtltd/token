// "Continue with Google / Apple" for business owners (same as the website). The buttons show only
// for providers set up on the server; see session.socialSignIn for the sign-in itself.

import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'mfa.dart';
import 'signup.dart';

class SocialButtons extends StatefulWidget {
  final Json? site;
  final String verb; // "Continue" on sign-in, "Sign up" on sign-up
  const SocialButtons({super.key, required this.site, this.verb = 'Continue'});

  @override
  State<SocialButtons> createState() => _SocialButtonsState();
}

class _SocialButtonsState extends State<SocialButtons> {
  String busy = '';

  Future<void> _go(String provider) async {
    setState(() => busy = provider);
    try {
      final r = await session.socialSignIn(provider);
      if (!mounted) return;
      setState(() => busy = '');
      if (r == null) {
        Navigator.of(context).popUntil((route) => route.isFirst); // signed in
      } else if (r['mfa'] != null) {
        await openMfa(context, r.m('mfa'));
      } else if (r['signup'] != null) {
        await Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => SignupScreen(site: widget.site, social: r.m('signup'))),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => busy = '');
      showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final on = widget.site?.m('social') ?? const <String, dynamic>{};
    final google = on['google'] == true;
    final apple = on['apple'] == true;
    if (!google && !apple) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (google)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Btn(
                '${widget.verb} with Google',
                icon: 'globe',
                kind: BtnKind.soft,
                expand: true,
                busy: busy == 'google',
                onPressed: busy.isEmpty ? () => _go('google') : null,
              ),
            ),
          if (apple)
            Btn(
              '${widget.verb} with Apple',
              icon: 'phone',
              kind: BtnKind.soft,
              expand: true,
              busy: busy == 'apple',
              onPressed: busy.isEmpty ? () => _go('apple') : null,
            ),
          const SizedBox(height: 12),
          const Row(
            children: [
              Expanded(child: Divider(color: Tk.line)),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 10),
                child: Text('or', style: TextStyle(color: Tk.ink3, fontSize: 12.5)),
              ),
              Expanded(child: Divider(color: Tk.line)),
            ],
          ),
        ],
      ),
    );
  }
}
