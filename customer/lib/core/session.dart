// The signed-in customer. Customer accounts are separate from business and admin accounts
// and use their own sign-in (/api/customer/...) on the same BQuee server.

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
  bool ready = false;

  /// Bumped after a booking so the "My tokens" list reloads.
  int tokensVersion = 0;

  /// Switches the bottom tab (set by the home shell).
  void Function(String tab)? goTab;

  final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  bool get signedIn => user != null;
  String get name => user?.s('name') ?? '';
  String get photo => user?.s('photo') ?? '';

  /// The sign-in token is kept in the phone's secure storage – Android Keystore / iOS Keychain (audit
  /// F-01). Older versions kept it in plain preferences: it is moved once and swapped for a new one.
  Future<void> init() async {
    api.onUnauthorized = _expired;
    var token = await Native.getSecret('c_token');
    var moved = false;
    // Older versions kept the token in plain app preferences: move it into secure storage once,
    // and always delete the plain copy – even when a secure one already exists.
    final old = await Native.getPref('c_token');
    if (old != null) await Native.removePref('c_token');
    if ((token == null || token.isEmpty) && old != null && old.isNotEmpty) {
      token = old;
      moved = true;
    }
    if (token != null && token.isNotEmpty) {
      api.token = token;
      if (moved) {
        try {
          final r = asJson(await api.post('/api/customer/session/rotate'));
          if (r.s('token').isNotEmpty) api.token = r.s('token');
        } catch (_) {
          // offline or expired: the check below sorts it out
        }
        await Native.setSecret('c_token', api.token!);
      }
      try {
        user = await api.getJson('/api/customer/me');
      } on ApiException catch (e) {
        if (e.status == 401 || e.status == 403) {
          await _clear();
        } else {
          // Offline: keep the saved session; screens show their own "no connection" message.
          user = {'name': await Native.getPref('c_name') ?? ''};
        }
      }
    }
    ready = true;
    notifyListeners();
  }

  Future<void> _start(dynamic response) async {
    final r = asJson(response);
    api.token = r.s('token');
    user = r.m('customer');
    await Native.setSecret('c_token', api.token!);
    await Native.setPref('c_name', name);
    notifyListeners();
  }

  Future<void> signIn(String login, String password) async {
    api.token = null;
    await _start(await api.post('/api/customer/login', {'login': login.trim(), 'password': password}));
  }

  Future<void> signUp({
    required String name,
    required String mobile,
    required String email,
    required String password,
    String photo = '',
  }) async {
    api.token = null;
    await _start(
      await api.post('/api/customer/signup', {
        'name': name.trim(),
        'mobile': mobile.trim(),
        'email': email.trim(),
        'password': password,
        if (photo.isNotEmpty) 'photo': photo,
      }),
    );
  }

  Future<void> saveProfile(Map<String, dynamic> changes) async {
    user = asJson(await api.put('/api/customer/me', changes));
    await Native.setPref('c_name', name);
    notifyListeners();
  }

  void bookedToken() {
    tokensVersion++;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.post('/api/customer/logout');
    } catch (_) {}
    await _clear();
    notifyListeners();
  }

  Future<void> _clear() async {
    api.token = null;
    user = null;
    await Native.removeSecret('c_token');
    await Native.removePref('c_token');
    await Native.removePref('c_name');
  }

  void _expired() {
    if (user == null) return;
    _clear().then((_) => notifyListeners());
  }
}

final Session session = Session();
