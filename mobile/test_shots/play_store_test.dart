// Google Play / App Store screenshots of the real BQuee Biz app.
//
// Not part of the normal tests: the "Store screenshots" GitHub workflow starts a BQuee server with the
// demo business (scripts/seed.js), then runs
//   flutter test test_shots/play_store_test.dart --dart-define=SHOTS_SERVER=http://127.0.0.1:3000
// The app's own screens talk to that server; each screen is saved as a PNG in build/shots/<size>/
// (--dart-define=SHOTS_SIZE=android | iphone | ipad).

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:bquee/core/session.dart';
import 'package:bquee/main.dart';
import 'package:bquee/screens/shell.dart';
import 'package:bquee/screens/staff/new_token.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/screens/notes.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

const _server = String.fromEnvironment('SHOTS_SERVER', defaultValue: 'http://127.0.0.1:3000');
// android 1080×1920 (Google Play) · iphone 1320×2868 (App Store 6.9") · ipad 2064×2752 (App Store 13")
const _size = String.fromEnvironment('SHOTS_SIZE', defaultValue: 'android');
final _root = GlobalKey();
final _out = Directory('build/shots/$_size');

Future<void> _loadFont(String family, List<String> files) async {
  final loader = FontLoader(family);
  for (final f in files) {
    loader.addFont(Future.value(ByteData.sublistView(File('assets/fonts/$f').readAsBytesSync())));
  }
  await loader.load();
}

/// Lets real network answers arrive and the screen settle.
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

Future<void> _signIn(WidgetTester tester, String username, String password) async {
  await tester.runAsync(() async {
    session.api.base = _server;
    session.api.token = null;
    final r = asJson(await session.api.post('/api/login', {'username': username, 'password': password}));
    await session.signedInWith(r);
    session.ready = true;
  });
}

Future<void> _openApp(WidgetTester tester) async {
  await tester.pumpWidget(RepaintBoundary(key: _root, child: const BQueeApp()));
  await _settle(tester);
}

void _go(WidgetTester tester, String id) => tester.state<AppShellState>(find.byType(AppShell)).go(id);

void main() {
  setUpAll(() async {
    HttpOverrides.global = null; // these screenshots talk to a real (local) BQuee server
    // The app's native code isn't there in a test: every call answers "nothing".
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('bquee/native'),
      (_) async => null,
    );
    await _loadFont('Poppins', ['Poppins-Regular.ttf', 'Poppins-Medium.ttf', 'Poppins-Bold.ttf']);
    await _loadFont('Lora', ['Lora-Variable.ttf']);
  });

  void phone(WidgetTester tester) {
    final (w, h, ratio) = switch (_size) {
      'iphone' => (1320.0, 2868.0, 3.0),
      'ipad' => (2064.0, 2752.0, 2.0),
      _ => (1080.0, 1920.0, 2.625),
    };
    tester.view.physicalSize = Size(w, h);
    tester.view.devicePixelRatio = ratio;
    addTearDown(tester.view.reset);
    debugDisableShadows = false; // real shadows, as on a phone (tests draw them as black outlines)
    addTearDown(() => debugDisableShadows = true);
  }

  testWidgets('owner screens', (tester) async {
    phone(tester);
    await _signIn(tester, 'owner', 'Owner@123');
    await _openApp(tester);
    await _shot(tester, '01-owner-overview');
    _go(tester, 'tokens');
    await _shot(tester, '02-owner-tokens');
    _go(tester, 'reports');
    await _shot(tester, '05-owner-reports');
    _go(tester, 'services');
    await _shot(tester, '07-services');
    // The bell: the owner's real notifications from the server.
    await tester.runAsync(() async {
      final feed = await session.api.getJson('/api/notifications');
      notes.items = feed.l('items');
      notes.unread = feed.i('unread');
    });
    _go(tester, 'overview');
    await _settle(tester);
    await tester.tap(find.byType(NotesBell).first);
    await _shot(tester, '08-notifications');
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 20)); // lets idle network connections close
  });

  testWidgets('staff screens', (tester) async {
    phone(tester);
    await _signIn(tester, 'staff', 'Staff@123');
    await _openApp(tester);
    await _shot(tester, '03-staff-queue');
    await tester.ensureVisible(find.text('New token for a walk-in'));
    await tester.pump();
    await tester.tap(find.text('New token for a walk-in'));
    await _settle(tester);
    expect(find.byType(NewTokenScreen), findsOneWidget);
    await _shot(tester, '04-staff-new-token');
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 20)); // lets idle network connections close
  });
}
