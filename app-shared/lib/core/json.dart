// Small helpers for reading the server's JSON safely.

typedef Json = Map<String, dynamic>;

extension JsonRead on Map<String, dynamic> {
  String s(String k, [String fallback = '']) {
    final v = this[k];
    if (v == null) return fallback;
    return v is String ? v : v.toString();
  }

  int i(String k, [int fallback = 0]) {
    final v = this[k];
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? fallback;
    return fallback;
  }

  double d(String k, [double fallback = 0]) {
    final v = this[k];
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? fallback;
    return fallback;
  }

  bool b(String k, [bool fallback = false]) {
    final v = this[k];
    if (v is bool) return v;
    if (v is String) return v == 'true';
    return fallback;
  }

  Json m(String k) {
    final v = this[k];
    return v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
  }

  Json? mn(String k) {
    final v = this[k];
    return v is Map ? Map<String, dynamic>.from(v) : null;
  }

  List<Json> l(String k) {
    final v = this[k];
    if (v is! List) return <Json>[];
    return v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  List<String> ls(String k) {
    final v = this[k];
    if (v is! List) return <String>[];
    return v.map((e) => e.toString()).toList();
  }
}

Json asJson(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Json> asJsonList(dynamic v) =>
    v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : <Json>[];
