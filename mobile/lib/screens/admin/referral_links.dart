// Who onboarded a business (tag on its card), and the referral links of the super admin and team.

import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/core/qr/qr_encode.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../../core/session.dart';
import '../common.dart';

/* ---------------- who onboarded a business, and referral links ---------------- */

/// "By Priya", "Referred by Priya · app" or "Direct sign-up".
Tag onboardTag(Json o) {
  final app = o.s('channel') == 'app' ? ' · app' : '';
  return switch (o.s('source')) {
    'signup' => Tag('Direct sign-up$app', icon: 'globe', tone: TagTone.blue),
    'referral' => Tag(
      'Referred by ${o.s('byName', 'team')}${o.s('label').isEmpty ? '' : ' · ${o.s('label')}'}$app',
      icon: 'share',
      tone: TagTone.amber,
    ),
    _ => Tag('By ${o.s('byName', 'Admin')}$app', icon: 'user', tone: TagTone.brand),
  };
}

Future<void> openReferral(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _ReferralPage()));

/// Super admin and team: several labelled referral links ("Facebook ads", "Mall stall"…).
class _ReferralPage extends StatefulWidget {
  const _ReferralPage();

  @override
  State<_ReferralPage> createState() => _ReferralPageState();
}

class _ReferralPageState extends State<_ReferralPage> {
  Json? d;
  Object? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await session.api.getJson('/api/admin/referral-links');
      if (mounted) {
        setState(() {
          d = r;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> _newLink() async {
    final label = TextEditingController();
    final ok = await FormPage.open(
      context,
      title: 'New referral link',
      submitLabel: 'Make link',
      builder: (ctx, setState) => [
        const Padding(
          padding: EdgeInsets.only(bottom: 14),
          child: Text(
            'Give it a label so you know where businesses came from – an ad, a WhatsApp group, a visit.',
            style: TextStyle(color: Tk.ink2, height: 1.4),
          ),
        ),
        FieldX(
          'Label',
          label,
          required: true,
          maxLength: 60,
          hint: 'e.g. Facebook ads – November',
          icon: 'tag',
          caps: TextCapitalization.sentences,
        ),
      ],
      onSubmit: () async {
        await session.api.post('/api/admin/referral-links', {'label': label.text.trim()});
      },
    );
    if (ok && mounted) {
      toast(context, 'Link ready');
      _load();
    }
  }

  Future<void> _rename(Json l) async {
    final label = TextEditingController(text: l.s('label'));
    final ok = await FormPage.open(
      context,
      title: 'Rename link',
      submitLabel: 'Save',
      builder: (ctx, setState) => [FieldX('Label', label, required: true, maxLength: 60, icon: 'tag')],
      onSubmit: () async {
        await session.api.put('/api/admin/referral-links/${l.s('id')}', {'label': label.text.trim()});
      },
    );
    if (ok && mounted) _load();
  }

  Future<void> _toggle(Json l) async {
    final r = await runAction(
      context,
      () => session.api.put('/api/admin/referral-links/${l.s('id')}', {'active': !l.b('active')}),
      done: l.b('active') ? 'Link switched off' : 'Link switched on',
    );
    if (r != null) _load();
  }

  void _showQr(String link, String label) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: const TextStyle(fontFamily: Tk.serif, fontSize: 20, fontWeight: FontWeight.w600, color: Tk.ink),
              ),
              const SizedBox(height: 14),
              QrView(data: link, size: 220),
              const SizedBox(height: 10),
              Text(
                link,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _linkCard(Json l, {bool showOwner = false}) {
    final b = brandOf(context);
    final link = '$kDefaultServer${l.s('path')}';
    final code = l.s('code').toUpperCase();
    final on = l.b('active');
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: ListCard(
        dim: !on,
        leading: IconChip('share', color: Tk.rose, size: 44),
        title: l.s('label'),
        subtitle: '${showOwner ? '${l.s('ownerName')} · ' : ''}code $code',
        trailing: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${l.i('referred')}',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: b.ink),
            ),
            Text(
              l.i('referred') == 1 ? 'business' : 'businesses',
              style: const TextStyle(color: Tk.ink3, fontSize: 11.5),
            ),
          ],
        ),
        detailIcon: 'link',
        detail: link,
        tags: [if (!on) const Tag('Off', dot: true, tone: TagTone.red)],
        actions: [
          CardAction(
            'share',
            tooltip: 'Share',
            onPressed: on
                ? () => Native.shareText(
                    'Run your queue with BQuee – QR tokens and live waiting times. Sign up here: $link (or use code $code in the BQuee app)',
                    subject: 'BQuee sign-up',
                  )
                : null,
          ),
          CardAction(
            'copy',
            tooltip: 'Copy link',
            onPressed: on
                ? () {
                    Clipboard.setData(ClipboardData(text: link));
                    toast(context, 'Link copied');
                  }
                : null,
          ),
          CardAction('qr', tooltip: 'QR code', onPressed: () => _showQr(link, l.s('label'))),
          CardAction('edit', tooltip: 'Rename', onPressed: () => _rename(l)),
          CardAction('power', tooltip: on ? 'Switch off' : 'Switch on', onPressed: () => _toggle(l)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final r = d;
    return Scaffold(
      backgroundColor: Tk.canvas,
      appBar: AppBar(
        backgroundColor: Colors.white,
        leading: IconButton(
          icon: const AppIcon('back', size: 22),
          tooltip: 'Back',
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('Referral links'),
        actions: [IconButton(icon: const AppIcon('plus', size: 22), tooltip: 'New link', onPressed: _newLink)],
      ),
      body: r == null
          ? (error == null ? const Center(child: CircularProgressIndicator()) : ErrorView(error!, onRetry: _load))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                children: [
                  const Text(
                    'Make a link for each place you share it. Businesses that sign up through a link – or type its code in the BQuee app – show as onboarded by you, with the link’s label.',
                    style: TextStyle(color: Tk.ink2, height: 1.45),
                  ),
                  const SizedBox(height: 14),
                  Btn('New link', icon: 'plus', expand: true, onPressed: _newLink),
                  const SizedBox(height: 18),
                  const SectionTitle('My links'),
                  for (final l in r.l('links')) _linkCard(l),
                  if (r.l('others').isNotEmpty) ...[
                    const SizedBox(height: 6),
                    const SectionTitle('Team links'),
                    for (final l in r.l('others')) _linkCard(l, showOwner: true),
                  ],
                  if (r.l('people').isNotEmpty) ...[
                    const SizedBox(height: 6),
                    const SectionTitle('Everyone’s onboarding'),
                    for (final p in r.l('people'))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: ListCard(
                          leading: Avatar(p.s('name'), size: 44),
                          title: p.s('name'),
                          subtitle: p.s('role') == 'superadmin' ? 'Super admin' : 'BQuee team',
                          tags: [
                            Tag('${p.i('created')} created', icon: 'user', tone: TagTone.brand),
                            Tag('${p.i('referred')} referred', icon: 'share', tone: TagTone.amber),
                          ],
                        ),
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}
