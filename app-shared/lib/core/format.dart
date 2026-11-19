// Formatting helpers matching the web app (money, token numbers, waits, dates, statuses).

import 'json.dart';

String money(num value, [String currency = '₹']) {
  final neg = value < 0;
  final v = value.abs();
  final whole = v.truncate();
  final frac = ((v - whole) * 100).round();
  final s = whole.toString();
  // Indian-style grouping for ₹ (12,34,567), otherwise thousands (1,234,567).
  final buf = StringBuffer();
  if (currency.trim() == '₹' && s.length > 3) {
    final last3 = s.substring(s.length - 3);
    var rest = s.substring(0, s.length - 3);
    final parts = <String>[];
    while (rest.length > 2) {
      parts.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) parts.insert(0, rest);
    buf.write(parts.join(','));
    buf.write(',');
    buf.write(last3);
  } else {
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
  }
  final f = frac > 0 ? '.${frac.toString().padLeft(2, '0')}' : '';
  return '${neg ? '−' : ''}${currency.isEmpty ? '₹' : currency}$buf$f';
}

String tokenNo(Json t) {
  final prefix = t.s('prefix');
  final n = t.i('number').toString().padLeft(3, '0');
  return prefix.isEmpty ? '#$n' : '$prefix-$n';
}

String waitText(num minutes) {
  final m = minutes.round();
  if (m <= 0) return 'no wait';
  if (m < 60) return '$m min';
  final h = m ~/ 60, r = m % 60;
  return r == 0 ? '$h h' : '$h h $r min';
}

String two(int v) => v.toString().padLeft(2, '0');

String clock(int ms) {
  if (ms <= 0) return '';
  final t = DateTime.fromMillisecondsSinceEpoch(ms);
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  return '$h:${two(t.minute)} ${t.hour < 12 ? 'AM' : 'PM'}';
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "2026-11-15" → "Nov 15, 2026".
String dayText(String iso) {
  if (iso.length < 10) return iso;
  final y = int.tryParse(iso.substring(0, 4)),
      mo = int.tryParse(iso.substring(5, 7)),
      d = int.tryParse(iso.substring(8, 10));
  if (y == null || mo == null || d == null || mo < 1 || mo > 12) return iso;
  return '${_months[mo - 1]} $d, $y';
}

String todayIso() {
  final t = DateTime.now();
  return '${t.year}-${two(t.month)}-${two(t.day)}';
}

String isoOf(DateTime t) => '${t.year}-${two(t.month)}-${two(t.day)}';

String plural(int n, String one, [String? many]) => '$n ${n == 1 ? one : (many ?? '${one}s')}';

const Map<String, String> kStatusText = {
  'waiting': 'Waiting',
  'serving': 'In service',
  'in_progress': 'In service',
  'done': 'Completed',
  'cancelled': 'Cancelled',
  'missed': 'Expired',
  'removed': 'Removed',
};

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts[0].substring(0, parts[0].length >= 2 ? 2 : 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

String offerLabel(Json offer, String currency) {
  final t = offer.s('discountType', 'none');
  if (t == 'percent')
    return '${offer.d('discountValue').toStringAsFixed(offer.d('discountValue') % 1 == 0 ? 0 : 1)}% off';
  if (t == 'flat') return '${money(offer.d('discountValue'), currency)} off';
  return '';
}

/// Token ID from a scanned QR: a token link (…/t/<id>) or a bare token id.
String? tokenIdFromCode(String code) {
  final s = code.trim();
  final m =
      RegExp(r'/t/([A-Za-z0-9]{6,32})(?:[/?#]|$)').firstMatch(s) ?? RegExp(r'^([a-fA-F0-9]{8,32})$').firstMatch(s);
  return m?.group(1);
}

bool isBranchCode(String code) => RegExp(r'/b/[A-Za-z0-9]+').hasMatch(code);

/// A BQuee business QR code: a branch (/b/<id>) or a business page (/s/<link>). Null for other codes.
({String kind, String id})? placeFromCode(String code) {
  final s = code.trim();
  final b = RegExp(r'/b/([A-Za-z0-9_-]{4,40})(?:[/?#]|$)').firstMatch(s);
  if (b != null) return (kind: 'branch', id: b.group(1)!);
  final p = RegExp(r'/s/([a-z0-9-]{1,80})(?:[/?#]|$)').firstMatch(s);
  if (p != null) return (kind: 'business', id: p.group(1)!);
  return null;
}

/// Google Maps search for an address (opens in the phone's maps app or browser).
String mapLink(String address) => 'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(address)}';
