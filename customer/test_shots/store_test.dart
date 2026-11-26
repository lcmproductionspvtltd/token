// Google Play / App Store screenshots of the real BQuee (customer) app.
//
// Not part of the normal tests: the "Store screenshots" GitHub workflow starts a BQuee server with the
// demo business (scripts/seed.js) and a demo customer (scripts/shots-demo-queue.js), then runs
//   flutter test test_shots/store_test.dart --dart-define=SHOTS_SERVER=http://127.0.0.1:3000 --dart-define=SHOTS_SIZE=…
// Each screen is saved as a PNG in build/shots/<size>/ (android 1080×1920 · iphone 1320×2868 · ipad 2064×2752).

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:bquee_customer/core/session.dart';
import 'package:bquee_customer/main.dart';
import 'package:bquee_customer/screens/explore.dart';
import 'package:bquee_customer/screens/tokens.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/screens/notes.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

const _server = String.fromEnvironment('SHOTS_SERVER', defaultValue: 'http://127.0.0.1:3000');
const _size = String.fromEnvironment('SHOTS_SIZE', defaultValue: 'android');
// The demo customer made by scripts/shots-demo-queue.js on the local test server.
const _login = String.fromEnvironment('SHOTS_CUSTOMER', defaultValue: 'ananya@example.com');
const _password = String.fromEnvironment('SHOTS_CUSTOMER_PASSWORD', defaultValue: 'Demo@12345-shots');
final _root = GlobalKey();
final _out = Directory('build/shots/$_size');

Future<void> _loadFont(String family, List<String> files) async {
  final loader = FontLoader(family);
  for (final f in files) {
    loader.addFont(Future.value(ByteData.sublistView(File('assets/fonts/$f').readAsBytesSync())));
  }
  await loader.load();
}

Future<void> _settle(WidgetTester tester, {int rounds = 12}) async {
  for (var i = 0; i < rounds; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 250)));
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _shot(WidgetTester tester, String name) async {
  await _settle(tester);
  await tester.runAsync(() async {
    final boundary = _root.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: tester.view.devicePixelRatio);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    _out.createSync(recursive: true);
    File('${_out.path}/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

void main() {
  setUpAll(() async {
    HttpOverrides.global = null; // these screenshots talk to a real (local) BQuee server
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('bquee/native'),
      (_) async => null,
    );
    await _loadFont('Poppins', ['Poppins-Regular.ttf', 'Poppins-Medium.ttf', 'Poppins-Bold.ttf']);
    await _loadFont('Lora', ['Lora-Variable.ttf']);
  });

  testWidgets('customer screens', (tester) async {
    final (w, h, ratio) = switch (_size) {
      'iphone' => (1320.0, 2868.0, 3.0),
      'ipad' => (2064.0, 2752.0, 2.0),
      _ => (1080.0, 1920.0, 2.625),
    };
    tester.view.physicalSize = Size(w, h);
    tester.view.devicePixelRatio = ratio;
    addTearDown(tester.view.reset);
    debugDisableShadows = false; // real shadows, as on a phone
    addTearDown(() => debugDisableShadows = true);

    await tester.runAsync(() async {
      session.api.base = _server;
      await session.signIn(_login, _password);
      session.ready = true;
    });
    await tester.pumpWidget(RepaintBoundary(key: _root, child: const BQueeCustomerApp()));
    await _settle(tester);
    await _shot(tester, '01-explore');

    await tester.tap(find.byType(BusinessCard).first);
    await _shot(tester, '02-business');
    tester.state<NavigatorState>(find.byType(Navigator).last).pop();
    await _settle(tester, rounds: 4);

    session.goTab?.call('tokens');
    await _shot(tester, '03-my-tokens');

    // The token whose service has just started ("It's your turn"), else the first one.
    var tokenId = '';
    await tester.runAsync(() async {
      final list = (await session.api.getJson('/api/customer/tokens')).l('tokens');
      final serving = list.where((t) => t.s('status') == 'serving');
      tokenId = (serving.isNotEmpty ? serving.first : list.first).s('id');
    });
    session.navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => TokenScreen(id: tokenId)));
    await _shot(tester, '04-token');
    tester.state<NavigatorState>(find.byType(Navigator).last).pop();
    await _settle(tester, rounds: 4);

    // The bell: the customer's real notifications ("It's your turn…").
    await tester.runAsync(() async {
      final feed = await session.api.getJson('/api/customer/notifications');
      notes.items = feed.l('items');
      notes.unread = feed.i('unread');
    });
    await tester.pump();
    await tester.tap(find.byType(NotesBell).first);
    await _shot(tester, '05-notifications');

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 20)); // lets idle network connections close
  });
}
