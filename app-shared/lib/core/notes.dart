// Notifications for the signed-in person (both apps).
//
// Light on the server: while the app is open it asks "anything after #id?" every 30 seconds (the
// usual answer is an empty list); in the background it stops, and the phone's own check takes over
// (about every 15 minutes on Android, when iOS allows on iPhone – see Notes.kt / AppDelegate.swift).
// New ones are shown in the status bar; the bell lists them.

import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/widgets.dart';

import 'api.dart';
import 'json.dart';
import 'native.dart';

class NotesFeed extends ChangeNotifier with WidgetsBindingObserver {
  final Duration every;
  NotesFeed({this.every = const Duration(seconds: 30)});

  Api? _api;
  String _path = '';
  Timer? _timer;
  bool _busy = false;
  int _shown = 0; // newest id already shown in the status bar (-1: never on this phone)

  List<Json> items = [];
  int unread = 0;
  int last = 0;
  bool loaded = false;

  bool get running => _api != null;

  /// Starts after sign-in. `path` is the server list ('/api/notifications' or the customer one) and
  /// `secretKey` the name the sign-in token is saved under (for the phone's background check).
  Future<void> start(Api api, String path, String secretKey) async {
    if (_api != null) return;
    if (Platform.environment.containsKey('FLUTTER_TEST')) return; // widget tests: no timers or network
    _api = api;
    _path = path;
    WidgetsBinding.instance.addObserver(this);
    _shown = int.tryParse(await Native.getPref('notes_after') ?? '') ?? -1;
    await Native.notesAsk();
    await check();
    if (_api == null) return; // signed out meanwhile
    await Native.notesWatch(api.base, path, secretKey, last);
    _timer = Timer.periodic(every, (_) => check());
  }

  /// Signed out: stop checking and clear everything (also the status bar).
  Future<void> stop() async {
    _timer?.cancel();
    _timer = null;
    if (_api != null) WidgetsBinding.instance.removeObserver(this);
    _api = null;
    items = [];
    unread = 0;
    last = 0;
    loaded = false;
    notifyListeners();
    await Native.notesStop();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_api == null) return;
    if (state == AppLifecycleState.resumed) {
      check();
      _timer ??= Timer.periodic(every, (_) => check());
    } else if (state == AppLifecycleState.paused) {
      _timer?.cancel(); // the phone's own background check takes over
      _timer = null;
    }
  }

  /// One "anything new?" check.
  Future<void> check() async {
    final api = _api;
    if (api == null || _busy) return;
    _busy = true;
    try {
      final r = await api.getJson(last > 0 ? '$_path?after=$last' : _path);
      if (_api == null) return;
      final fresh = r.l('items');
      if (fresh.isNotEmpty) {
        items = [
          ...fresh,
          ...items.where((o) => !fresh.any((f) => f.i('id') == o.i('id'))),
        ].take(50).toList();
        if (fresh.first.i('id') > last) last = fresh.first.i('id');
      }
      if (r['unread'] is num) unread = (r['unread'] as num).toInt();
      if (last == 0 && r['last'] is num) last = (r['last'] as num).toInt();
      if (_shown < 0) {
        _shown = last; // first time on this phone: don't replay old ones
      } else {
        final show = fresh.where((n) => n.i('id') > _shown).take(3).toList().reversed;
        for (final n in show) {
          await Native.notify(n.i('id'), n.s('title'), n.s('body'));
        }
        if (last > _shown) _shown = last;
      }
      await Native.notesSeen(_shown);
      loaded = true;
      notifyListeners();
    } catch (_) {
      // offline or the server is busy: try again next time
    } finally {
      _busy = false;
    }
  }

  /// The bell was opened: everything so far is read.
  Future<void> markRead() async {
    if (unread == 0) return;
    unread = 0;
    notifyListeners();
    try {
      await _api?.post('$_path/read', {'upTo': last});
    } catch (_) {}
  }
}

/// "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago"
String timeAgo(String iso, [DateTime? now]) {
  final at = DateTime.tryParse(iso);
  if (at == null) return '';
  final s = (now ?? DateTime.now()).difference(at).inSeconds;
  if (s < 60) return 'just now';
  if (s < 3600) return '${s ~/ 60} min ago';
  if (s < 86400) return '${s ~/ 3600} h ago';
  final d = s ~/ 86400;
  return d == 1 ? 'yesterday' : '$d days ago';
}
