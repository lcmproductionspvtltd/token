// Delete or deactivate my account: any user sends a request (with their password); the BQuee
// super admin reviews it. Shows the latest request's status and lets a waiting request be cancelled.

import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/json.dart';
import '../ui/icons.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

/// Opens the request page. [role]: customer, owner, staff or platform_staff.
Future<void> openAccountRequest(BuildContext context, String role) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AccountRequestPage(role: role)));

/// Reasons offered to each kind of user (the server accepts all of them).
const Map<String, List<String>> _reasonsFor = {
  'customer': ['not_using', 'privacy', 'other_app', 'other'],
  'owner': ['business_closed', 'not_using', 'too_expensive', 'other_app', 'privacy', 'other'],
  'staff': ['left_job', 'not_using', 'privacy', 'other'],
  'platform_staff': ['left_job', 'not_using', 'privacy', 'other'],
};

/// What happens when the request is approved, in plain words.
String _effect(String role, String kind) {
  if (kind == 'deactivate') {
    switch (role) {
      case 'owner':
        return 'Your business is switched off: customers can’t book and nobody in your team can sign in. Everything is kept, so BQuee can switch it back on later.';
      case 'staff':
        return 'Your login is switched off. Your past work stays in the business’s records, and it can be switched back on later.';
      case 'platform_staff':
        return 'Your BQuee team login is switched off. It can be switched back on later.';
      default:
        return 'Your account is switched off and you can’t sign in. Your token history is kept, and BQuee can switch it back on later.';
    }
  }
  switch (role) {
    case 'owner':
      return 'Your whole business is removed for good – branches, services, staff logins, tokens, offers and reviews. This can’t be undone.';
    case 'staff':
      return 'Your staff profile and login are removed for good. Past tokens keep your name in the business’s records.';
    case 'platform_staff':
      return 'Your BQuee team login is removed for good.';
    default:
      return 'Your account and photo are removed for good. Tokens you already booked stay with the businesses.';
  }
}

String _when(int ms) {
  if (ms <= 0) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  return '${d.day} ${months[d.month - 1]} ${d.year}';
}

class AccountRequestPage extends StatefulWidget {
  final String role;
  const AccountRequestPage({super.key, required this.role});

  @override
  State<AccountRequestPage> createState() => _AccountRequestPageState();
}

class _AccountRequestPageState extends State<AccountRequestPage> {
  /// Customers use the customer app's address; everyone else the business app's.
  String get _api => widget.role == 'customer' ? '/api/customer/account-request' : '/api/account-request';
  Json? data;
  String? loadError;
  String kind = 'deactivate';
  String reason = '';
  final details = TextEditingController();
  final password = TextEditingController();
  final formKey = GlobalKey<FormState>();
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    details.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await serverApi.getJson(_api);
      if (mounted) {
        setState(() {
          data = d;
          loadError = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => loadError = e is ApiException ? e.message : 'Could not load. Check your connection.');
    }
  }

  Future<void> _send() async {
    if (reason.isEmpty) {
      toast(context, 'Choose a reason', error: true);
      return;
    }
    if (!(formKey.currentState?.validate() ?? false)) return;
    final del = kind == 'delete';
    final ok = await confirmDialog(
      context,
      title: del ? 'Ask to delete your account?' : 'Ask to deactivate your account?',
      message: '${_effect(widget.role, kind)}\n\nThe BQuee team reviews your request first.',
      confirm: 'Send request',
      danger: del,
    );
    if (!ok || !mounted) return;
    setState(() => busy = true);
    try {
      final d = asJson(
        await serverApi.post(_api, {
          'kind': kind,
          'reason': reason,
          'details': details.text.trim(),
          'password': password.text,
        }),
      );
      if (!mounted) return;
      password.clear();
      setState(() => data = d);
      toast(context, 'Request sent – the BQuee team will review it');
    } catch (e) {
      if (mounted)
        toast(context, e is ApiException ? e.message : 'Could not send. Check your connection.', error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _cancel(Json r) async {
    final ok = await confirmDialog(
      context,
      title: 'Cancel your request?',
      message: 'Your account stays as it is.',
      confirm: 'Cancel request',
      danger: false,
    );
    if (!ok || !mounted) return;
    try {
      final d = asJson(await serverApi.post('$_api/${r.s('id')}/cancel'));
      if (mounted) {
        setState(() => data = d);
        toast(context, 'Request cancelled');
      }
    } catch (e) {
      if (mounted)
        toast(context, e is ApiException ? e.message : 'Could not cancel. Check your connection.', error: true);
    }
  }

  Widget _status(Json r) {
    final del = r.s('kind') == 'delete';
    final what = del ? 'delete' : 'deactivate';
    final status = r.s('status');
    final (String label, TagTone tone, String text) = switch (status) {
      'pending' => (
        'Waiting for review',
        TagTone.amber,
        'You asked to $what your account on ${_when(r.i('createdAt'))}. The BQuee team will review it soon.',
      ),
      'done' => (
        'Done',
        TagTone.green,
        'Your request to $what your account was carried out on ${_when(r.i('handledAt'))}.',
      ),
      'rejected' => ('Not approved', TagTone.red, 'Your request to $what your account was not approved.'),
      _ => ('Cancelled', TagTone.neutral, 'You cancelled your request to $what your account.'),
    };
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Your request',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Tk.ink),
              ),
              const Spacer(),
              Tag(label, dot: true, tone: tone),
            ],
          ),
          const SizedBox(height: 10),
          Text(text, style: const TextStyle(color: Tk.ink2, height: 1.45)),
          const SizedBox(height: 8),
          Text(
            'Reason: ${r.s('reasonText')}${r.s('details').isEmpty ? '' : ' – ${r.s('details')}'}',
            style: const TextStyle(color: Tk.ink3, fontSize: 13, height: 1.4),
          ),
          if (r.s('adminNote').isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Tk.porcelain, borderRadius: BorderRadius.circular(Tk.r)),
              child: Text('BQuee team: ${r.s('adminNote')}', style: const TextStyle(color: Tk.ink2, height: 1.4)),
            ),
          ],
          if (status == 'pending') ...[
            const SizedBox(height: 14),
            Btn('Cancel request', icon: 'x', kind: BtnKind.soft, expand: true, onPressed: () => _cancel(r)),
          ],
        ],
      ),
    );
  }

  Widget _choice(String value, String icon, String title, String text) {
    final on = kind == value;
    final b = brandOf(context);
    return AppCard(
      onTap: () => setState(() => kind = value),
      borderColor: on ? b.c : null,
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIcon(icon, size: 22, color: on ? b.c : Tk.ink3, stroke: 2),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(fontWeight: FontWeight.w700, color: on ? b.ink : Tk.ink),
                ),
                const SizedBox(height: 3),
                Text(text, style: const TextStyle(color: Tk.ink3, fontSize: 13, height: 1.4)),
              ],
            ),
          ),
          AppIcon(on ? 'check' : 'chevr', size: 18, color: on ? b.c : Tk.ink3, stroke: 2.2),
        ],
      ),
    );
  }

  Widget _form(Map<String, String> reasonText) {
    final options = (_reasonsFor[widget.role] ?? _reasonsFor['customer']!)
        .where(reasonText.containsKey)
        .map((k) => MapEntry(k, reasonText[k]!))
        .toList();
    return Form(
      key: formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionTitle('What would you like?'),
          _choice('deactivate', 'power', 'Deactivate', 'Switch it off for now. It can be switched back on.'),
          const SizedBox(height: 10),
          _choice('delete', 'trash', 'Delete', 'Remove it for good.'),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: kind == 'delete' ? Tk.badBg : Tk.porcelain,
              borderRadius: BorderRadius.circular(Tk.r),
            ),
            child: Text(
              _effect(widget.role, kind),
              style: TextStyle(color: kind == 'delete' ? Tk.badFg : Tk.ink2, height: 1.45),
            ),
          ),
          const SizedBox(height: 18),
          SelectX<String>(
            'Reason',
            value: reason,
            options: [const MapEntry('', 'Choose a reason'), ...options],
            onChanged: (v) => setState(() => reason = v),
          ),
          FieldX(
            'More details',
            details,
            maxLines: 3,
            maxLength: 500,
            hint: reason == 'other' ? 'Tell us the reason' : 'Optional',
            caps: TextCapitalization.sentences,
            validate: (v) => reason == 'other' && v.trim().isEmpty ? 'Please tell us the reason' : null,
          ),
          FieldX(
            'Your password',
            password,
            obscure: true,
            required: true,
            icon: 'lock',
            helper: 'To confirm it’s really you.',
          ),
          const SizedBox(height: 6),
          Btn(
            kind == 'delete' ? 'Send delete request' : 'Send deactivate request',
            icon: kind == 'delete' ? 'trash' : 'power',
            kind: kind == 'delete' ? BtnKind.danger : BtnKind.primary,
            expand: true,
            busy: busy,
            onPressed: busy ? null : _send,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = data;
    final r = d == null || d['request'] is! Map ? null : asJson(d['request']);
    final reasons = d == null || d['reasons'] is! Map
        ? <String, String>{}
        : Map<String, dynamic>.from(d['reasons'] as Map).map((k, v) => MapEntry(k, '$v'));
    return Scaffold(
      appBar: AppBar(title: const Text('Delete or deactivate account')),
      body: SafeArea(
        child: d == null
            ? Center(
                child: loadError == null
                    ? const CircularProgressIndicator()
                    : Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              loadError!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Tk.ink2),
                            ),
                            const SizedBox(height: 12),
                            Btn('Try again', icon: 'refresh', kind: BtnKind.soft, onPressed: _load),
                          ],
                        ),
                      ),
              )
            : ListView(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 32),
                children: [
                  const Text(
                    'Your request goes to the BQuee team, who carry it out after a check. You can cancel it while it’s waiting.',
                    style: TextStyle(color: Tk.ink2, height: 1.45),
                  ),
                  const SizedBox(height: 16),
                  if (r != null) ...[_status(r), const SizedBox(height: 18)],
                  if (r == null || r.s('status') != 'pending') _form(reasons),
                ],
              ),
      ),
    );
  }
}
