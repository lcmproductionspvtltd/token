// Privacy Policy and Terms and Conditions as screens inside both apps, for every user (before and
// after signing in). The text comes from the server (/api/public/legal/…), the same words as the
// website's /privacy and /terms pages, so it is written in one place only (src/content/legal.js).

import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/json.dart';
import '../ui/icons.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

/// Opens the Privacy Policy screen.
Future<void> openPrivacy(BuildContext context) => _open(context, 'privacy', 'Privacy Policy');

/// Opens the Terms and Conditions screen.
Future<void> openTerms(BuildContext context) => _open(context, 'terms', 'Terms and Conditions');

Future<void> _open(BuildContext context, String doc, String title) => Navigator.of(
  context,
).push(MaterialPageRoute<void>(builder: (_) => LegalScreen(doc: doc, title: title)));

/// "Privacy Policy · Terms and Conditions" links, for sign-in screens (app stores expect both to be
/// reachable from the app, also before signing in).
class LegalLinks extends StatelessWidget {
  final Color color;
  const LegalLinks({super.key, this.color = Tk.ink3});

  @override
  Widget build(BuildContext context) {
    Widget link(String label, Future<void> Function(BuildContext) open) => TextButton(
      onPressed: () => open(context),
      style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8), minimumSize: const Size(0, 36)),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 12.5, decoration: TextDecoration.underline, decorationColor: color),
      ),
    );
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        link('Privacy Policy', openPrivacy),
        Text('·', style: TextStyle(color: color)),
        link('Terms and Conditions', openTerms),
      ],
    );
  }
}

/// One policy: title, date, intro, numbered sections (paragraphs and bullet points) and contact details.
class LegalScreen extends StatefulWidget {
  final String doc; // 'privacy' or 'terms'
  final String title;
  const LegalScreen({super.key, required this.doc, required this.title});

  @override
  State<LegalScreen> createState() => _LegalScreenState();
}

class _LegalScreenState extends State<LegalScreen> {
  late Future<Json> _load = _fetch();

  Future<Json> _fetch() => serverApi.getJson('/api/public/legal/${widget.doc}');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
        child: FutureBuilder<Json>(
          future: _load,
          builder: (context, snap) {
            if (snap.hasError) {
              return EmptyState(
                icon: 'globe',
                title: 'Couldn’t load the ${widget.title}',
                text: snap.error is ApiException
                    ? (snap.error as ApiException).message
                    : 'Check your internet connection and try again.',
                action: Btn('Try again', icon: 'refresh', onPressed: () => setState(() => _load = _fetch())),
              );
            }
            if (!snap.hasData) return const Center(child: CircularProgressIndicator());
            return _Body(d: snap.data!);
          },
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final Json d;
  const _Body({required this.d});

  static const _text = TextStyle(color: Tk.ink2, fontSize: 14.5, height: 1.55);

  Widget _para(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Text(t, style: _text),
  );

  Widget _bullet(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 8, left: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 8, right: 10),
          child: CircleAvatar(radius: 2.5, backgroundColor: Tk.ink3),
        ),
        Expanded(child: Text(t, style: _text)),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final c = d.m('contact');
    final kids = <Widget>[
      Text(
        d.s('title'),
        style: const TextStyle(fontFamily: Tk.serif, fontSize: 26, fontWeight: FontWeight.w600, color: Tk.ink),
      ),
      const SizedBox(height: 4),
      Text('Last updated: ${d.s('updated')}', style: const TextStyle(color: Tk.ink3, fontSize: 13)),
      const SizedBox(height: 16),
      for (final t in d.ls('intro')) _para(t),
    ];
    for (final sec in d.l('sections')) {
      final paras = sec.ls('p');
      final list = sec.ls('list');
      if (sec.s('h').isNotEmpty) {
        kids.add(
          Padding(
            padding: const EdgeInsets.only(top: 14, bottom: 8),
            child: Text(
              sec.s('h'),
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16.5, color: Tk.ink),
            ),
          ),
        );
      }
      // A section with bullets: its first paragraph introduces them, the rest follow.
      if (list.isNotEmpty && paras.isNotEmpty) kids.add(_para(paras.first));
      for (final t in list) {
        kids.add(_bullet(t));
      }
      for (final t in list.isNotEmpty ? paras.skip(1) : paras) {
        kids.add(_para(t));
      }
    }
    kids.addAll([
      const SizedBox(height: 18),
      AppCard(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Questions?',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Tk.ink),
            ),
            const SizedBox(height: 6),
            Text(c.s('company'), style: _text),
            _contact(context, 'phone', c.s('phone'), c.s('phoneHref')),
            _contact(context, 'mail', c.s('email'), 'mailto:${c.s('email')}'),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(c.s('address'), style: _text),
            ),
          ],
        ),
      ),
    ]);
    return ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 32), children: kids);
  }

  Widget _contact(BuildContext context, String icon, String label, String href) => InkWell(
    onTap: () => openLink(context, href),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          AppIcon(icon, size: 18, color: brandOf(context).c),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: brandOf(context).c, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    ),
  );
}
