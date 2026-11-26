// Codes sent by email (server: src/routes/email.js), shared by both apps:
//   EmailCodeField          sign-up: the email, a "Send code" button and the 6-digit code from the email
//   ForgotPasswordScreen    forgot password: email → code + new password → done
//   EmailCodeSignInScreen   sign-in after too many wrong passwords: the code we emailed (BQuee Biz)
// They are only shown while the server says email codes are on (site['emailCodes']).

import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/json.dart';
import '../ui/icons.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

final RegExp _emailShape = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
String? _codeCheck(String s) => RegExp(r'^\d{6}$').hasMatch(s) ? null : 'Enter the 6-digit code from the email';

/// The email + its code while signing up. [sent] is true once a code went to the email shown now.
class EmailCode {
  final email = TextEditingController();
  final code = TextEditingController();
  String ticket = '';
  String sentTo = '';

  bool get sent => ticket.isNotEmpty && sentTo == email.text.trim().toLowerCase();

  /// What the sign-up sends to the server.
  Map<String, dynamic> body() => {'email': email.text.trim(), 'emailTicket': ticket, 'emailCode': code.text.trim()};

  void dispose() {
    email.dispose();
    code.dispose();
  }
}

/// Email with a "Send code" button; after sending, the code field. [purpose]: 'signup' (business)
/// or 'customer-signup'.
class EmailCodeField extends StatefulWidget {
  final Api api;
  final EmailCode value;
  final String purpose;
  const EmailCodeField({super.key, required this.api, required this.value, this.purpose = 'signup'});

  @override
  State<EmailCodeField> createState() => _EmailCodeFieldState();
}

class _EmailCodeFieldState extends State<EmailCodeField> {
  bool busy = false;
  String note = 'We’ll email you a code to confirm it’s your email.';
  String error = '';

  Future<void> _send() async {
    final v = widget.value;
    final email = v.email.text.trim();
    if (!_emailShape.hasMatch(email)) {
      setState(() => error = 'Enter a valid email first');
      return;
    }
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final r = asJson(await widget.api.post('/api/email-code', {'email': email, 'purpose': widget.purpose}));
      v.ticket = r.s('ticket');
      v.sentTo = email.toLowerCase();
      v.code.clear();
      if (mounted) {
        setState(() {
          busy = false;
          note = 'We emailed a 6-digit code to $email. It works for ${r.i('minutes', 15)} minutes.';
        });
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
          error = 'Could not send the code. Check your internet connection and try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.value;
    final b = brandOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FieldX(
          'Email',
          v.email,
          required: true,
          icon: 'mail',
          keyboard: TextInputType.emailAddress,
          maxLength: 120,
          onChanged: (_) => setState(() {}),
          validate: (s) => _emailShape.hasMatch(s) ? null : 'Enter a valid email',
          suffix: Padding(
            padding: const EdgeInsets.only(right: 6),
            child: busy
                ? const Padding(
                    padding: EdgeInsets.all(14),
                    child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : TextButton(
                    onPressed: _send,
                    child: Text(
                      v.sent ? 'Send again' : 'Send code',
                      style: TextStyle(color: b.c, fontWeight: FontWeight.w700),
                    ),
                  ),
          ),
        ),
        if (error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(error, style: const TextStyle(color: Tk.badFg, fontWeight: FontWeight.w500)),
          ),
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIcon('mail', size: 16, color: b.c),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  v.sent ? note : 'We’ll email you a code to confirm it’s your email.',
                  style: const TextStyle(color: Tk.ink3, fontSize: 12.5, height: 1.4),
                ),
              ),
            ],
          ),
        ),
        if (v.sent)
          FieldX(
            'Code from the email',
            v.code,
            required: true,
            icon: 'shield',
            keyboard: TextInputType.number,
            maxLength: 6,
            validate: _codeCheck,
          ),
      ],
    );
  }
}

/// The message under the form when a code was never sent (the sign-up checks this before sending).
const String kEmailCodeNeeded = 'Confirm your email: tap “Send code” and enter the code we email you.';

/// Opens "Forgot password". [account]: 'business' (BQuee Biz) or 'customer'.
Future<void> openForgotPassword(BuildContext context, Api api, {String account = 'business', String email = ''}) =>
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => ForgotPasswordScreen(api: api, account: account, email: email)),
    );

class ForgotPasswordScreen extends StatefulWidget {
  final Api api;
  final String account;
  final String email;
  const ForgotPasswordScreen({super.key, required this.api, this.account = 'business', this.email = ''});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  late final email = TextEditingController(text: widget.email.contains('@') ? widget.email.trim() : '');
  final code = TextEditingController();
  final pass = TextEditingController();
  String ticket = '';
  bool busy = false;
  bool hide = true;
  bool done = false;
  String error = '';

  @override
  void dispose() {
    for (final c in [email, code, pass]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() step) async {
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await step();
      if (mounted) setState(() => busy = false);
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
          error = 'Something went wrong. Check your internet connection and try again.';
        });
      }
    }
  }

  Future<void> _ask() => _run(() async {
        final r = asJson(await widget.api.post('/api/password/forgot', {
          'email': email.text.trim(),
          'account': widget.account,
        }));
        ticket = r.s('ticket');
        code.clear();
      });

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    if (ticket.isEmpty) return _ask();
    await _run(() async {
      await widget.api.post('/api/password/reset', {
        'ticket': ticket,
        'code': code.text.trim(),
        'password': pass.text,
        'account': widget.account,
      });
      done = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot password')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            if (done) ...[
              Center(child: AppIcon('check', size: 46, color: b.c)),
              const SizedBox(height: 12),
              const Text(
                'Password changed',
                textAlign: TextAlign.center,
                style: TextStyle(fontFamily: Tk.serif, fontSize: 24, fontWeight: FontWeight.w600, color: Tk.ink),
              ),
              const SizedBox(height: 8),
              const Text(
                'Sign in with your new password. For safety, you’ve been signed out on every other device.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Tk.ink2, height: 1.45),
              ),
              const SizedBox(height: 20),
              Btn('Back to sign in', icon: 'arrow', expand: true, onPressed: () => Navigator.of(context).pop()),
            ] else
              Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      ticket.isEmpty
                          ? 'Enter the email of your account. We’ll email you a code to choose a new password.'
                          : 'If ${email.text.trim()} belongs to an account, we’ve emailed it a 6-digit code. It works for 15 minutes. No email? Check spam, or send it again.',
                      style: const TextStyle(color: Tk.ink2, height: 1.45),
                    ),
                    const SizedBox(height: 16),
                    if (ticket.isEmpty)
                      FieldX(
                        'Email',
                        email,
                        required: true,
                        icon: 'mail',
                        keyboard: TextInputType.emailAddress,
                        maxLength: 120,
                        validate: (s) => _emailShape.hasMatch(s) ? null : 'Enter a valid email',
                      )
                    else ...[
                      FieldX(
                        'Code from the email',
                        code,
                        required: true,
                        icon: 'shield',
                        keyboard: TextInputType.number,
                        maxLength: 6,
                        validate: _codeCheck,
                      ),
                      FieldX(
                        'New password',
                        pass,
                        required: true,
                        icon: 'lock',
                        obscure: hide,
                        validate: (s) => s.length < 8 ? 'At least 8 characters' : null,
                        suffix: IconButton(
                          tooltip: hide ? 'Show password' : 'Hide password',
                          icon: AppIcon('eye', size: 20, color: hide ? Tk.ink3 : b.c),
                          onPressed: () => setState(() => hide = !hide),
                        ),
                      ),
                    ],
                    if (error.isNotEmpty)
                      Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: Tk.badBg, borderRadius: BorderRadius.circular(12)),
                        child: Text(error, style: const TextStyle(color: Tk.badFg, fontWeight: FontWeight.w500)),
                      ),
                    Btn(
                      ticket.isEmpty ? 'Email me a code' : 'Set new password',
                      icon: ticket.isEmpty ? 'mail' : 'check',
                      expand: true,
                      busy: busy,
                      onPressed: _submit,
                    ),
                    if (ticket.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Btn('Send the code again', kind: BtnKind.quiet, expand: true, onPressed: busy ? null : _ask),
                    ],
                    if (widget.account == 'business') ...[
                      const SizedBox(height: 14),
                      const Text(
                        'Staff without an email: ask your business owner to set a new password.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Tk.ink3, fontSize: 12.5, height: 1.45),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// After too many wrong passwords on an account: the code we emailed (only when the password was
/// right). Returns the server's sign-in answer (a session, or {mfa} for the two-step code), or null
/// when closed.
/// `endpoint`: where the code goes – business accounts `/api/login/email-code`, customers
/// `/api/customer/login/email-code`.
Future<Json?> openEmailCodeSignIn(BuildContext context, Api api, Json step, {String endpoint = '/api/login/email-code'}) =>
    Navigator.of(context).push<Json>(
      MaterialPageRoute<Json>(builder: (_) => EmailCodeSignInScreen(api: api, step: step, endpoint: endpoint)),
    );

class EmailCodeSignInScreen extends StatefulWidget {
  final Api api;
  final Json step;
  final String endpoint;
  const EmailCodeSignInScreen({
    super.key,
    required this.api,
    required this.step,
    this.endpoint = '/api/login/email-code',
  });

  @override
  State<EmailCodeSignInScreen> createState() => _EmailCodeSignInScreenState();
}

class _EmailCodeSignInScreenState extends State<EmailCodeSignInScreen> {
  final _form = GlobalKey<FormState>();
  final code = TextEditingController();
  bool busy = false;
  String error = '';

  @override
  void dispose() {
    code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final r = asJson(await widget.api.post(widget.endpoint, {
        'ticket': widget.step.s('ticket'),
        'code': code.text.trim(),
      }));
      if (mounted) Navigator.of(context).pop(r);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = e.message;
          code.clear();
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
    return Scaffold(
      appBar: AppBar(title: const Text('Check your email')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    widget.step.s(
                      'message',
                      'We’ve emailed a 6-digit sign-in code to the account’s email.',
                    ),
                    style: const TextStyle(color: Tk.ink2, height: 1.45),
                  ),
                  const SizedBox(height: 16),
                  FieldX(
                    'Code from the email',
                    code,
                    required: true,
                    icon: 'shield',
                    keyboard: TextInputType.number,
                    maxLength: 6,
                    autofocus: true,
                    validate: _codeCheck,
                  ),
                  if (error.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: Tk.badBg, borderRadius: BorderRadius.circular(12)),
                      child: Text(error, style: const TextStyle(color: Tk.badFg, fontWeight: FontWeight.w500)),
                    ),
                  Btn('Sign in', icon: 'arrow', expand: true, busy: busy, onPressed: _submit),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
