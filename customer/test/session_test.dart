// Moving the sign-in token from old plain preferences into the phone's secure storage (audit 3.4).
// The phone's storage is imitated in memory; the network answers every request with an error, like a phone
// that is offline or a server that is down – the app must still never lose a valid sign-in or keep an
// insecure copy.

import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bquee_customer/core/session.dart';

class _Phone {
  final prefs = <String, String>{};
  final secrets = <String, String>{};

  void install() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('bquee/native'),
      (call) async {
        final a = Map<String, dynamic>.from((call.arguments as Map?) ?? {});
        switch (call.method) {
          case 'getPref':
            return prefs[a['key']];
          case 'setPref':
            prefs[a['key'] as String] = a['value'] as String;
            return null;
          case 'removePref':
            prefs.remove(a['key']);
            return null;
          case 'getSecret':
            return secrets[a['key']];
          case 'setSecret':
            secrets[a['key'] as String] = a['value'] as String;
            return true;
          case 'removeSecret':
            secrets.remove(a['key']);
            return null;
        }
        return null;
      },
    );
  }
}

/// Every connection fails, like a phone with no signal (and never reaches a real server).
class _Offline extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      super.createHttpClient(context)
        ..connectionFactory = (uri, proxyHost, proxyPort) => Future.error(const SocketException('offline (test)'));
}

void main() {
  late _Phone phone;
  setUp(() {
    phone = _Phone()..install();
    HttpOverrides.global = _Offline();
  });
  tearDown(() => HttpOverrides.global = null);

  testWidgets('upgrade: an old plain token moves into secure storage and the plain copy is deleted', (tester) async {
    phone.prefs['c_token'] = 'old-plain-token';
    phone.prefs['c_name'] = 'Meera';
    final s = Session();
    await tester.runAsync(s.init);
    expect(phone.prefs.containsKey('c_token'), isFalse, reason: 'plain copy deleted');
    expect(phone.secrets['c_token'], 'old-plain-token', reason: 'offline: the swap failed, so the token is kept securely');
    expect(s.api.token, 'old-plain-token');
    expect(s.signedIn, isTrue, reason: 'offline start keeps the person signed in');
    expect(s.ready, isTrue);
  });

  testWidgets('a plain copy left next to a secure token is deleted; the secure one is used', (tester) async {
    phone.secrets['c_token'] = 'secure-token';
    phone.prefs['c_token'] = 'stale-plain-token';
    final s = Session();
    await tester.runAsync(s.init);
    expect(phone.prefs.containsKey('c_token'), isFalse);
    expect(s.api.token, 'secure-token');
  });

  testWidgets('no token anywhere: starts signed out', (tester) async {
    final s = Session();
    await tester.runAsync(s.init);
    expect(s.signedIn, isFalse);
    expect(s.ready, isTrue);
  });

  testWidgets('sign-out clears the secure token and every saved detail', (tester) async {
    phone.secrets['c_token'] = 'secure-token';
    phone.prefs['c_name'] = 'Meera';
    final s = Session();
    await tester.runAsync(s.init);
    await tester.runAsync(s.logout);
    expect(phone.secrets, isEmpty);
    expect(phone.prefs.keys.where((k) => k != 'server'), isEmpty);
    expect(s.signedIn, isFalse);
  });

  testWidgets('an expired sign-in (server says 401) clears everything', (tester) async {
    phone.secrets['c_token'] = 'secure-token';
    phone.prefs['c_name'] = 'Meera';
    final s = Session();
    await tester.runAsync(s.init);
    s.api.onUnauthorized!();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    expect(phone.secrets, isEmpty);
    expect(s.signedIn, isFalse);
  });
}
