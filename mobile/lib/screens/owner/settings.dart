// Owner business profile: look (colour, logo, cover), details, sign-in link, contact, socials.

import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../../core/session.dart';
import '../../ui/token_flow.dart';
import '../common.dart';
import 'owner_home.dart';

const List<String> kBrandPresets = ['#7b2c9e', '#b4235a', '#0f6e66', '#1f4fb4', '#b25e0b', '#2b2733'];

class OwnerSettings extends StatelessWidget {
  const OwnerSettings({super.key});

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: loadOwner,
      builder: (context, d, reload) => _SettingsForm(salon: d.m('salon'), reload: reload),
    );
  }
}

class _SettingsForm extends StatefulWidget {
  final Json salon;
  final Future<void> Function() reload;
  const _SettingsForm({required this.salon, required this.reload});

  @override
  State<_SettingsForm> createState() => _SettingsFormState();
}

class _SettingsFormState extends State<_SettingsForm> {
  final _form = GlobalKey<FormState>();
  late final Map<String, TextEditingController> c;
  late String color;
  late String logo;
  late String cover;
  late String tokenFlow;
  bool busy = false;

  static const fields = [
    'name', 'slug', 'tagline', 'about', 'hours', 'phone', 'whatsapp', 'instagram', 'email', //
    'facebook', 'youtube', 'x', 'website', 'mapUrl', 'address', 'currency',
  ];

  @override
  void initState() {
    super.initState();
    final s = widget.salon;
    c = {for (final f in fields) f: TextEditingController(text: s.s(f))};
    if (c['currency']!.text.isEmpty) c['currency']!.text = '₹';
    color = s.s('color', '#7b2c9e').toLowerCase();
    logo = s.s('logo');
    cover = s.s('cover');
    tokenFlow = s.s('tokenFlow') == 'whole' ? 'whole' : 'perService';
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => busy = true);
    final body = <String, dynamic>{
      for (final f in fields) f: c[f]!.text.trim(),
      'color': color,
      'logo': logo,
      'cover': cover,
      'tokenFlow': tokenFlow,
    };
    final r = await runAction(context, () => session.api.put('/api/owner/salon', body), done: 'Business profile saved');
    if (mounted) setState(() => busy = false);
    if (r != null) {
      session.setBusiness(c['name']!.text.trim(), logo, parseHexColor(color));
      await widget.reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.salon;
    final signIn = '${session.api.base}/s/${s.s('slug')}/login';
    final page = '${session.api.base}/s/${s.s('slug')}';
    Widget f(
      String key,
      String label, {
      String? hint,
      String? helper,
      TextInputType? kb,
      int lines = 1,
      int? max,
      bool req = false,
      String? icon,
    }) => FieldX(
      label,
      c[key]!,
      hint: hint,
      helper: helper,
      keyboard: kb,
      maxLines: lines,
      maxLength: max,
      required: req,
      icon: icon,
    );

    return Form(
      key: _form,
      child: PageScroll(
        title: 'Business profile',
        subtitle: 'What customers see on your pages and tokens',
        onRefresh: widget.reload,
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle(
                  'Look and feel',
                  sub: 'Your colour, logo and photo appear on your landing page, booking pages and tokens.',
                ),
                const Text(
                  'Brand colour',
                  style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                ),
                const SizedBox(height: 10),
                Swatches(
                  colors: kBrandPresets.map((h) => parseHexColor(h)).toList(),
                  value: parseHexColor(color),
                  onChanged: (col) => setState(() => color = kBrandPresets.firstWhere((h) => parseHexColor(h) == col)),
                ),
                const SizedBox(height: 10),
                _HexField(value: color, onChanged: (v) => setState(() => color = v)),
                const SizedBox(height: 16),
                ImageField(
                  'Logo',
                  value: logo,
                  maxSize: 600,
                  hint: 'Square works best.',
                  onChanged: (v) => setState(() => logo = v),
                ),
                ImageField(
                  'Cover photo',
                  value: cover,
                  wide: true,
                  maxSize: 1600,
                  hint: 'A wide photo of your business. Shown behind the top of your page.',
                  onChanged: (v) => setState(() => cover = v),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle('Business details'),
                f('name', 'Business name', req: true, max: 80),
                f('tagline', 'Tagline', hint: 'e.g. Fast, friendly service', max: 80),
                f('slug', 'Page link', helper: page, max: 60),
                f('about', 'About your business', lines: 4, max: 400),
                f('hours', 'Opening hours', hint: 'e.g. Mon–Sat · 9 AM – 8 PM', max: 80),
                f('address', 'Address', lines: 2, max: 200),
                f(
                  'mapUrl',
                  'Google Maps link',
                  helper: 'Optional. In Google Maps open your business, tap Share, copy the link and paste it here.',
                  kb: TextInputType.url,
                ),
                f('currency', 'Currency symbol', max: 6),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle(
                  'Starting and finishing tokens',
                  sub: 'How you and your staff start and finish services – on Tokens, My queue and when scanning.',
                ),
                TokenFlowChoice(value: tokenFlow, onChanged: (v) => setState(() => tokenFlow = v)),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle(
                  'Sign-in page for you and your staff',
                  sub: 'Your own sign-in page with your logo, name and colour.',
                ),
                Text(
                  signIn,
                  style: TextStyle(color: brandOf(context).ink, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Btn(
                      'Copy link',
                      icon: 'copy',
                      kind: BtnKind.soft,
                      small: true,
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: signIn));
                        toast(context, 'Sign-in link copied');
                      },
                    ),
                    Btn(
                      'Share',
                      icon: 'link',
                      kind: BtnKind.quiet,
                      small: true,
                      onPressed: () => Native.shareText('Sign in to ${s.s('name')} on BQuee: $signIn'),
                    ),
                    Btn(
                      'Open my page',
                      icon: 'globe',
                      kind: BtnKind.quiet,
                      small: true,
                      onPressed: () => openLink(context, page),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle(
                  'Contact',
                  sub: 'Shown in “Come visit” and the footer of your page. Leave blank to hide.',
                ),
                f('phone', 'Phone', kb: TextInputType.phone, max: 20, icon: 'phone'),
                f(
                  'whatsapp',
                  'WhatsApp number',
                  kb: TextInputType.phone,
                  helper: 'With country code, e.g. 919876543210',
                  max: 20,
                  icon: 'chat',
                ),
                f('email', 'Email', kb: TextInputType.emailAddress, icon: 'mail'),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle('Social media and website'),
                f('instagram', 'Instagram', hint: '@yourhandle', icon: 'insta'),
                f('facebook', 'Facebook', hint: 'Page name or link', icon: 'facebook'),
                f('youtube', 'YouTube', hint: 'Channel link', icon: 'youtube'),
                f('x', 'X (Twitter)', hint: '@handle', icon: 'xlogo'),
                f('website', 'Website', hint: 'https://…', kb: TextInputType.url, icon: 'globe'),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (s.s('plan').isNotEmpty || s.s('expiresAt').isNotEmpty)
            AppCard(
              child: Row(
                children: [
                  const AppIcon('calendar', size: 22, color: Tk.ink2),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      '${s.s('plan', 'Plan')}${s.s('expiresAt').isNotEmpty ? ' · valid till ${s.s('expiresAt')}' : ''}\nContact your BQuee provider to renew or upgrade.',
                      style: const TextStyle(color: Tk.ink2, height: 1.45),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 18),
          Btn('Save business profile', icon: 'check', expand: true, busy: busy, onPressed: _save),
        ],
      ),
    );
  }
}

class _HexField extends StatefulWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const _HexField({required this.value, required this.onChanged});

  @override
  State<_HexField> createState() => _HexFieldState();
}

class _HexFieldState extends State<_HexField> {
  late final TextEditingController ctrl = TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(covariant _HexField old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value && ctrl.text.toLowerCase() != widget.value) ctrl.text = widget.value;
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: parseHexColor(widget.value), borderRadius: BorderRadius.circular(12)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: TextField(
            controller: ctrl,
            decoration: const InputDecoration(labelText: 'Any colour (hex)', hintText: '#7b2c9e'),
            onChanged: (v) {
              final t = v.trim().toLowerCase();
              final h = t.startsWith('#') ? t : '#$t';
              if (RegExp(r'^#[0-9a-f]{6}$').hasMatch(h)) widget.onChanged(h);
            },
          ),
        ),
      ],
    );
  }
}
