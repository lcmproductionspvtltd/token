// Who is signed in and the brand colour the app is painted in.
//
// The app always talks to the live BQuee server over HTTPS (kDefaultServer); there is no server
// setting (audit F-05: an older version saved one that was never used – it is removed on start).
// The sign-in token is kept in the phone's secure storage – Android Keystore / iOS Keychain (F-01).

import 'dart:convert';

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:material_ui/material_ui.dart';

const String kDefaultServer = 'https://salonq-8t3f.onrender.com';

class Session extends ChangeNotifier {
  final Api api = Api(kDefaultServer);

  Session() {
    serverApi = api; // the shared code (pictures, account requests) uses this app's server
  }
  Json? user;
  Color brand = Tk.bqueePurple;
  String businessName = '';
  String businessLogo = '';
  bool ready = false;

  final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  String get role => user?.s('role') ?? '';

  /// Menus and features the super admin allows for this business (owners and staff).
  Json? _features;
  Json get features => _features ?? user?.m('features') ?? <String, dynamic>{};
  bool menuOn(String id) => features.m('menus')[id] != false;
  bool get canExport => features['reportExport'] != false;
  bool get staffReports => features['staffReports'] != false;

  /// Updates the switches from fresh business data; redraws only when they changed.
  void setFeatures(Json f) {
    if (f.isEmpty || jsonEncode(f) == jsonEncode(features)) return;
    _features = f;
    notifyListeners();
  }

  bool get signedIn => user != null;
  bool get isPlatform => role == 'superadmin' || role == 'platform_staff';

  /// Platform permission check (the super admin can do everything).
  bool can(String permission) {
    if (role == 'superadmin') return true;
    final p = user?.ls('permissions') ?? const <String>[];
    return p.contains('*') || p.contains(permission);
  }

  Future<void> init() async {
    api.base = kDefaultServer;
    api.onUnauthorized = _expired;
    await Native.removePref('server'); // leftover of older versions
    var token = await Native.getSecret('token');
    var moved = false;
    // Older versions kept the token in plain app preferences: move it into secure storage once,
    // and always delete the plain copy – even when a secure one already exists.
    final old = await Native.getPref('token');
    if (old != null) await Native.removePref('token');
    if ((token == null || token.isEmpty) && old != null && old.isNotEmpty) {
      token = old;
      moved = true;
    }
    if (token != null && token.isNotEmpty) {
      api.token = token;
      if (moved) await _rotate();
      try {
        user = await api.getJson('/api/me');
      } on ApiException catch (e) {
        if (e.status == 401 || e.status == 403) {
          await _clear();
        } else {
          // Offline: keep the saved session and let screens show their own error.
          final cached = await Native.getPref('user_name');
          user = {'role': await Native.getPref('user_role') ?? '', 'name': cached ?? ''};
        }
      }
    }
    ready = true;
    notifyListeners();
  }

  /// Swaps the session for a new token and ends the old one (after moving it from plain storage).
  Future<void> _rotate() async {
    try {
      final r = asJson(await api.post('/api/session/rotate'));
      if (r.s('token').isNotEmpty) api.token = r.s('token');
    } catch (_) {
      // offline or expired: the checks below sort it out
    }
    await Native.setSecret('token', api.token!);
  }

  /// Step 1: username + password. Returns null when signed in, or the two-step sign-in step this
  /// account needs first ({step: 'setup'|'verify', challenge, secret?, uri?}) – see completeMfa.
  Future<Json?> login(String username, String password) async {
    api.base = kDefaultServer;
    api.token = null;
    final r = asJson(await api.post('/api/login', {'username': username.trim(), 'password': password}));
    if (r['mfa'] != null) return r.m('mfa');
    await _signedIn(r);
    return null;
  }

  /// Step 2: the authenticator code (or a backup code). After a first-time setup it returns the
  /// 10 backup codes to show once; otherwise an empty list.
  Future<List<String>> completeMfa(String challenge, String code) async {
    final r = asJson(await api.post('/api/login/mfa', {'challenge': challenge, 'code': code.trim()}));
    await _signedIn(r);
    return r.ls('backupCodes');
  }

  /// A finished sign-in (or business sign-up) answer: { token, user }.
  Future<void> _signedIn(Json r) async {
    api.token = r.s('token');
    user = r.m('user');
    await Native.setSecret('token', api.token!);
    await Native.setPref('user_role', role);
    await Native.setPref('user_name', user!.s('name'));
    brand = Tk.bqueePurple;
    notifyListeners();
  }

  /// Signs in with an answer the server already gave (business sign-up without two-step).
  Future<void> signedInWith(Json r) => _signedIn(r);

  Future<void> refreshMe() async {
    user = await api.getJson('/api/me');
    notifyListeners();
  }

  void setBusiness(String name, String logo, Color color) {
    if (name == businessName && logo == businessLogo && color == brand) return;
    businessName = name;
    businessLogo = logo;
    brand = color;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.post('/api/logout');
    } catch (_) {}
    await _clear();
    notifyListeners();
  }

  Future<void> _clear() async {
    api.token = null;
    user = null;
    _features = null;
    businessName = '';
    businessLogo = '';
    brand = Tk.bqueePurple;
    await Native.removeSecret('token');
    await Native.removePref('token');
    await Native.removePref('user_role');
    await Native.removePref('user_name');
  }

  void _expired() {
    if (user == null) return;
    _clear().then((_) => notifyListeners());
  }
}

final Session session = Session();
