// Super admin → create or edit a business (in steps), and the sign-in handover (links + password).

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/steps.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../../core/session.dart';
import '../../ui/booking_modes.dart';
import '../mfa.dart';

/// Create (business == null) or edit a business. Returns {id, password} after creating.
Future<Json?> editBusiness(BuildContext context, Json? business, List<Json> cats, bool showMoney) async {
  final isNew = business == null;
  final x = business ?? <String, dynamic>{};
  final name = TextEditingController(text: x.s('name'));
  final slug = TextEditingController(text: x.s('slug'));
  final branchName = TextEditingController(text: 'Main Branch');
  final ownerName = TextEditingController(text: x.s('ownerName'));
  final ownerMobile = TextEditingController(text: x.s('ownerMobile'));
  final ownerEmail = TextEditingController(text: x.s('ownerEmail'));
  final username = TextEditingController(text: x.s('ownerUsername'));
  final password = TextEditingController();
  final plan = TextEditingController(text: isNew ? 'Yearly' : x.s('plan'));
  final amount = TextEditingController(
    text: x['amount'] == null ? '' : x.d('amount').toString().replaceAll(RegExp(r'\.0$'), ''),
  );
  final currency = TextEditingController(text: x.s('currency', '₹'));
  final now = DateTime.now();
  var expires = isNew ? isoOf(DateTime(now.year + 1, now.month, now.day)) : x.s('expiresAt');
  var categoryId = x.s('categoryId');
  var serviceMode = x.s('serviceMode', 'multiple');
  var staffMode = x.s('staffMode', 'multiple');
  var active = isNew ? true : x.b('active', true);
  Json? created;
  final ok = await StepFormPage.open(
    context,
    title: isNew ? 'New business' : 'Edit ${x.s('name')}',
    submitLabel: isNew ? 'Create business' : 'Save changes',
    steps: const ['Business', 'Booking form', 'Owner', 'Plan'],
    free: !isNew,
    builder: (ctx, setState, step) => [
      if (step == 0) ...[
        FieldX('Business name', name, required: true, maxLength: 80, caps: TextCapitalization.words),
        FieldX(
          'Page link',
          slug,
          maxLength: 60,
          helper: '/s/${slug.text.isEmpty ? 'made-from-name' : slug.text}',
          onChanged: (_) => setState(() {}),
        ),
        const Text(
          'Business category',
          style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in cats) _catPick(c, categoryId == c.s('id'), () => setState(() => categoryId = c.s('id'))),
            _catPick(
              {'name': 'No category', 'icon': 'minus', 'color': '#64748b'},
              categoryId.isEmpty,
              () => setState(() => categoryId = ''),
            ),
          ],
        ),
        const Padding(
          padding: EdgeInsets.only(top: 6, bottom: 16),
          child: Text(
            'The owner sees default services for this category, plus the ones for all businesses.',
            style: TextStyle(color: Tk.ink3, fontSize: 12),
          ),
        ),
        if (isNew) FieldX('First branch name', branchName, maxLength: 80, caps: TextCapitalization.words),
      ],
      if (step == 1) ...[
        const Text(
          'Customer booking form',
          style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
        ),
        const SizedBox(height: 10),
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
      if (step == 2) ...[
        FieldGroup(
          'Owner',
          children: [
            FieldX('Name', ownerName, maxLength: 80, caps: TextCapitalization.words),
            FieldX('Mobile', ownerMobile, keyboard: TextInputType.phone, maxLength: 20),
            FieldX('Email', ownerEmail, keyboard: TextInputType.emailAddress),
            FieldX('Username', username, required: isNew),
            FieldX(
              isNew ? 'Password' : 'New password',
              password,
              obscure: true,
              required: isNew,
              helper: isNew ? 'At least 8 characters.' : 'Leave blank to keep the current one.',
              validate: (v) => v.isNotEmpty && v.length < 8 ? 'Use at least 8 characters' : null,
            ),
          ],
        ),
        if (!isNew && x.s('ownerUserId').isNotEmpty)
          MfaResetTile(userId: x.s('ownerUserId'), name: x.s('ownerName', x.s('name')), enabled: x.b('ownerMfa')),
      ],
      if (step == 3) ...[
        FieldGroup(
          'Plan',
          children: [
            FieldX('Plan name', plan, maxLength: 40),
            if (showMoney)
              Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: FieldX('Amount', amount, keyboard: const TextInputType.numberWithOptions(decimal: true)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: FieldX('Currency', currency, maxLength: 6)),
                ],
              ),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      expires.isEmpty ? 'No expiry date' : 'Valid till ${dayText(expires)}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (expires.isNotEmpty)
                    TextButton(onPressed: () => setState(() => expires = ''), child: const Text('No expiry')),
                  Btn(
                    'Pick date',
                    icon: 'calendar',
                    kind: BtnKind.soft,
                    small: true,
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: ctx,
                        initialDate: expires.isNotEmpty ? (DateTime.tryParse(expires) ?? now) : now,
                        firstDate: DateTime(now.year - 2),
                        lastDate: DateTime(now.year + 10),
                      );
                      if (picked != null) setState(() => expires = isoOf(picked));
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
        SwitchRow(
          'Business enabled',
          hint: 'When disabled, online booking and the business’s sign-ins stop.',
          value: active,
          onChanged: (v) => setState(() => active = v),
        ),
      ],
    ],
    onSubmit: () async {
      final body = <String, dynamic>{
        'name': name.text.trim(),
        'slug': slug.text.trim(),
        'ownerName': ownerName.text.trim(),
        'ownerMobile': ownerMobile.text.trim(),
        'ownerEmail': ownerEmail.text.trim(),
        'username': username.text.trim(),
        'plan': plan.text.trim(),
        'currency': currency.text.trim().isEmpty ? '₹' : currency.text.trim(),
        'expiresAt': expires,
        'active': active,
        'categoryId': categoryId,
        'channel': 'app',
        'serviceMode': serviceMode,
        'staffMode': staffMode,
      };
      if (showMoney) body['amount'] = double.tryParse(amount.text.trim()) ?? 0;
      if (password.text.isNotEmpty) body['password'] = password.text;
      if (isNew) {
        body['branchName'] = branchName.text.trim();
        final r = asJson(await session.api.post('/api/admin/salons', body));
        created = {'id': r.s('id'), 'password': password.text};
      } else {
        await session.api.put('/api/admin/salons/${x.s('id')}', body);
      }
    },
  );
  if (ok && context.mounted) toast(context, isNew ? 'Business created' : 'Business saved');
  return ok ? created : null;
}

Widget _catPick(Json c, bool on, VoidCallback onTap) {
  final col = parseHexColor(c.s('color'));
  return GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
      decoration: BoxDecoration(
        color: on ? mix(col, 0.10, Colors.white) : Colors.white,
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: on ? col : Tk.line, width: on ? 1.6 : 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(shape: BoxShape.circle, color: on ? col : mix(col, 0.14, Colors.white)),
            alignment: Alignment.center,
            child: AppIcon(c.s('icon', 'store'), size: 15, color: on ? Colors.white : col),
          ),
          const SizedBox(width: 8),
          Text(
            c.s('name'),
            style: TextStyle(fontWeight: on ? FontWeight.w700 : FontWeight.w500, color: Tk.ink, fontSize: 13.5),
          ),
        ],
      ),
    ),
  );
}

/// Sign-in page, customer page, username (and the new password right after creating).
Future<void> showLinks(BuildContext context, Json x, {String password = ''}) {
  final base = session.api.base;
  final rows = <MapEntry<String, String>>[
    MapEntry('Sign-in page (owner & staff)', '$base/s/${x.s('slug')}/login'),
    MapEntry('Customer page', '$base/s/${x.s('slug')}'),
    MapEntry('Username', x.s('ownerUsername')),
    if (password.isNotEmpty) MapEntry('Password', password),
  ].where((e) => e.value.isNotEmpty).toList();
  final message =
      '${x.s('name')} on BQuee\n\n${rows.map((e) => '${e.key}: ${e.value}').join('\n')}${password.isNotEmpty ? '\n\nPlease change the password after your first sign-in.' : ''}';
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              password.isNotEmpty ? '${x.s('name')} is ready' : 'Links for ${x.s('name')}',
              style: const TextStyle(fontFamily: Tk.serif, fontSize: 21, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 4),
            Text(
              password.isNotEmpty
                  ? 'Send these to the owner. The password is shown only now.'
                  : 'Share these with the owner.',
              style: const TextStyle(color: Tk.ink3),
            ),
            const SizedBox(height: 14),
            for (final e in rows)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
                decoration: BoxDecoration(color: Tk.porcelain, borderRadius: BorderRadius.circular(14)),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(e.key, style: const TextStyle(color: Tk.ink3, fontSize: 12)),
                          Text(
                            e.value,
                            style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Copy',
                      icon: const AppIcon('copy', size: 19, color: Tk.ink2),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: e.value));
                        toast(ctx, '${e.key} copied');
                      },
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: Btn(
                    'WhatsApp',
                    icon: 'chat',
                    onPressed: () => Native.openUrl('https://wa.me/?text=${Uri.encodeComponent(message)}'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Btn(
                    'Share',
                    icon: 'link',
                    kind: BtnKind.soft,
                    onPressed: () => Native.shareText(message, subject: '${x.s('name')} on BQuee'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
