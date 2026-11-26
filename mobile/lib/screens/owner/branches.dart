// Owner → Branches & QR: each branch, its token prefix and QR code (share a printable poster).

import 'dart:ui' as ui;

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/core/qr/qr_encode.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../../core/session.dart';
import '../common.dart';
import 'owner_home.dart';

class OwnerBranches extends StatelessWidget {
  const OwnerBranches({super.key});

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: loadOwner,
      builder: (context, d, reload) {
        final branches = d.l('branches');
        final salon = d.m('salon');
        return PageScroll(
          title: 'Branches & QR',
          subtitle: 'Each branch has its own booking page and QR code',
          onRefresh: reload,
          actions: [
            HeaderAction(
              'plus',
              tooltip: 'Add branch',
              label: 'Add',
              onPressed: () async {
                if (await editBranch(context, null)) reload();
              },
            ),
          ],
          children: [
            PagedColumn<Json>(
              all: branches,
              size: 5,
              gap: 14,
              itemBuilder: (br) {
                // The name link (/b/lotussalon) when the branch has one, else its id.
                final url = '${session.api.base}/b/${br.s('slug').isNotEmpty ? br.s('slug') : br.s('id')}';
                final staffCount = d.l('staff').where((x) => x.s('branchId') == br.s('id')).length;
                return AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: Tk.line),
                            ),
                            child: QrView(data: url, size: 104, margin: 1),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  br.s('name'),
                                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Tk.ink),
                                ),
                                const SizedBox(height: 4),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 6,
                                  children: [
                                    br.b('active', true) ? Pill.on('Booking open') : Pill.off('Booking closed'),
                                    if (br.s('prefix').isNotEmpty)
                                      Pill('${br.s('prefix')}-001', bg: Tk.porcelain, fg: Tk.ink2),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  [
                                    br.s('address').isEmpty ? 'No address yet' : br.s('address'),
                                    if (br.s('phone').isNotEmpty) br.s('phone'),
                                    plural(staffCount, 'staff member', 'staff members'),
                                  ].join(' · '),
                                  style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        url.replaceFirst(RegExp(r'^https?://'), ''),
                        style: TextStyle(color: brandOf(context).ink, fontWeight: FontWeight.w500, fontSize: 13),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          Btn(
                            'Share QR',
                            icon: 'qr',
                            small: true,
                            onPressed: () => shareBranchQr(context, salon, br, url),
                          ),
                          Btn(
                            'Share link',
                            icon: 'link',
                            kind: BtnKind.soft,
                            small: true,
                            onPressed: () =>
                                Native.shareText('Book your token at ${salon.s('name')} – ${br.s('name')}: $url'),
                          ),
                          Btn(
                            'Copy',
                            icon: 'copy',
                            kind: BtnKind.quiet,
                            small: true,
                            onPressed: () {
                              Clipboard.setData(ClipboardData(text: url));
                              toast(context, 'Link copied');
                            },
                          ),
                          Btn(
                            'Edit',
                            icon: 'edit',
                            kind: BtnKind.quiet,
                            small: true,
                            onPressed: () async {
                              if (await editBranch(context, br)) reload();
                            },
                          ),
                          if (branches.length > 1)
                            Btn(
                              'Delete',
                              icon: 'trash',
                              kind: BtnKind.danger,
                              small: true,
                              onPressed: () async {
                                final ok = await confirmDialog(
                                  context,
                                  title: 'Delete ${br.s('name')}?',
                                  message: 'Its QR code and booking page will stop working.',
                                  confirm: 'Delete',
                                );
                                if (!ok || !context.mounted) return;
                                final r = await runAction(
                                  context,
                                  () => session.api.delete('/api/owner/branches/${br.s('id')}'),
                                  done: 'Branch deleted',
                                );
                                if (r != null) reload();
                              },
                            ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        );
      },
    );
  }
}

Future<bool> editBranch(BuildContext context, Json? br) {
  final isNew = br == null;
  final b = br ?? <String, dynamic>{};
  final name = TextEditingController(text: b.s('name'));
  final prefix = TextEditingController(text: b.s('prefix'));
  final address = TextEditingController(text: b.s('address'));
  final phone = TextEditingController(text: b.s('phone'));
  var active = b.b('active', true);
  return FormPage.open(
    context,
    title: isNew ? 'Add branch' : 'Edit branch',
    submitLabel: isNew ? 'Add branch' : 'Save changes',
    builder: (ctx, setState) => [
      FieldX('Branch name', name, required: true, maxLength: 80, caps: TextCapitalization.words),
      FieldX(
        'Token letter',
        prefix,
        maxLength: 3,
        hint: 'e.g. A',
        helper: 'Token numbers look like A-001. Leave blank for #001.',
        caps: TextCapitalization.characters,
      ),
      FieldX('Address', address, maxLines: 2, caps: TextCapitalization.sentences),
      FieldX('Phone', phone, keyboard: TextInputType.phone, maxLength: 20),
      SwitchRow(
        'Booking open',
        hint: 'Turn off to stop online bookings at this branch.',
        value: active,
        onChanged: (v) => setState(() => active = v),
      ),
    ],
    onSubmit: () async {
      final body = {
        'name': name.text.trim(),
        'prefix': prefix.text.trim().toUpperCase(),
        'address': address.text.trim(),
        'phone': phone.text.trim(),
        'active': active,
      };
      if (isNew) {
        await session.api.post('/api/owner/branches', body);
      } else {
        await session.api.put('/api/owner/branches/${b.s('id')}', body);
      }
    },
  );
}

/// Draws a printable QR poster (PNG) and opens the share sheet.
Future<void> shareBranchQr(BuildContext context, Json salon, Json br, String url) async {
  try {
    final png = await _qrPoster(salon.s('name'), br.s('name'), url, parseHexColor(salon.s('color')));
    final ok = await Native.shareFile(
      'qr-${br.s('name').replaceAll(RegExp(r'[^A-Za-z0-9]+'), '-')}.png',
      'image/png',
      png,
    );
    if (!ok) await Native.shareText('Book your token at ${salon.s('name')}: $url');
  } catch (_) {
    if (context.mounted) toast(context, 'Could not create the QR image', error: true);
  }
}

Future<Uint8List> _qrPoster(String business, String branch, String url, Color color) async {
  const w = 1080.0, h = 1440.0;
  final rec = ui.PictureRecorder();
  final c = Canvas(rec, const Rect.fromLTWH(0, 0, w, h));
  final b = Brand(color);
  c.drawRect(const Rect.fromLTWH(0, 0, w, h), Paint()..color = Colors.white);
  c.drawRect(
    const Rect.fromLTWH(0, 0, w, 360),
    Paint()..shader = ui.Gradient.linear(Offset.zero, const Offset(w, 360), [b.deep, b.c, b.rose], [0, 0.6, 1]),
  );
  void text(
    String s,
    double y,
    double size,
    Color col, {
    FontWeight weight = FontWeight.w600,
    String family = Tk.sans,
  }) {
    final tp = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(fontFamily: family, fontSize: size, fontWeight: weight, color: col),
      ),
      textAlign: TextAlign.center,
      textDirection: TextDirection.ltr,
      maxLines: 2,
      ellipsis: '…',
    )..layout(maxWidth: w - 120);
    tp.paint(c, Offset((w - tp.width) / 2, y));
  }

  text(business, 110, 72, Colors.white, family: Tk.serif);
  text(branch, 230, 40, const Color(0xDDFFFFFF), weight: FontWeight.w500);
  final qr = encodeQr(url);
  const side = 680.0;
  const left = (w - side) / 2, top = 430.0;
  final px = side / (qr.size + 4);
  final dark = Paint()..color = const Color(0xFF15111C);
  for (var y = 0; y < qr.size; y++) {
    for (var x = 0; x < qr.size; x++) {
      if (qr.modules[y][x])
        c.drawRect(Rect.fromLTWH(left + (x + 2) * px, top + (y + 2) * px, px + 0.6, px + 0.6), dark);
    }
  }
  text('Scan to book your token', 1150, 54, Tk.ink, weight: FontWeight.w700);
  text('See your live waiting time – no app needed', 1232, 34, Tk.ink2, weight: FontWeight.w400);
  text(url.replaceFirst(RegExp(r'^https?://'), ''), 1320, 30, b.ink, weight: FontWeight.w500);
  final img = await rec.endRecording().toImage(w.toInt(), h.toInt());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}
