// Explore: every business on BQuee, with search and business-type filters.
// Tap a business to see it, or "Book" on a branch to book a token there.

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'book.dart';
import 'business.dart';
import 'common.dart';
import 'home.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  String q = '';
  String cat = '';

  @override
  Widget build(BuildContext context) {
    return Loaded<Json>(
      load: () => session.api.getJson('/api/customer/businesses'),
      builder: (context, d, reload) {
        final b = brandOf(context);
        final all = d.l('businesses');
        final cats = d.l('categories').where((c) => all.any((x) => x.m('category').s('id') == c.s('id'))).toList();
        final shown = all.where((x) {
          final okCat = cat.isEmpty || x.m('category').s('id') == cat;
          final hay = [
            x.s('name'),
            x.s('tagline'),
            x.s('address'),
            x.m('category').s('name'),
            for (final br in x.l('branches')) '${br.s('name')} ${br.s('address')}',
          ];
          return okCat && textMatches(q, hay);
        }).toList();
        final first = session.name.split(' ').first;
        return PageScroll(
          title: first.isEmpty ? 'Hello' : 'Hi, $first',
          subtitle: 'Find a business and book your token',
          onRefresh: reload,
          children: [
            // Scan prompt
            AppCard(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [b.c, mix(b.c, 0.6, b.rose)],
              ),
              padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
              onTap: () => scanAndOpen(context),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: fade(Colors.white, 0.18),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: fade(Colors.white, 0.3)),
                    ),
                    alignment: Alignment.center,
                    child: const AppIcon('qr', size: 26, color: Colors.white, stroke: 2),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'At the business?',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Scan its BQuee QR code to book in seconds',
                          style: TextStyle(color: fade(Colors.white, 0.85), fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  const AppIcon('chevr', size: 22, color: Colors.white),
                ],
              ),
            ),
            const SizedBox(height: 18),
            ListFilters(
              hint: 'Search business, area or type',
              onSearch: (v) => setState(() => q = v),
              chips: [
                if (cats.isNotEmpty)
                  FilterChips<String>(
                    options: {'': 'All', for (final c in cats) c.s('id'): c.s('name')},
                    value: cat,
                    onChanged: (v) => setState(() => cat = v),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            SectionTitle(plural(shown.length, 'business', 'businesses')),
            if (shown.isEmpty)
              AppCard(
                child: EmptyState(
                  icon: all.isEmpty ? 'store' : 'search',
                  title: all.isEmpty ? 'No businesses yet' : 'Nothing matches',
                  text: all.isEmpty
                      ? 'Businesses appear here as they join BQuee. You can still scan a business’s QR code.'
                      : 'Try another name or business type.',
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$cat'),
                all: shown,
                gap: 14,
                itemBuilder: (x) => BusinessCard(x: x),
              ),
          ],
        );
      },
    );
  }
}

class BusinessCard extends StatelessWidget {
  final Json x;
  const BusinessCard({super.key, required this.x});

  @override
  Widget build(BuildContext context) {
    final color = parseHexColor(x.s('color'), Tk.bqueePurple);
    final cat = x.m('category');
    final branches = x.l('branches');
    return ListCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => BusinessScreen(slug: x.s('slug')))),
      leading: BizMark(logo: x.s('logo'), color: color, size: 54),
      title: x.s('name'),
      subtitle: cat.isNotEmpty
          ? cat.s('name')
          : (x.s('tagline').isNotEmpty ? x.s('tagline') : plural(branches.length, 'branch', 'branches')),
      subtitleIcon: cat.isNotEmpty ? cat.s('icon', 'store') : 'store',
      trailing: const AppIcon('chevr', size: 20, color: Tk.ink3),
      body: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Column(
          children: [
            for (final br in branches.take(3)) _BranchRow(br: br),
            if (branches.length > 3)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '+ ${plural(branches.length - 3, 'more branch', 'more branches')}',
                  style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _BranchRow extends StatelessWidget {
  final Json br;
  const _BranchRow({required this.br});

  @override
  Widget build(BuildContext context) {
    final open = br.b('open');
    final waiting = br.i('waiting');
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          IconChip('pin', color: open ? brandOf(context).c : Tk.ink3, size: 36),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  br.s('name'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink, fontSize: 14),
                ),
                Text(
                  open
                      ? (waiting == 0 ? 'No queue right now' : '${plural(waiting, 'person', 'people')} waiting')
                      : 'Not taking tokens now',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: open ? (waiting == 0 ? Tk.doneFg : Tk.ink3) : Tk.ink3, fontSize: 12.5),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Btn(
            'Book',
            icon: 'ticket',
            small: true,
            kind: open ? BtnKind.primary : BtnKind.soft,
            onPressed: open ? () => openBooking(context, br.s('id')) : null,
          ),
        ],
      ),
    );
  }
}
