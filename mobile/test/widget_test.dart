// Self-checks for the parts written without packages: QR encode → decode round trip,
// the SVG icon parser, and formatting.

import 'dart:typed_data';

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/qr/qr_decode.dart';
import 'package:bquee_shared/core/qr/qr_encode.dart';
import 'package:bquee_shared/ui/icon_data.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';

Uint8List _render(QrMatrix qr, int scale, int quiet) {
  final size = (qr.size + quiet * 2) * scale;
  final img = Uint8List(size * size)..fillRange(0, size * size, 255);
  for (var y = 0; y < qr.size; y++) {
    for (var x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      for (var dy = 0; dy < scale; dy++) {
        for (var dx = 0; dx < scale; dx++) {
          img[((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx] = 0;
        }
      }
    }
  }
  return img;
}

void main() {
  test('QR round trip (encoder → decoder)', () {
    for (final text in [
      'https://salonq-8t3f.onrender.com/t/3f9a12bc4d5e',
      'A',
      'Lotus Salon & Spa – token A-007 ✓',
      'x' * 300,
    ]) {
      final qr = encodeQr(text);
      final size = (qr.size + 8) * 4;
      expect(decodeQrLuminance(_render(qr, 4, 4), size, size, fast: false), text);
    }
  });

  test('token id from scanned codes', () {
    expect(tokenIdFromCode('https://example.com/t/3f9a12bc4d5e'), '3f9a12bc4d5e');
    expect(tokenIdFromCode('3f9a12bc4d5e'), '3f9a12bc4d5e');
    expect(tokenIdFromCode('https://example.com/b/abc'), isNull);
  });

  test('every icon parses', () {
    for (final name in kIconShapes.keys) {
      for (final shape in kIconShapes[name]!) {
        if (shape.startsWith('P')) expect(() => parseSvgPath(shape.substring(1)), returnsNormally, reason: name);
      }
    }
  });

  test('money and token numbers', () {
    expect(money(1234567), '₹12,34,567');
    expect(money(900, '\$'), '\$900');
    expect(tokenNo({'prefix': 'A', 'number': 7}), 'A-007');
    expect(waitText(75), '1 h 15 min');
  });

  testWidgets('pagination: tapping a page number or the arrows changes the page', (tester) async {
    // Tall test screen so the whole list and its pager fit without scrolling.
    tester.view.physicalSize = const Size(800, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final items = List.generate(25, (i) => 'Item ${i + 1}');
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(Tk.bqueePurple),
        home: Scaffold(
          body: CustomScrollView(
            slivers: [
              SliverList(
                delegate: SliverChildListDelegate([
                  PagedColumn<String>(
                    all: items,
                    itemBuilder: (x) => AppCard(child: Text(x)),
                  ),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('Item 1'), findsOneWidget);
    expect(find.text('Item 11'), findsNothing);
    await tester.tap(find.text('2'));
    await tester.pumpAndSettle();
    expect(find.text('Item 11'), findsOneWidget);
    expect(find.text('Item 1'), findsNothing);
    await tester.tap(find.byTooltip('Next page'));
    await tester.pumpAndSettle();
    expect(find.text('Item 21'), findsOneWidget);
    await tester.tap(find.byTooltip('Previous page'));
    await tester.pumpAndSettle();
    expect(find.text('Item 11'), findsOneWidget);
  });

  testWidgets('pagination: hidden when everything fits on one page', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(Tk.bqueePurple),
        home: Scaffold(
          body: ListView(
            children: [
              PagedColumn<String>(
                all: const ['A', 'B', 'C'],
                itemBuilder: (x) => AppCard(child: Text(x)),
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('C'), findsOneWidget);
    expect(find.byTooltip('Next page'), findsNothing);
    expect(find.textContaining(' of 3'), findsNothing);
  });

  test('search matching ignores case and empty queries', () {
    expect(textMatches('', ['x']), isTrue);
    expect(textMatches('ANJ', ['Anjali Menon']), isTrue);
    expect(textMatches('zz', ['Anjali', 'Menon']), isFalse);
  });

  testWidgets('list card and filters fit a small phone without overflow', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(Tk.bqueePurple),
        home: Scaffold(
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              ListFilters(
                onSearch: (_) {},
                chips: [
                  FilterChips<String>(
                    options: const {'a': 'All', 'b': 'Online', 'c': 'Offline', 'd': 'Inactive', 'e': 'No login'},
                    value: 'a',
                    onChanged: (_) {},
                  ),
                ],
              ),
              PagedColumn<int>(
                all: const [1, 2, 3],
                itemBuilder: (i) => ListCard(
                  leading: const Avatar('Anjali Menon With A Very Long Name', size: 54),
                  title: 'Anjali Menon With A Very Long Name That Wraps',
                  subtitle: 'Beauty Expert · Main Branch on a long street name',
                  subtitleIcon: 'lotus',
                  trailing: Switch(value: true, onChanged: (_) {}),
                  detailIcon: 'scissors',
                  detail: 'Classic Facial, Haircut & Style, Manicure, Threading, Pedicure, Hair Colour, Head Massage',
                  tags: const [
                    Tag('someone.with.a.long.email@example.com', icon: 'mail', tone: TagTone.blue),
                    Tag('Queue 1 h 30 min', icon: 'clock', tone: TagTone.amber),
                  ],
                  actions: [CardAction('trash', tooltip: 'Delete', danger: true, onPressed: () {})],
                ),
              ),
              const StarPill(4),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Queue 1 h 30 min'), findsWidgets);
  });
}
