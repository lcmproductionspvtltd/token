// Super admin → Account requests: users asked (in the apps) to delete or deactivate their account.
// Approving carries the request out; rejecting needs a note the user sees in the app.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';

String _day(int ms) =>
    ms <= 0 ? '—' : dayText(DateTime.fromMillisecondsSinceEpoch(ms).toIso8601String().substring(0, 10));

const Map<String, String> _roleText = {
  'customer': 'Customer',
  'owner': 'Business owner',
  'staff': 'Staff',
  'platform_staff': 'BQuee team',
};

/// What approving does, so the admin knows before pressing the button.
String _approveEffect(Json r) {
  final del = r.s('kind') == 'delete';
  final name = r.s('name');
  switch (r.s('role')) {
    case 'owner':
      return del
          ? 'The whole business “${r.s('business')}” is removed for good: branches, services, staff logins, tokens, offers and reviews.'
          : 'The business “${r.s('business')}” is switched off: customers can’t book and nobody in it can sign in. You can switch it back on later.';
    case 'staff':
      return del
          ? '$name’s staff profile and login are removed for good.'
          : '$name’s login is switched off. You can switch it back on later.';
    case 'platform_staff':
      return del
          ? '$name’s BQuee team login is removed for good.'
          : '$name’s BQuee team login is switched off. You can switch it back on later.';
    default:
      return del
          ? '$name’s customer account and photo are removed for good. Businesses keep their token records.'
          : '$name can’t sign in to the customer app. You can switch it back on later.';
  }
}

class AdminAccountRequests extends StatefulWidget {
  const AdminAccountRequests({super.key});

  @override
  State<AdminAccountRequests> createState() => _AdminAccountRequestsState();
}

class _AdminAccountRequestsState extends State<AdminAccountRequests> {
  String status = 'pending';

  Future<void> _decide(Json r, String action, Future<void> Function() reload) async {
    final approve = action == 'approve';
    final del = r.s('kind') == 'delete';
    final note = TextEditingController();
    final ok = await FormPage.open(
      context,
      title: approve ? (del ? 'Delete this account?' : 'Deactivate this account?') : 'Reject this request?',
      submitLabel: approve ? (del ? 'Approve and delete' : 'Approve and deactivate') : 'Reject request',
      builder: (ctx, setState) => [
        Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: approve && del ? Tk.badBg : Tk.porcelain,
            borderRadius: BorderRadius.circular(Tk.r),
          ),
          child: Text(
            approve ? _approveEffect(r) : 'Nothing changes on the account. The user sees your note in the app.',
            style: TextStyle(color: approve && del ? Tk.badFg : Tk.ink2, height: 1.45),
          ),
        ),
        FieldX(
          approve ? 'Note to the user (optional)' : 'Why is it rejected?',
          note,
          maxLines: 3,
          maxLength: 400,
          required: !approve,
          caps: TextCapitalization.sentences,
        ),
      ],
      onSubmit: () => session.api.post('/api/admin/account-requests/${r.s('id')}/decide', {
        'action': action,
        'note': note.text.trim(),
      }),
    );
    if (ok && mounted) {
      toast(context, approve ? 'Request carried out' : 'Request rejected');
      reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      key: ValueKey(status),
      load: () => session.api.getJson('/api/admin/account-requests${status == 'all' ? '' : '?status=$status'}'),
      builder: (context, d, reload) {
        final b = brandOf(context);
        final list = d.l('requests');
        final counts = d.m('counts');
        return PageScroll(
          title: 'Account requests',
          subtitle: 'People who asked to delete or deactivate their account',
          onRefresh: reload,
          children: [
            Figures([
              FigureItem('Waiting', '${counts.i('pending')}', 'clock', Tk.amber),
              FigureItem('All requests', '${counts.i('total')}', 'shield', b.c),
            ]),
            const SizedBox(height: 18),
            FilterChips<String>(
              options: const {
                'pending': 'Waiting',
                'done': 'Done',
                'rejected': 'Rejected',
                'cancelled': 'Cancelled',
                'all': 'All',
              },
              value: status,
              onChanged: (v) => setState(() => status = v),
            ),
            const SizedBox(height: 16),
            SectionTitle(plural(list.length, 'request')),
            if (list.isEmpty)
              AppCard(
                child: EmptyState(
                  icon: 'shield',
                  title: status == 'pending' ? 'No waiting requests' : 'No requests here',
                  text: 'Users ask to delete or deactivate their account from the BQuee apps. Their requests show up here.',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$status|${list.length}'),
                all: list,
                gap: 14,
                itemBuilder: (r) {
                  final del = r.s('kind') == 'delete';
                  final st = r.s('status');
                  final (String label, TagTone tone) = switch (st) {
                    'pending' => ('Waiting', TagTone.amber),
                    'done' => ('Done', TagTone.green),
                    'rejected' => ('Rejected', TagTone.red),
                    _ => ('Cancelled', TagTone.neutral),
                  };
                  final canReactivate = st == 'done' && !del && r.b('accountExists') && !r.b('accountActive', true);
                  return ListCard(
                    leading: Avatar(r.s('name', '?'), size: 52),
                    title: r.s('name', 'Unknown'),
                    subtitle: [_roleText[r.s('role')] ?? '', r.s('business')].where((x) => x.isNotEmpty).join(' · '),
                    subtitleIcon: 'user',
                    trailing: Tag(label, dot: true, tone: tone),
                    detailIcon: 'chat',
                    detail: '${r.s('reasonText')}${r.s('details').isEmpty ? '' : ' – ${r.s('details')}'}',
                    tags: [
                      Tag(
                        del ? 'Delete' : 'Deactivate',
                        icon: del ? 'trash' : 'power',
                        tone: del ? TagTone.red : TagTone.amber,
                      ),
                      Tag('Sent ${_day(r.i('createdAt'))}', icon: 'calendar'),
                      if (r.s('mobile').isNotEmpty) Tag(r.s('mobile'), icon: 'phone'),
                      if (st == 'done' && !r.b('accountExists')) const Tag('Account removed'),
                    ],
                    body: st == 'pending' || canReactivate || r.s('adminNote').isNotEmpty
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (r.s('adminNote').isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: Text(
                                    'Note: ${r.s('adminNote')}${r.s('handledBy').isEmpty ? '' : ' (${r.s('handledBy')})'}',
                                    style: const TextStyle(color: Tk.ink3, fontSize: 13, height: 1.4),
                                  ),
                                ),
                              if (st == 'pending')
                                Row(
                                  children: [
                                    Expanded(
                                      child: Btn(
                                        'Approve',
                                        icon: del ? 'trash' : 'power',
                                        kind: del ? BtnKind.danger : BtnKind.primary,
                                        small: true,
                                        onPressed: () => _decide(r, 'approve', reload),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Btn(
                                        'Reject',
                                        icon: 'x',
                                        kind: BtnKind.soft,
                                        small: true,
                                        onPressed: () => _decide(r, 'reject', reload),
                                      ),
                                    ),
                                  ],
                                ),
                              if (canReactivate)
                                Btn(
                                  'Switch back on',
                                  icon: 'power',
                                  kind: BtnKind.soft,
                                  small: true,
                                  onPressed: () async {
                                    final res = await runAction(
                                      context,
                                      () => session.api.post('/api/admin/account-requests/${r.s('id')}/reactivate'),
                                      done: 'Switched back on',
                                    );
                                    if (res != null) reload();
                                  },
                                ),
                            ],
                          )
                        : null,
                  );
                },
              ),
          ],
        );
      },
    );
  }
}
