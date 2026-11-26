// Two-step sign-in in the BQuee Biz app (same as the website), shown after the right password for
// super admins, the BQuee team and owners:
//   setup   first time: scan the QR code (or copy the key) into an authenticator app, type its code,
//           then keep the 10 backup codes
//   verify  later sign-ins: the 6-digit code from the app, or a backup code

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/core/qr/qr_encode.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';

/// Opens the two-step sign-in screen for the answer of step 1. Returns when signed in or cancelled.
Future<void> openMfa(BuildContext context, Json mfa) =>
    Navigator.of(context).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => MfaScreen(mfa: mfa)));

class MfaScreen extends StatefulWidget {
  final Json mfa;

  /// Sends the code; returns backup codes (after a setup). Default: the sign-in step.
  final Future<List<String>> Function(String code)? submit;

  /// After the last step. Default: back to the first screen (signed in).
  final VoidCallback? onFinished;
  const MfaScreen({super.key, required this.mfa, this.submit, this.onFinished});

  @override
  State<MfaScreen> createState() => _MfaScreenState();
}

class _MfaScreenState extends State<MfaScreen> {
  final code = TextEditingController();
  bool backup = false;
  bool busy = false;
  String error = '';
  List<String> saved = const [];

  bool get setup => widget.mfa.s('step') == 'setup';

  @override
  void dispose() {
    code.dispose();
    super.dispose();
  }

  void _close() => widget.onFinished != null ? widget.onFinished!() : Navigator.of(context).popUntil((r) => r.isFirst);

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final value = backup ? code.text.trim() : code.text.replaceAll(RegExp(r'\D'), '');
    if (!backup && value.length != 6)
      return setState(() => error = 'Enter the 6-digit code from your authenticator app.');
    if (backup && value.length < 8) return setState(() => error = 'Enter one of your backup codes, like 4f7k-2m9q.');
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final codes = widget.submit != null
          ? await widget.submit!(value)
          : await session.completeMfa(widget.mfa.s('challenge'), value);
      if (!mounted) return;
      if (codes.isNotEmpty) {
        setState(() {
          saved = codes;
          busy = false;
        });
      } else {
        _close();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = e.message;
        code.clear();
      });
      // An expired or cancelled step: back to the sign-in screen.
      if (e.status == 401 && e.message.contains('sign in again'))
        Future.delayed(const Duration(milliseconds: 1600), () => mounted ? Navigator.of(context).pop() : null);
    } catch (_) {
      if (mounted) {
        setState(() {
          busy = false;
          error = 'Could not check the code. Check your internet connection and try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        leading: saved.isEmpty
            ? IconButton(
                icon: const AppIcon('x', size: 22),
                tooltip: 'Cancel',
                onPressed: () => Navigator.of(context).pop(),
              )
            : const SizedBox.shrink(),
        title: const Text('Two-step sign-in'),
      ),
      body: SafeArea(
        child: saved.isNotEmpty ? BackupCodesView(codes: saved, onDone: _close) : _form(context),
      ),
    );
  }

  Widget _form(BuildContext context) {
    final b = brandOf(context);
    final secret = widget.mfa.s('secret');
    final grouped = secret.replaceAllMapped(RegExp(r'.{4}'), (m) => '${m[0]} ').trim();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        Text(
          setup ? 'Protect your account' : 'Enter your code',
          style: const TextStyle(fontFamily: Tk.serif, fontSize: 24, fontWeight: FontWeight.w600, color: Tk.ink),
        ),
        const SizedBox(height: 6),
        Text(
          setup
              ? 'Your account needs a code from an authenticator app (Google Authenticator, Microsoft Authenticator or similar) each time you sign in. Set it up once – it takes a minute.'
              : backup
              ? 'Type one of the backup codes you saved when you set up two-step sign-in. Each works once.'
              : 'Open your authenticator app and enter the 6-digit code for BQuee.',
          style: const TextStyle(color: Tk.ink2, fontSize: 14, height: 1.45),
        ),
        if (setup) ...[
          const SizedBox(height: 18),
          const Text(
            '1. Add BQuee to your authenticator app',
            style: TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
          ),
          const SizedBox(height: 4),
          const Text(
            'On another phone: scan this code. On this phone: tap "Open authenticator app" or copy the key.',
            style: TextStyle(color: Tk.ink3, fontSize: 12.5),
          ),
          const SizedBox(height: 12),
          Center(
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Tk.line2),
              ),
              child: QrView(data: widget.mfa.s('uri'), size: 190, margin: 1),
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
            decoration: BoxDecoration(color: Tk.porcelain, borderRadius: BorderRadius.circular(14)),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Key', style: TextStyle(color: Tk.ink3, fontSize: 12)),
                      SelectableText(
                        grouped,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w600,
                          color: Tk.ink,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Copy key',
                  icon: const AppIcon('copy', size: 19, color: Tk.ink2),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: secret));
                    toast(context, 'Key copied');
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Btn(
            'Open authenticator app',
            icon: 'shield',
            kind: BtnKind.soft,
            onPressed: () async {
              if (!await Native.openUrl(widget.mfa.s('uri')) && context.mounted)
                toast(context, 'No authenticator app found – install one, or copy the key.');
            },
          ),
          const SizedBox(height: 18),
          const Text(
            '2. Enter the 6-digit code it shows',
            style: TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
          ),
        ],
        const SizedBox(height: 12),
        TextField(
          controller: code,
          autofocus: !setup,
          keyboardType: backup ? TextInputType.visiblePassword : TextInputType.number,
          textAlign: backup ? TextAlign.start : TextAlign.center,
          maxLength: backup ? 12 : 6,
          autofillHints: const [AutofillHints.oneTimeCode],
          style: backup ? null : const TextStyle(fontSize: 24, letterSpacing: 8, fontWeight: FontWeight.w600),
          inputFormatters: backup ? null : [FilteringTextInputFormatter.digitsOnly],
          onSubmitted: (_) => _submit(),
          decoration: InputDecoration(labelText: backup ? 'Backup code' : '6-digit code', counterText: ''),
        ),
        if (error.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Tk.badBg, borderRadius: BorderRadius.circular(12)),
            child: Text(
              error,
              style: const TextStyle(color: Tk.badFg, fontWeight: FontWeight.w500),
            ),
          ),
        const SizedBox(height: 16),
        Btn(
          setup ? 'Turn on and sign in' : 'Sign in',
          iconRight: 'arrow',
          expand: true,
          busy: busy,
          onPressed: _submit,
        ),
        if (!setup)
          TextButton(
            onPressed: () => setState(() {
              backup = !backup;
              code.clear();
              error = '';
            }),
            child: Text(
              backup ? 'Use the authenticator app' : 'Lost your phone? Use a backup code',
              style: TextStyle(color: b.c),
            ),
          ),
        const SizedBox(height: 6),
        const Text(
          'The code changes every 30 seconds. If it isn’t accepted, check that your phone’s time is set automatically.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Tk.ink3, fontSize: 12),
        ),
      ],
    );
  }
}

/// The 10 one-time backup codes, shown once (after setup, and when new ones are made).
class BackupCodesView extends StatelessWidget {
  final List<String> codes;
  final VoidCallback onDone;
  final String doneLabel;
  const BackupCodesView({
    super.key,
    required this.codes,
    required this.onDone,
    this.doneLabel = 'I’ve saved them – continue',
  });

  @override
  Widget build(BuildContext context) {
    final text = 'BQuee backup codes – each works once\n\n${codes.join('\n')}\n';
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        const Tag('Two-step sign-in is on', icon: 'check', tone: TagTone.green),
        const SizedBox(height: 12),
        const Text(
          'Save your backup codes',
          style: TextStyle(fontFamily: Tk.serif, fontSize: 24, fontWeight: FontWeight.w600, color: Tk.ink),
        ),
        const SizedBox(height: 6),
        const Text(
          'If you lose your phone, sign in with one of these codes instead of the app code. Each code works once. Keep them somewhere safe – they are shown only now.',
          style: TextStyle(color: Tk.ink2, fontSize: 14, height: 1.45),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Tk.porcelain,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Tk.line2),
          ),
          child: Wrap(
            spacing: 18,
            runSpacing: 10,
            children: [
              for (final c in codes)
                SizedBox(
                  width: 120,
                  child: Text(
                    c,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Tk.ink,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Btn(
                'Copy',
                icon: 'copy',
                kind: BtnKind.soft,
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: text));
                  toast(context, 'Backup codes copied');
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Btn(
                'Share',
                icon: 'link',
                kind: BtnKind.soft,
                onPressed: () => Native.shareText(text, subject: 'BQuee backup codes'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Btn(doneLabel, iconRight: 'arrow', expand: true, onPressed: onDone),
      ],
    );
  }
}

/// Another person's two-step sign-in status, with "Reset" for a lost phone (super admin: owners and
/// team; team members with "edit businesses": owners). They set it up again at their next sign-in.
class MfaResetTile extends StatefulWidget {
  final String userId;
  final String name;
  final bool enabled;
  const MfaResetTile({super.key, required this.userId, required this.name, required this.enabled});

  @override
  State<MfaResetTile> createState() => _MfaResetTileState();
}

class _MfaResetTileState extends State<MfaResetTile> {
  late bool on = widget.enabled;

  Future<void> _reset() async {
    final ok = await confirmDialog(
      context,
      title: 'Reset two-step sign-in for ${widget.name}?',
      message: 'Use this when they lost their phone. They are signed out everywhere and set up their authenticator app again at their next sign-in.',
      confirm: 'Reset',
    );
    if (!ok || !mounted) return;
    try {
      await session.api.post('/api/admin/users/${widget.userId}/mfa-reset');
      if (!mounted) return;
      setState(() => on = false);
      toast(context, 'Two-step sign-in reset for ${widget.name}');
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
      decoration: BoxDecoration(color: Tk.porcelain, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Two-step sign-in',
                  style: TextStyle(fontWeight: FontWeight.w700, color: Tk.ink),
                ),
                Text(
                  on
                      ? 'Set up – a code is asked at every sign-in.'
                      : 'Not set up yet – they set it up at their next sign-in.',
                  style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                ),
              ],
            ),
          ),
          if (on)
            Btn('Reset', icon: 'refresh', kind: BtnKind.danger, small: true, onPressed: _reset)
          else
            const Tag('Next sign-in', tone: TagTone.amber),
        ],
      ),
    );
  }
}
