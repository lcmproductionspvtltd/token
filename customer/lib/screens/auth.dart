// Sign in / sign up for customers, in two tabs on one screen.

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool signUp = false;
  final _form = GlobalKey<FormState>();
  final login = TextEditingController();
  final name = TextEditingController();
  final mobile = TextEditingController();
  final email = TextEditingController();
  final pass = TextEditingController();
  String photo = '';
  bool hide = true;
  bool busy = false;
  String error = '';

  @override
  void dispose() {
    for (final c in [login, name, mobile, email, pass]) {
      c.dispose();
    }
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
      if (signUp) {
        await session.signUp(
          name: name.text,
          mobile: mobile.text,
          email: email.text,
          password: pass.text,
          photo: photo,
        );
      } else {
        await session.signIn(login.text, pass.text);
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
          error = 'Something went wrong. Check your internet connection and try again.';
        });
      }
    }
  }

  Future<void> _pickPhoto() async {
    final p = await Native.pickImage(maxSize: 600);
    if (p != null && mounted) setState(() => photo = p);
  }

  Widget _tab(String label, String icon, bool on, VoidCallback onTap) {
    final b = brandOf(context);
    return Expanded(
      child: Semantics(
        button: true,
        selected: on,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            height: 46,
            decoration: BoxDecoration(
              color: on ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(14),
              boxShadow: on
                  ? [BoxShadow(color: fade(b.c, 0.18), blurRadius: 14, offset: const Offset(0, 4), spreadRadius: -6)]
                  : null,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AppIcon(icon, size: 18, color: on ? b.ink : Tk.ink3, stroke: 2),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: TextStyle(fontWeight: FontWeight.w600, color: on ? b.ink : Tk.ink3),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final passField = Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
        controller: pass,
        obscureText: hide,
        onFieldSubmitted: (_) => _submit(),
        decoration: InputDecoration(
          labelText: 'Password *',
          helperText: signUp ? 'At least 8 characters' : null,
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
        validator: (v) =>
            (v ?? '').isEmpty ? 'Enter your password' : (signUp && v!.length < 8 ? 'Use at least 8 characters' : null),
      ),
    );

    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          Container(
            height: 340,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [mix(b.c, 0.62, const Color(0xFF160B22)), mix(b.c, 0.7, b.rose)],
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
                        'Skip the waiting room.',
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
                        'Scan a business’s QR code, book your token and see your place in the queue live.',
                        style: TextStyle(color: fade(Colors.white, 0.82), fontSize: 14, height: 1.4),
                      ),
                      const SizedBox(height: 22),
                      AppCard(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
                        child: Form(
                          key: _form,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(4),
                                decoration: BoxDecoration(
                                  color: Tk.canvas,
                                  borderRadius: BorderRadius.circular(18),
                                  border: Border.all(color: Tk.line),
                                ),
                                child: Row(
                                  children: [
                                    _tab(
                                      'Sign in',
                                      'lock',
                                      !signUp,
                                      () => setState(() {
                                        signUp = false;
                                        error = '';
                                      }),
                                    ),
                                    _tab(
                                      'Sign up',
                                      'user',
                                      signUp,
                                      () => setState(() {
                                        signUp = true;
                                        error = '';
                                      }),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 20),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 4),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    Text(
                                      signUp ? 'Create your account' : 'Welcome back',
                                      style: const TextStyle(
                                        fontFamily: Tk.serif,
                                        fontSize: 23,
                                        fontWeight: FontWeight.w600,
                                        color: Tk.ink,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      signUp
                                          ? 'It takes a minute. Your details fill in every booking for you.'
                                          : 'Sign in with your mobile number or email.',
                                      style: const TextStyle(color: Tk.ink3, fontSize: 13.5, height: 1.35),
                                    ),
                                    const SizedBox(height: 18),
                                    if (signUp) ...[
                                      Center(
                                        child: GestureDetector(
                                          onTap: _pickPhoto,
                                          child: Stack(
                                            clipBehavior: Clip.none,
                                            children: [
                                              Container(
                                                padding: const EdgeInsets.all(3),
                                                decoration: BoxDecoration(shape: BoxShape.circle, gradient: b.gradBtn),
                                                child: Avatar(
                                                  name.text.isEmpty ? '+' : name.text,
                                                  photo: photo,
                                                  size: 82,
                                                ),
                                              ),
                                              Positioned(
                                                right: -2,
                                                bottom: -2,
                                                child: Container(
                                                  width: 30,
                                                  height: 30,
                                                  decoration: BoxDecoration(
                                                    color: Colors.white,
                                                    shape: BoxShape.circle,
                                                    border: Border.all(color: Tk.line),
                                                  ),
                                                  alignment: Alignment.center,
                                                  child: AppIcon('camera', size: 16, color: b.c, stroke: 2),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Center(
                                        child: Text(
                                          photo.isEmpty ? 'Add a profile photo (optional)' : 'Tap to change photo',
                                          style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                                        ),
                                      ),
                                      const SizedBox(height: 16),
                                      FieldX(
                                        'Your name',
                                        name,
                                        required: true,
                                        icon: 'user',
                                        caps: TextCapitalization.words,
                                        maxLength: 60,
                                        onChanged: (_) => setState(() {}),
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
                                        validate: (v) => v.isEmpty || v.contains('@') ? null : 'Enter a valid email',
                                      ),
                                    ] else
                                      FieldX(
                                        'Mobile number or email',
                                        login,
                                        required: true,
                                        icon: 'user',
                                        keyboard: TextInputType.emailAddress,
                                      ),
                                    passField,
                                    if (error.isNotEmpty)
                                      Container(
                                        margin: const EdgeInsets.only(bottom: 12),
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          color: Tk.badBg,
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          error,
                                          style: const TextStyle(color: Tk.badFg, fontWeight: FontWeight.w500),
                                        ),
                                      ),
                                    Btn(
                                      signUp ? 'Create my account' : 'Sign in',
                                      icon: 'arrow',
                                      expand: true,
                                      busy: busy,
                                      onPressed: _submit,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        signUp
                            ? 'This app is for customers. Business owners and staff use the BQuee business app.'
                            : 'Business owner or staff? Use the BQuee business app instead.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Tk.ink3, fontSize: 12.5, height: 1.45),
                      ),
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
