// The app's own SHA-256 and PKCE (used for "Continue with Google / Apple"), checked against the
// standard test values (FIPS 180-4 examples and RFC 7636's PKCE example).

import 'dart:convert';

import 'package:bquee_shared/core/sha256.dart';
import 'package:flutter_test/flutter_test.dart';

String hex(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

void main() {
  test('SHA-256 matches the standard examples', () {
    expect(hex(sha256(const [])), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(ascii.encode('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(
      hex(sha256(ascii.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(
      hex(sha256(ascii.encode('a' * 1000))),
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    );
  });

  test('PKCE challenge matches RFC 7636', () {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    final p = newPkce();
    expect(p.verifier.length, 43);
    expect(p.challenge, pkceChallenge(p.verifier));
    expect(RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(p.challenge), isTrue);
  });
}
