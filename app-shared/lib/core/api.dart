// HTTP client for the BQuee server (same API as the web app). Uses dart:io only.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart' show PlatformException;

import 'json.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => message;
}

class Api {
  String base;
  String? token;
  void Function()? onUnauthorized;
  final HttpClient _http = HttpClient()..connectionTimeout = const Duration(seconds: 20);

  Api(this.base);

  /// Absolute URL for a server path like "/uploads/x.jpg" (data: and https URLs pass through;
  /// plain http is never fetched).
  String url(String path) {
    if (path.isEmpty) return '';
    if (path.startsWith('https://') || path.startsWith('data:')) return path;
    if (path.startsWith('http://')) return isLocalTest(Uri.parse(path)) ? path : '';
    return base + (path.startsWith('/') ? path : '/$path');
  }

  /// A developer's own test server (computer or emulator) – the only place plain http is allowed.
  static bool isLocalTest(Uri uri) => const {'localhost', '127.0.0.1', '10.0.2.2'}.contains(uri.host);

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body ?? const <String, dynamic>{});
  Future<dynamic> put(String path, [Object? body]) => _send('PUT', path, body ?? const <String, dynamic>{});
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<Json> getJson(String path) async => asJson(await get(path));

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    final uri = Uri.parse(url(path));
    // Sign-in tokens and personal data only travel over HTTPS (audit section 8).
    if (uri.scheme != 'https' && !isLocalTest(uri))
      throw ApiException(0, 'Refused an insecure (non-HTTPS) connection.');
    HttpClientRequest req;
    try {
      req = await _http.openUrl(method, uri).timeout(const Duration(seconds: 25));
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to answer. Check your connection and try again.');
    } on SocketException {
      throw ApiException(0, 'No connection. Check your internet and try again.');
    } on HandshakeException {
      throw ApiException(0, 'Secure connection failed. Check the server address.');
    } catch (_) {
      throw ApiException(0, 'Could not reach the server. Check the server address.');
    }
    req.headers.set(HttpHeaders.acceptHeader, 'application/json');
    // Steps this app can show: the emailed sign-in code after many wrong passwords (src/routes/auth.js).
    req.headers.set('X-BQuee-Features', 'email-code');
    if (token != null && token!.isNotEmpty) req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    if (body != null && method != 'GET') {
      final bytes = utf8.encode(jsonEncode(body));
      req.headers.contentType = ContentType('application', 'json', charset: 'utf-8');
      req.contentLength = bytes.length;
      req.add(bytes);
    }
    HttpClientResponse res;
    String text;
    try {
      res = await req.close().timeout(const Duration(seconds: 40));
      text = await res.transform(utf8.decoder).join().timeout(const Duration(seconds: 40));
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to answer. Try again in a moment.');
    } on SocketException {
      throw ApiException(0, 'The connection dropped. Try again.');
    }
    dynamic data;
    try {
      data = text.isEmpty ? <String, dynamic>{} : jsonDecode(text);
    } catch (_) {
      data = <String, dynamic>{};
    }
    if (res.statusCode >= 400) {
      final msg = data is Map && data['error'] != null ? data['error'].toString() : messageForStatus(res.statusCode);
      if (res.statusCode == 401 && onUnauthorized != null) onUnauthorized!();
      throw ApiException(res.statusCode, msg);
    }
    return data;
  }
}

/// The server connection that shared code uses (pictures, account requests).
/// Each app points it at its own session's connection once at start-up: `serverApi = session.api`.
Api serverApi = Api('');

/// What to tell people when an answer has no message of its own (for example a "too big" refusal
/// from the web server, or BQuee restarting) – never a bare code. Same wording as the website.
String messageForStatus(int status) => switch (status) {
      400 => 'Some details aren’t right. Check the form and try again.',
      401 => 'Your sign-in has ended. Please sign in again.',
      403 => 'You don’t have permission to do this. Refresh and try again.',
      404 => 'This item no longer exists. Refresh and try again.',
      408 => 'The server took too long to answer. Try again.',
      409 => 'Someone changed this at the same time. Refresh and try again.',
      413 => 'This file is too big to upload. Choose a smaller picture and try again.',
      429 => 'Too many tries in a short time. Wait a minute and try again.',
      500 => 'Something went wrong on our side. Try again in a moment – if it keeps happening, contact support.',
      502 => 'BQuee is restarting. Wait a few seconds and try again.',
      503 => 'BQuee is busy right now. Wait a few seconds and try again.',
      504 => 'The server took too long to answer. Try again in a moment.',
      _ => 'Something went wrong (code $status). Try again – if it keeps happening, contact support.',
    };

/// A sentence for any error, never a code or a Dart class name ("PlatformException(…)").
String friendlyError(Object e) {
  if (e is ApiException) return e.message;
  if (e is PlatformException) {
    final m = (e.message ?? '').trim();
    return m.isNotEmpty && !m.contains('Exception') ? m : 'The phone couldn’t do this. Try again – if it keeps happening, restart the app.';
  }
  if (e is FormatException) return 'The server sent an answer the app couldn’t read. Update the app and try again.';
  if (e is TimeoutException) return 'The server is taking too long to answer. Check your connection and try again.';
  return 'Something went wrong. Check your connection and try again.';
}
