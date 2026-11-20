// Sign-in for every role, then two-step sign-in for super admins, the BQuee team and owners.
// The app always uses the live BQuee server over HTTPS (kDefaultServer).

import 'package:bquee_shared/screens/legal.dart';
import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'mfa.dart';
import 'signup.dart';
import 'social.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final user = TextEditingController();
  final pass = TextEditingController();
  bool busy = false;
  bool hide = true;
  String error = '';
  Json? site;

  @override
  void initState() {
    super.initState();
    loadPublicSite().then((s) {
      if (mounted && s != null) setState(() => site = s);
    });
  }

  /// Sign-up is for business owners only, and only while the super admin allows it.
  bool get _canSignUp => site == null || site!.m('signup').b('enabled', true);

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final mfa = await session.login(user.text, pass.text);
      if (mfa != null && mounted) {
        setState(() => busy = false);
        pass.clear();
        await openMfa(context, mfa); // signs in, or comes back here when cancelled
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          busy = false;
          error = 'Could not sign in. Check your internet connection and try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          Container(
            height: 330,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [mix(b.c, 0.62, const Color(0xFF160B22)), mix(b.c, 0.85, b.rose)],
              ),
            ),
          ),
          Positioned(
            right: -70,
            top: -40,
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: fade(Colors.white, 0.07), width: 34),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Image.asset('assets/brand/logo-light.png', height: 44, semanticLabel: 'BQuee'),
                      ),
                      const SizedBox(height: 26),
                      const Text(
                        'Run your queue from your phone.',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 25,
                          fontWeight: FontWeight.w700,
                          height: 1.2,
                          letterSpacing: -0.4,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'For super admins, the BQuee team, service owners and staff.',
                        style: TextStyle(color: fade(Colors.white, 0.8), fontSize: 14),
                      ),
                      const SizedBox(height: 24),
                      AppCard(
                        padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
                        child: Form(
                          key: _form,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text(
                                'Sign in',
                                style: TextStyle(
                                  fontFamily: Tk.serif,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w600,
                                  color: Tk.ink,
                                ),
                              ),
                              const SizedBox(height: 4),
                              const Text(
                                'Use the username or email and password you were given.',
                                style: TextStyle(color: Tk.ink3, fontSize: 13.5),
                              ),
                              const SizedBox(height: 18),
                              SocialButtons(site: site),
                              FieldX(
                                'Username or email',
                                user,
                                required: true,
                                icon: 'user',
                                keyboard: TextInputType.emailAddress,
                              ),
                              Padding(
                                padding: const EdgeInsets.only(bottom: 14),
                                child: TextFormField(
                                  controller: pass,
                                  obscureText: hide,
                                  onFieldSubmitted: (_) => _submit(),
                                  decoration: InputDecoration(
                                    labelText: 'Password *',
                                    prefixIcon: const Padding(
                                      padding: EdgeInsets.all(13),
                                      child: AppIcon('lock', size: 20, color: Tk.ink3),
                                    ),
                                    suffixIcon: IconButton(
                                      tooltip: hide ? 'Show password' : 'Hide password',
                                      icon: AppIcon('eye', size: 20, color: hide ? Tk.ink3 : b.c),
                                      onPressed: () => setState(() => hide = !hide),
                                    ),
                                  ),
                                  validator: (v) => (v ?? '').isEmpty ? 'Enter your password' : null,
                                ),
                              ),
                              if (error.isNotEmpty)
                                Container(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(color: Tk.badBg, borderRadius: BorderRadius.circular(12)),
                                  child: Text(
                                    error,
                                    style: const TextStyle(color: Tk.badFg, fontWeight: FontWeight.w500),
                                  ),
                                ),
                              Btn('Sign in', icon: 'arrow', expand: true, busy: busy, onPressed: _submit),
                            ],
                          ),
                        ),
                      ),
                      if (_canSignUp) ...[
                        const SizedBox(height: 14),
                        AppCard(
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                          child: Row(
                            children: [
                              const Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'New business?',
                                      style: TextStyle(fontWeight: FontWeight.w700, color: Tk.ink, fontSize: 15),
                                    ),
                                    SizedBox(height: 2),
                                    Text(
                                      'Business owners can sign up here.',
                                      style: TextStyle(color: Tk.ink3, fontSize: 12.5),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 10),
                              Btn(
                                'Sign up',
                                icon: 'store',
                                kind: BtnKind.soft,
                                small: true,
                                onPressed: () {
                                  Navigator.of(context)
                                      .push(MaterialPageRoute(builder: (_) => SignupScreen(site: site)));
                                },
                              ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      const Text(
                        'Forgot your password? Staff can ask their service owner. Service owners can contact their BQuee provider.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Tk.ink3, fontSize: 12.5, height: 1.45),
                      ),
                      const SizedBox(height: 6),
                      const LegalLinks(),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
