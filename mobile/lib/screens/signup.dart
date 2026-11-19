// Business sign-up. Only business owners can sign up – staff are added by their owner,
// and the BQuee team is added by the super admin.

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/steps.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import '../ui/booking_modes.dart';
import 'mfa.dart';

/// The sign-up form's steps, in order (same as the website).
const _kSteps = ['Business', 'Booking', 'Your account'];

/// Public sign-up settings and business types from the server (null when it can't be reached).
Future<Json?> loadPublicSite() async {
  try {
    return await session.api.getJson('/api/public/site');
  } catch (_) {
    return null;
  }
}

class SignupScreen extends StatefulWidget {
  final Json? site;
  const SignupScreen({super.key, this.site});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _form = GlobalKey<FormState>();
  final business = TextEditingController();
  final owner = TextEditingController();
  final mobile = TextEditingController();
  final email = TextEditingController();
  final username = TextEditingController();
  final pass = TextEditingController();
  final referral = TextEditingController();
  Json? site;
  String category = '';
  String serviceMode = 'multiple';
  String staffMode = 'multiple';
  String package = '';
  bool hide = true;
  bool busy = false;
  String error = '';
  String pendingFor = '';
  int at = 0;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    site = widget.site;
    _pickDefault();
    if (site == null) {
      loadPublicSite().then((s) {
        if (mounted && s != null) {
          setState(() {
            site = s;
            _pickDefault();
          });
        }
      });
    }
  }

  @override
  void dispose() {
    for (final c in [business, owner, mobile, email, username, pass, referral]) {
      c.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  /// Starts with the "popular" package selected.
  void _pickDefault() {
    final list = _packages;
    if (list.isEmpty || list.any((p) => p.s('name') == package)) return;
    package = list.firstWhere((p) => p.b('highlight'), orElse: () => list.first).s('name');
  }

  /// Packages from the home page pricing – only when the super admin shows pricing.
  List<Json> get _packages => site != null && site!.m('sections').b('plans', true) ? site!.l('plans') : <Json>[];

  /// Shows another step from its top.
  void _go(int i) {
    setState(() {
      at = i;
      error = '';
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  /// Next checks only the fields on this step (the others aren't on screen); the last step sends.
  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_form.currentState?.validate() ?? false)) return;
    if (at == 0 && _packages.isNotEmpty && !_packages.any((p) => p.s('name') == package)) {
      setState(() => error = 'Choose a package');
      return;
    }
    if (at < _kSteps.length - 1) {
      _go(at + 1);
      return;
    }
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final r = asJson(
        await session.api.post('/api/public/signup', {
          'businessName': business.text.trim(),
          'categoryId': category,
          'serviceMode': serviceMode,
          'staffMode': staffMode,
          'ownerName': owner.text.trim(),
          'mobile': mobile.text.trim(),
          'email': email.text.trim(),
          'username': username.text.trim(),
          'password': pass.text,
          'ref': referral.text.trim().toLowerCase(),
          if (_packages.isNotEmpty) 'package': package,
          'channel': 'app',
        }),
      );
      if (r.b('pending')) {
        if (mounted) {
          setState(() {
            busy = false;
            pendingFor = r.s('business', business.text.trim());
          });
        }
        return;
      }
      // Owners use two-step sign-in: a new owner sets it up right away.
      if (r['mfa'] != null) {
        if (mounted) {
          setState(() => busy = false);
          await openMfa(context, r.m('mfa'));
        }
        return;
      }
      await session.signedInWith(r);
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
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
          error = 'Could not sign up. Check your internet connection and try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final signup = site?.m('signup') ?? <String, dynamic>{};
    final closed = site != null && !signup.b('enabled', true);
    final approval = signup.b('approval');
    final trialDays = signup.i('trialDays', 14);
    final cats = site?.l('categories') ?? <Json>[];

    Widget body;
    if (pendingFor.isNotEmpty) {
      body = _Message(
        icon: 'clock',
        title: 'Thanks – we got your sign-up',
        text:
            '$pendingFor is waiting for approval. You can sign in with your username and password as soon as the BQuee team approves it.',
        button: 'Back to sign in',
        onPressed: () => Navigator.of(context).pop(),
      );
    } else if (closed) {
      body = _Message(
        icon: 'lock',
        title: 'Sign-up is closed right now',
        text: 'Please contact the BQuee team to get your business started.',
        button: 'Back to sign in',
        onPressed: () => Navigator.of(context).pop(),
      );
    } else {
      body = Form(
        key: _form,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  Text(
                    approval
                        ? 'Create your business account. The BQuee team approves new businesses before they can sign in.'
                        : 'Create your business account and start with a $trialDays-day free trial.',
                    style: const TextStyle(color: Tk.ink3, fontSize: 13.5, height: 1.4),
                  ),
                  const SizedBox(height: 16),
                  // The role is fixed: only business owners sign up here.
                  Container(
                    padding: const EdgeInsets.all(14),
                    margin: const EdgeInsets.only(bottom: 18),
                    decoration: BoxDecoration(
                      color: b.wash,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: mix(b.c, 0.25, Tk.line)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(gradient: b.gradBtn, borderRadius: BorderRadius.circular(12)),
                          alignment: Alignment.center,
                          child: const AppIcon('store', size: 21, color: Colors.white, stroke: 2),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Signing up as', style: TextStyle(color: Tk.ink3, fontSize: 12)),
                              Text(
                                'Business owner',
                                style: TextStyle(color: Tk.ink, fontWeight: FontWeight.w700, fontSize: 15.5),
                              ),
                              Text(
                                'Staff accounts are added by the owner after sign-up.',
                                style: TextStyle(color: Tk.ink3, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                        AppIcon('lock', size: 18, color: b.c),
                      ],
                    ),
                  ),
                  StepBar(steps: _kSteps, at: at, onPick: _go),
                  if (at == 0) ...[
                    if (_packages.isNotEmpty)
                      FieldGroup(
                        'Package',
                        hint: 'Pick the plan that fits your business.',
                        children: [
                          for (final p in _packages)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: _PackageTile(
                                p: p,
                                on: package == p.s('name'),
                                onTap: () => setState(() => package = p.s('name')),
                              ),
                            ),
                        ],
                      ),
                    FieldGroup(
                      'Your business',
                      children: [
                        FieldX(
                          'Business name',
                          business,
                          required: true,
                          icon: 'store',
                          caps: TextCapitalization.words,
                          maxLength: 80,
                        ),
                        if (cats.isNotEmpty)
                          SelectX<String>(
                            'Business type',
                            value: category,
                            options: [
                              const MapEntry('', 'Choose one (optional)'),
                              for (final c in cats) MapEntry(c.s('id'), c.s('name')),
                            ],
                            onChanged: (v) => setState(() => category = v),
                          ),
                      ],
                    ),
                  ],
                  if (at == 1)
                    FieldGroup(
                      'Your customers’ booking form',
                      hint: 'You can still add services and staff later.',
                      children: [
                        BookingModes(
                          serviceMode: serviceMode,
                          staffMode: staffMode,
                          onChanged: (k, v) => setState(() {
                            if (k == 'serviceMode') {
                              serviceMode = v;
                            } else {
                              staffMode = v;
                            }
                          }),
                        ),
                      ],
                    ),
                  if (at == 2) ...[
                    FieldGroup(
                      'About you',
                      children: [
                        FieldX(
                          'Your name',
                          owner,
                          required: true,
                          icon: 'user',
                          caps: TextCapitalization.words,
                          maxLength: 80,
                        ),
                        FieldX(
                          'Mobile number',
                          mobile,
                          required: true,
                          icon: 'phone',
                          keyboard: TextInputType.phone,
                          maxLength: 20,
                        ),
                        FieldX(
                          'Email',
                          email,
                          icon: 'mail',
                          keyboard: TextInputType.emailAddress,
                          maxLength: 120,
                          validate: (s) => s.isEmpty || s.contains('@') ? null : 'Enter a valid email',
                        ),
                      ],
                    ),
                    FieldGroup(
                      'Sign-in details',
                      children: [
                        FieldX(
                          'Username',
                          username,
                          required: true,
                          icon: 'user',
                          maxLength: 40,
                          helper: 'Letters, numbers, dots and dashes',
                        ),
                        Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: TextFormField(
                            controller: pass,
                            obscureText: hide,
                            decoration: InputDecoration(
                              labelText: 'Password *',
                              helperText: 'At least 8 characters',
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
                            validator: (v) => (v ?? '').length < 8 ? 'Use at least 8 characters' : null,
                          ),
                        ),
                      ],
                    ),
                    FieldGroup(
                      'Invited by someone at BQuee?',
                      hint: 'Optional – type their referral code.',
                      children: [
                        FieldX(
                          'Referral code',
                          referral,
                          icon: 'share',
                          maxLength: 12,
                          caps: TextCapitalization.characters,
                        ),
                      ],
                    ),
                  ],
                  if (error.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: Tk.badBg, borderRadius: BorderRadius.circular(12)),
                      child: Text(
                        error,
                        style: const TextStyle(color: Tk.badFg, fontWeight: FontWeight.w500),
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
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      if (at > 0) ...[
                        Btn('Back', icon: 'back', kind: BtnKind.quiet, onPressed: () => _go(at - 1)),
                        const SizedBox(width: 10),
                      ],
                      Expanded(
                        child: Btn(
                          at < _kSteps.length - 1
                              ? 'Next'
                              : approval
                              ? 'Send sign-up'
                              : 'Create my account',
                          iconRight: 'arrow',
                          expand: true,
                          busy: busy,
                          onPressed: _submit,
                        ),
                      ),
                    ],
                  ),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Already have an account? Sign in'),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // Back (app bar or phone) goes to the previous step first.
    final stepBack = at > 0 && pendingFor.isEmpty && !closed;
    return PopScope(
      canPop: !stepBack,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _go(at - 1);
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          leading: IconButton(
            icon: const AppIcon('back', size: 22),
            onPressed: () => stepBack ? _go(at - 1) : Navigator.of(context).pop(),
            tooltip: 'Back',
          ),
          title: const Text('Sign up your business'),
        ),
        body: SafeArea(child: body),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  final String icon;
  final String title;
  final String text;
  final String button;
  final VoidCallback onPressed;
  const _Message({
    required this.icon,
    required this.title,
    required this.text,
    required this.button,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: b.wash, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: AppIcon(icon, size: 32, color: b.c, stroke: 2),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontFamily: Tk.serif, fontSize: 22, fontWeight: FontWeight.w600, color: Tk.ink),
            ),
            const SizedBox(height: 8),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Tk.ink3, fontSize: 14, height: 1.45),
            ),
            const SizedBox(height: 22),
            Btn(button, kind: BtnKind.soft, onPressed: onPressed),
          ],
        ),
      ),
    );
  }
}

class _PackageTile extends StatelessWidget {
  final Json p;
  final bool on;
  final VoidCallback onTap;
  const _PackageTile({required this.p, required this.on, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Semantics(
      button: true,
      selected: on,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: on ? b.wash : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: on ? b.c : Tk.line, width: on ? 1.8 : 1.2),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            p.s('name'),
                            style: const TextStyle(fontWeight: FontWeight.w700, color: Tk.ink, fontSize: 15),
                          ),
                        ),
                        if (p.b('highlight')) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(gradient: b.gradBtn, borderRadius: BorderRadius.circular(99)),
                            child: const Text(
                              'Popular',
                              style: TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (p.s('period').isNotEmpty)
                      Text(p.s('period'), style: const TextStyle(color: Tk.ink3, fontSize: 12.5)),
                  ],
                ),
              ),
              Text(
                p.s('price'),
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: b.ink),
              ),
              const SizedBox(width: 10),
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: on ? b.c : Colors.white,
                  border: Border.all(color: on ? b.c : Tk.line2, width: 1.5),
                ),
                alignment: Alignment.center,
                child: on ? const AppIcon('check', size: 13, color: Colors.white, stroke: 2.6) : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
