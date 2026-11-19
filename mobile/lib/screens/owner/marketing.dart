// Owner marketing: offers (voucher cards with optional booking discount) and reviews.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../common.dart';
import 'owner_home.dart';

const List<List<Color>> kOfferThemes = [
  [Color(0xFF5B1A73), Color(0xFFA3289F)],
  [Color(0xFF9D174D), Color(0xFFE0603A)],
  [Color(0xFF0F5F58), Color(0xFF1F9D63)],
  [Color(0xFF1E3A8A), Color(0xFF6B3FD4)],
  [Color(0xFF7A3A0C), Color(0xFFD48612)],
  [Color(0xFF1D1924), Color(0xFF5E2A7E)],
];

/// The voucher card customers see on the landing page.
class OfferVoucher extends StatelessWidget {
  final Json offer;
  final String currency;
  const OfferVoucher(this.offer, {super.key, this.currency = '₹'});

  @override
  Widget build(BuildContext context) {
    final ti = offer.i('theme');
    final t = kOfferThemes[(ti < 0 || ti >= kOfferThemes.length) ? 0 : ti];
    final saving = offerLabel(offer, currency);
    final headline = offer.s('badge').isNotEmpty ? offer.s('badge') : (saving.isNotEmpty ? saving : 'Offer');
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: mix(t[0], 0.14, Tk.line)),
        boxShadow: [BoxShadow(color: fade(t[0], 0.25), blurRadius: 30, offset: const Offset(0, 16), spreadRadius: -18)],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 118,
            padding: const EdgeInsets.fromLTRB(18, 16, 16, 16),
            decoration: BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: t),
            ),
            child: Stack(
              children: [
                Positioned(
                  right: -46,
                  top: -60,
                  child: Container(
                    width: 170,
                    height: 170,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: fade(Colors.white, 0.09), width: 22),
                    ),
                  ),
                ),
                Align(
                  alignment: Alignment.topRight,
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(color: fade(Colors.white, 0.18), borderRadius: BorderRadius.circular(12)),
                    alignment: Alignment.center,
                    child: const AppIcon('gift', size: 18, color: Colors.white, stroke: 2),
                  ),
                ),
                Align(
                  alignment: Alignment.bottomLeft,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        headline,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                          height: 1,
                        ),
                      ),
                      if (saving.isNotEmpty && offer.s('badge').isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(top: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99)),
                          child: Text(
                            '$saving when you book',
                            style: TextStyle(color: t[0], fontSize: 11.5, fontWeight: FontWeight.w700),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  offer.s('title'),
                  style: const TextStyle(
                    fontFamily: Tk.serif,
                    fontSize: 19,
                    fontWeight: FontWeight.w600,
                    color: Tk.ink,
                  ),
                ),
                if (offer.s('description').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      offer.s('description'),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Tk.ink2, fontSize: 13.5),
                    ),
                  ),
                const SizedBox(height: 8),
                Pill(
                  offer.s('validTill').isNotEmpty ? 'Valid till ${dayText(offer.s('validTill'))}' : 'No end date',
                  bg: mix(t[0], 0.08, Colors.white),
                  fg: mix(t[0], 0.75, Tk.ink),
                  icon: 'calendar',
                ),
              ],
            ),
          ),
          // perforation
          Row(
            children: [
              Container(
                width: 12,
                height: 24,
                decoration: const BoxDecoration(
                  color: Tk.canvas,
                  borderRadius: BorderRadius.horizontal(right: Radius.circular(12)),
                ),
              ),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, c) {
                    final n = (c.maxWidth / 14).floor();
                    return Row(
                      children: [
                        for (var i = 0; i < n; i++)
                          Container(
                            width: 8,
                            height: 2,
                            margin: const EdgeInsets.only(right: 6),
                            color: mix(t[0], 0.3, Colors.white),
                          ),
                      ],
                    );
                  },
                ),
              ),
              Container(
                width: 12,
                height: 24,
                decoration: const BoxDecoration(
                  color: Tk.canvas,
                  borderRadius: BorderRadius.horizontal(left: Radius.circular(12)),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: mix(t[0], 0.05, Colors.white),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: mix(t[0], 0.35, Colors.white), width: 1.3),
              ),
              child: Row(
                children: [
                  Text(
                    offer.s('code').isNotEmpty ? 'Code' : 'No code needed',
                    style: const TextStyle(color: Tk.ink3, fontSize: 12),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      offer.s('code').isNotEmpty
                          ? offer.s('code')
                          : (saving.isNotEmpty ? 'Applied when you book' : 'Mention it at the desk'),
                      style: TextStyle(
                        color: t[0],
                        fontWeight: FontWeight.w800,
                        fontSize: offer.s('code').isNotEmpty ? 17 : 13.5,
                        letterSpacing: offer.s('code').isNotEmpty ? 1.2 : 0,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class OwnerOffers extends StatefulWidget {
  const OwnerOffers({super.key});

  @override
  State<OwnerOffers> createState() => _OwnerOffersState();
}

class _OwnerOffersState extends State<OwnerOffers> {
  String q = '';
  String show = 'all';

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: loadOwner,
      builder: (context, d, reload) {
        final all = d.l('offers');
        final cur = d.m('salon').s('currency', '₹');
        String state(Json o) => o.b('expired') ? 'expired' : (o.b('active', true) ? 'showing' : 'hidden');
        final offers = all
            .where(
              (o) =>
                  (show == 'all' || state(o) == show) &&
                  textMatches(q, [o.s('title'), o.s('code'), o.s('badge'), o.s('description')]),
            )
            .toList();
        return PageScroll(
          title: 'Offers',
          subtitle: 'Shown on your landing page; customers can book with them',
          onRefresh: reload,
          actions: [
            HeaderAction(
              'plus',
              tooltip: 'Add offer',
              label: 'Add',
              onPressed: () async {
                if (await editOffer(context, null, cur)) reload();
              },
            ),
          ],
          children: [
            if (all.isNotEmpty)
              ListFilters(
                hint: 'Search offers or codes',
                onSearch: (v) => setState(() => q = v),
                chips: [
                  FilterChips<String>(
                    options: const {'all': 'All', 'showing': 'Showing', 'hidden': 'Hidden', 'expired': 'Expired'},
                    value: show,
                    onChanged: (v) => setState(() => show = v),
                  ),
                ],
              ),
            if (all.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'gift',
                  title: 'No offers yet',
                  text: 'A discount or package with an optional promo code. Customers tap Book on it and the offer is saved on their token.',
                ),
              )
            else if (offers.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'search',
                  title: 'No offers match',
                  text: 'Try another word or clear the filter.',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$show'),
                all: offers,
                size: 6,
                gap: 18,
                itemBuilder: (o) => Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Opacity(
                      opacity: state(o) == 'showing' ? 1 : 0.55,
                      child: OfferVoucher(o, currency: cur),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        switch (state(o)) {
                          'expired' => const Tag('Expired', dot: true, tone: TagTone.red),
                          'showing' => const Tag('Showing', dot: true, tone: TagTone.green),
                          _ => const Tag('Hidden', dot: true),
                        },
                        const Spacer(),
                        CardAction(
                          'edit',
                          tooltip: 'Edit',
                          onPressed: () async {
                            if (await editOffer(context, o, cur)) reload();
                          },
                        ),
                        const SizedBox(width: 8),
                        CardAction(
                          'trash',
                          tooltip: 'Delete',
                          danger: true,
                          onPressed: () async {
                            final ok = await confirmDialog(
                              context,
                              title: 'Delete ${o.s('title')}?',
                              message: 'It disappears from your page. Tokens booked with it keep it.',
                              confirm: 'Delete',
                            );
                            if (!ok || !context.mounted) return;
                            final r = await runAction(
                              context,
                              () => session.api.delete('/api/owner/offers/${o.s('id')}'),
                              done: 'Offer deleted',
                            );
                            if (r != null) reload();
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

Future<bool> editOffer(BuildContext context, Json? offer, String cur) {
  final isNew = offer == null;
  final o = offer ?? <String, dynamic>{};
  final title = TextEditingController(text: o.s('title'));
  final badge = TextEditingController(text: o.s('badge'));
  final desc = TextEditingController(text: o.s('description'));
  final code = TextEditingController(text: o.s('code'));
  final value = TextEditingController(
    text: o.d('discountValue') > 0 ? o.d('discountValue').toString().replaceAll(RegExp(r'\.0$'), '') : '',
  );
  var validTill = o.s('validTill');
  var theme = o.i('theme');
  var image = o.s('image');
  var active = o.b('active', true);
  var dtype = o.s('discountType', 'none');
  return FormPage.open(
    context,
    title: isNew ? 'New offer' : 'Edit offer',
    submitLabel: isNew ? 'Add offer' : 'Save changes',
    builder: (ctx, setState) => [
      OfferVoucher({
        'title': title.text.isEmpty ? 'Your offer title' : title.text,
        'badge': badge.text,
        'description': desc.text,
        'code': code.text.toUpperCase(),
        'validTill': validTill,
        'theme': theme,
        'discountType': dtype,
        'discountValue': double.tryParse(value.text) ?? 0,
      }, currency: cur),
      const SizedBox(height: 18),
      FieldX(
        'Offer title',
        title,
        required: true,
        maxLength: 80,
        hint: 'e.g. Weekday special',
        onChanged: (_) => setState(() {}),
      ),
      FieldX(
        'Headline',
        badge,
        maxLength: 20,
        helper: 'Short and big, e.g. 20% OFF',
        onChanged: (_) => setState(() {}),
      ),
      FieldX(
        'Details',
        desc,
        maxLength: 240,
        maxLines: 3,
        hint: 'What’s included and when it applies',
        onChanged: (_) => setState(() {}),
      ),
      FieldX(
        'Promo code',
        code,
        maxLength: 20,
        helper: 'Optional',
        caps: TextCapitalization.characters,
        onChanged: (_) => setState(() {}),
      ),
      Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(
          children: [
            Expanded(
              child: Text(
                validTill.isEmpty ? 'No end date' : 'Valid till ${dayText(validTill)}',
                style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
              ),
            ),
            if (validTill.isNotEmpty)
              TextButton(onPressed: () => setState(() => validTill = ''), child: const Text('Clear')),
            Btn(
              'Pick date',
              icon: 'calendar',
              kind: BtnKind.soft,
              small: true,
              onPressed: () async {
                final now = DateTime.now();
                final picked = await showDatePicker(
                  context: ctx,
                  initialDate: validTill.isNotEmpty ? (DateTime.tryParse(validTill) ?? now) : now,
                  firstDate: DateTime(now.year - 1),
                  lastDate: DateTime(now.year + 5),
                );
                if (picked != null) setState(() => validTill = isoOf(picked));
              },
            ),
          ],
        ),
      ),
      const Text(
        'Colour',
        style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
      ),
      const SizedBox(height: 8),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (var i = 0; i < kOfferThemes.length; i++)
            GestureDetector(
              onTap: () => setState(() => theme = i),
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(colors: kOfferThemes[i]),
                  border: Border.all(color: theme == i ? Tk.ink : Colors.white, width: 2.5),
                ),
                child: theme == i
                    ? const Center(child: AppIcon('check', size: 16, color: Colors.white, stroke: 2.6))
                    : null,
              ),
            ),
        ],
      ),
      const SizedBox(height: 16),
      ImageField(
        'Background photo',
        value: image,
        wide: true,
        maxSize: 900,
        hint: 'Optional',
        onChanged: (v) => setState(() => image = v),
      ),
      FieldGroup(
        'When a customer books with this offer',
        hint: 'Customers tap Book on the offer card; the offer is saved on their token for your staff to see.',
        children: [
          Segmented<String>(
            options: const [
              MapEntry('none', 'No discount'),
              MapEntry('percent', '% off'),
              MapEntry('flat', 'Amount off'),
            ],
            value: dtype,
            onChanged: (v) => setState(() => dtype = v),
          ),
          const SizedBox(height: 12),
          if (dtype != 'none')
            FieldX(
              dtype == 'percent' ? 'Percent off' : 'Amount off ($cur)',
              value,
              required: true,
              keyboard: const TextInputType.numberWithOptions(decimal: true),
              helper: dtype == 'percent'
                  ? 'e.g. 20 for 20% off the token total'
                  : 'Taken off the token total (never below zero)',
              validate: (v) {
                final n = double.tryParse(v) ?? 0;
                if (n <= 0) return 'Enter an amount above zero';
                if (dtype == 'percent' && n > 100) return 'Use 100 or less';
                return null;
              },
              onChanged: (_) => setState(() {}),
            ),
        ],
      ),
      SwitchRow('Show on my page', value: active, onChanged: (v) => setState(() => active = v)),
    ],
    onSubmit: () async {
      final body = {
        'title': title.text.trim(),
        'badge': badge.text.trim(),
        'description': desc.text.trim(),
        'code': code.text.trim(),
        'validTill': validTill,
        'theme': theme,
        'image': image,
        'active': active,
        'discountType': dtype,
        'discountValue': dtype == 'none' ? 0 : (double.tryParse(value.text.trim()) ?? 0),
      };
      if (isNew) {
        await session.api.post('/api/owner/offers', body);
      } else {
        await session.api.put('/api/owner/offers/${o.s('id')}', body);
      }
    },
  );
}

/* ---------- reviews ---------- */

class Stars extends StatelessWidget {
  final int value;
  final double size;
  final ValueChanged<int>? onChanged;
  const Stars(this.value, {super.key, this.size = 16, this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var n = 1; n <= 5; n++)
          GestureDetector(
            onTap: onChanged == null ? null : () => onChanged!(n),
            child: Padding(
              padding: EdgeInsets.only(right: onChanged == null ? 1 : 6),
              child: AppIcon(
                'star',
                size: size,
                color: n <= value ? const Color(0xFFF2A50C) : Tk.line2,
                stroke: n <= value ? 2.4 : 1.8,
              ),
            ),
          ),
      ],
    );
  }
}

class OwnerReviews extends StatefulWidget {
  const OwnerReviews({super.key});

  @override
  State<OwnerReviews> createState() => _OwnerReviewsState();
}

class _OwnerReviewsState extends State<OwnerReviews> {
  String q = '';
  String show = 'all';

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: loadOwner,
      builder: (context, d, reload) {
        final all = d.l('testimonials');
        final reviews = all.where((r) {
          if (show == 'visible' && !r.b('active', true)) return false;
          if (show == 'hidden' && r.b('active', true)) return false;
          if (show == 'top' && r.i('rating', 5) < 5) return false;
          if (show == 'low' && r.i('rating', 5) > 3) return false;
          return textMatches(q, [r.s('name'), r.s('label'), r.s('text')]);
        }).toList();
        return PageScroll(
          title: 'Reviews',
          subtitle: 'Genuine reviews from your clients. Visible ones appear on your page.',
          onRefresh: reload,
          actions: [
            HeaderAction(
              'plus',
              tooltip: 'Add review',
              label: 'Add',
              onPressed: () async {
                if (await editReview(context, null)) reload();
              },
            ),
          ],
          children: [
            if (all.isNotEmpty)
              ListFilters(
                hint: 'Search reviews',
                onSearch: (v) => setState(() => q = v),
                chips: [
                  FilterChips<String>(
                    options: const {
                      'all': 'All',
                      'visible': 'Visible',
                      'hidden': 'Hidden',
                      'top': '5 stars',
                      'low': '3 stars or less',
                    },
                    value: show,
                    onChanged: (v) => setState(() => show = v),
                  ),
                ],
              ),
            if (all.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'star',
                  title: 'No reviews yet',
                  text: 'Add genuine reviews your clients gave you.',
                ),
              )
            else if (reviews.isEmpty)
              const AppCard(
                child: EmptyState(
                  icon: 'search',
                  title: 'No reviews match',
                  text: 'Try another word or clear the filter.',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$show'),
                all: reviews,
                gap: 14,
                itemBuilder: (r) => ListCard(
                  separator: true,
                  dim: !r.b('active', true),
                  onTap: () async {
                    if (await editReview(context, r)) reload();
                  },
                  leading: Avatar(r.s('name'), photo: r.s('photo'), size: 54),
                  title: r.s('name'),
                  subtitle: r.s('label'),
                  trailing: StarPill(r.i('rating', 5)),
                  detailIcon: 'quote',
                  detail: r.s('text'),
                  tags: [
                    r.b('active', true)
                        ? const Tag('Visible', dot: true, tone: TagTone.green)
                        : const Tag('Hidden', dot: true),
                  ],
                  actions: [
                    CardAction(
                      'trash',
                      tooltip: 'Delete',
                      danger: true,
                      onPressed: () async {
                        final ok = await confirmDialog(context, title: 'Delete this review?', confirm: 'Delete');
                        if (!ok || !context.mounted) return;
                        final res = await runAction(
                          context,
                          () => session.api.delete('/api/owner/testimonials/${r.s('id')}'),
                          done: 'Review deleted',
                        );
                        if (res != null) reload();
                      },
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

Future<bool> editReview(BuildContext context, Json? review) {
  final isNew = review == null;
  final r = review ?? <String, dynamic>{};
  final name = TextEditingController(text: r.s('name'));
  final label = TextEditingController(text: r.s('label'));
  final text = TextEditingController(text: r.s('text'));
  var rating = r.i('rating', 5);
  var photo = r.s('photo');
  var active = r.b('active', true);
  return FormPage.open(
    context,
    title: isNew ? 'Add review' : 'Edit review',
    submitLabel: isNew ? 'Add review' : 'Save changes',
    builder: (ctx, setState) => [
      ImageField('Photo', value: photo, maxSize: 400, hint: 'Optional', onChanged: (v) => setState(() => photo = v)),
      FieldX('Client name', name, required: true, maxLength: 60, caps: TextCapitalization.words),
      FieldX('Label', label, maxLength: 60, hint: 'e.g. Regular client', caps: TextCapitalization.sentences),
      FieldX('Review', text, required: true, maxLength: 400, maxLines: 4, caps: TextCapitalization.sentences),
      const Text(
        'Rating',
        style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
      ),
      const SizedBox(height: 8),
      Stars(rating, size: 32, onChanged: (v) => setState(() => rating = v)),
      const SizedBox(height: 16),
      SwitchRow('Show on my page', value: active, onChanged: (v) => setState(() => active = v)),
    ],
    onSubmit: () async {
      final body = {
        'name': name.text.trim(),
        'label': label.text.trim(),
        'text': text.text.trim(),
        'rating': rating,
        'photo': photo,
        'active': active,
      };
      if (isNew) {
        await session.api.post('/api/owner/testimonials', body);
      } else {
        await session.api.put('/api/owner/testimonials/${r.s('id')}', body);
      }
    },
  );
}
