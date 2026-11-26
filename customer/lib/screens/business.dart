// One business: cover, details, branches with their live queue, and services.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'book.dart';
import 'common.dart';

class BusinessScreen extends StatelessWidget {
  final String slug;
  const BusinessScreen({super.key, required this.slug});

  /// Asks which branch when there is more than one; returns the branch id.
  static Future<String?> pickBranch(BuildContext context, List<Json> branches) async {
    if (branches.length == 1) return branches.first.s('id');
    return showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.only(left: 4, bottom: 10),
                child: Text(
                  'Which branch?',
                  style: TextStyle(fontFamily: Tk.serif, fontSize: 20, fontWeight: FontWeight.w600, color: Tk.ink),
                ),
              ),
              for (final br in branches)
                ListTile(
                  leading: IconChip('pin', color: brandOf(ctx).c),
                  title: Text(br.s('name'), style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    br.s('address').isEmpty ? '${br.i('waiting')} waiting' : br.s('address'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: const AppIcon('chevr', size: 20, color: Tk.ink3),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tk.r)),
                  onTap: () => Navigator.pop(ctx, br.s('id')),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      frame: loadingPage,
      load: () => session.api.getJson('/api/public/salon/${Uri.encodeComponent(slug)}'),
      builder: (context, d, reload) {
        final s = d.m('salon');
        final color = parseHexColor(s.s('color'), Tk.bqueePurple);
        final brand = Brand(color);
        final open = d.b('open');
        final branches = d.l('branches');
        final services = d.l('services');
        return Theme(
          data: buildTheme(color),
          child: Scaffold(
            backgroundColor: Tk.canvas,
            body: RefreshIndicator(
              onRefresh: reload,
              color: color,
              child: CustomScrollView(
                slivers: [
                  SliverAppBar(
                    pinned: true,
                    expandedHeight: 210,
                    backgroundColor: brand.deep,
                    foregroundColor: Colors.white,
                    leading: IconButton(
                      icon: const AppIcon('back', size: 22, color: Colors.white),
                      tooltip: 'Back',
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                    flexibleSpace: FlexibleSpaceBar(
                      background: Stack(
                        fit: StackFit.expand,
                        children: [
                          NetImage(
                            s.s('cover'),
                            fallback: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [brand.deep, brand.rose],
                                ),
                              ),
                            ),
                          ),
                          DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [fade(Colors.black, 0.25), fade(brand.deep, 0.85)],
                              ),
                            ),
                          ),
                          Positioned(
                            left: 18,
                            right: 18,
                            bottom: 18,
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                BizMark(logo: s.s('logo'), color: color, size: 62, onDark: true),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        s.s('name'),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontFamily: Tk.serif,
                                          color: Colors.white,
                                          fontSize: 24,
                                          fontWeight: FontWeight.w600,
                                          height: 1.15,
                                        ),
                                      ),
                                      if (s.s('tagline').isNotEmpty)
                                        Text(
                                          s.s('tagline'),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(color: fade(Colors.white, 0.85), fontSize: 13),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                    sliver: SliverList(
                      delegate: SliverChildListDelegate([
                        if (!open)
                          AppCard(
                            color: Tk.waitBg,
                            child: const Row(
                              children: [
                                AppIcon('clock', size: 20, color: Tk.waitFg),
                                SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    'This business isn’t taking tokens right now.',
                                    style: TextStyle(color: Tk.waitFg, fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        if (s.s('about').isNotEmpty || s.s('hours').isNotEmpty || s.s('phone').isNotEmpty) ...[
                          const SizedBox(height: 4),
                          AppCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (s.s('about').isNotEmpty)
                                  Text(s.s('about'), style: const TextStyle(color: Tk.ink2, height: 1.5)),
                                if (s.s('hours').isNotEmpty) ...[
                                  const SizedBox(height: 10),
                                  Row(
                                    children: [
                                      const AppIcon('clock', size: 17, color: Tk.ink3),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(s.s('hours'), style: const TextStyle(color: Tk.ink2)),
                                      ),
                                    ],
                                  ),
                                ],
                                if (s.s('phone').isNotEmpty) ...[
                                  const SizedBox(height: 12),
                                  Btn(
                                    'Call ${s.s('phone')}',
                                    icon: 'phone',
                                    kind: BtnKind.soft,
                                    small: true,
                                    onPressed: () => Native.openUrl('tel:${s.s('phone').replaceAll(' ', '')}'),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 18),
                        SectionTitle(branches.length == 1 ? 'Book a token' : 'Branches'),
                        for (final br in branches)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _BranchCard(br: br, open: open),
                          ),
                        if (services.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          SectionTitle('Services'),
                          AppCard(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                            child: Column(
                              children: [
                                for (var i = 0; i < services.length; i++) ...[
                                  if (i > 0) const Divider(height: 1, indent: 12, endIndent: 12),
                                  ListTile(
                                    title: Text(
                                      services[i].s('name'),
                                      style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
                                    ),
                                    subtitle: Text(
                                      '${services[i].i('duration')} min${services[i].s('category').isEmpty ? '' : ' · ${services[i].s('category')}'}',
                                    ),
                                    trailing: Text(
                                      servicePrice(services[i], branches, s.s('currency', '₹')),
                                      style: TextStyle(fontWeight: FontWeight.w700, color: brand.ink),
                                    ),
                                    onTap: !open || branches.isEmpty
                                        ? null
                                        : () async {
                                            final id = await pickBranch(context, branches);
                                            if (id != null && context.mounted)
                                              openBooking(context, id, preselect: {services[i].s('id')});
                                          },
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ]),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _BranchCard extends StatelessWidget {
  final Json br;
  final bool open;
  const _BranchCard({required this.br, required this.open});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final online = br.i('staffCount') > 0;
    final can = open && online;
    final waiting = br.i('waiting');
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconChip('pin', color: b.c, size: 42),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      br.s('name'),
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Tk.ink),
                    ),
                    if (br.s('address').isNotEmpty)
                      Text(
                        br.s('address'),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Tk.ink3, fontSize: 13),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _stat(b, 'users', '$waiting', 'Waiting'),
              _stat(b, 'clock', can ? (br['wait'] == null ? '—' : waitText(br.i('wait'))) : '—', 'Est. wait'),
              _stat(b, 'user', '${br.i('staffCount')}', 'Staff on duty'),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              if (br.s('address').isNotEmpty) ...[
                Btn(
                  'Map',
                  icon: 'map',
                  kind: BtnKind.soft,
                  small: true,
                  onPressed: () => Native.openUrl(mapLink(br.s('address'))),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Btn(
                  can ? 'Book a token' : 'Not taking tokens now',
                  icon: 'ticket',
                  expand: true,
                  onPressed: can ? () => openBooking(context, br.s('id')) : null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _stat(Brand b, String icon, String value, String label) => Expanded(
    child: Container(
      margin: const EdgeInsets.symmetric(horizontal: 3),
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(color: b.wash, borderRadius: BorderRadius.circular(14)),
      child: Column(
        children: [
          AppIcon(icon, size: 17, color: b.c, stroke: 2),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(fontWeight: FontWeight.w700, color: b.ink, fontSize: 15),
          ),
          Text(label, style: const TextStyle(color: Tk.ink3, fontSize: 11.5)),
        ],
      ),
    ),
  );
}

/// A service's price across the shown branches: one price, or "low – high" when branches charge differently.
String servicePrice(Json svc, List<Json> branches, String cur) {
  final own = svc['branchPrices'];
  final only = svc.ls('branchIds');
  final prices = <double>[];
  for (final br in branches) {
    final id = br.s('id');
    if (only.isNotEmpty && !only.contains(id)) continue;
    final p = own is Map && own[id] is num ? (own[id] as num).toDouble() : svc.d('price');
    prices.add(p);
  }
  if (prices.isEmpty) return money(svc.d('price'), cur);
  prices.sort();
  return prices.first == prices.last
      ? money(prices.first, cur)
      : '${money(prices.first, cur)} – ${money(prices.last, cur)}';
}
