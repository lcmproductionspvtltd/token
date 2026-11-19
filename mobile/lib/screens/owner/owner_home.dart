// Service owner app: overview, tokens, services, staff, reports, branches & QR, offers, reviews, profile.

import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../reports.dart';
import '../scanner.dart';
import '../shell.dart';
import '../support.dart';
import '../token_detail.dart';
import 'branches.dart';
import 'marketing.dart';
import 'overview.dart';
import 'services.dart';
import 'settings.dart';
import 'staff.dart';
import 'tokens.dart';

/// Loads the owner dashboard data and paints the app in the business's colour.
Future<Json> loadOwner() async {
  final d = await session.api.getJson('/api/owner/data');
  final s = d.m('salon');
  session.setBusiness(s.s('name'), s.s('logo'), parseHexColor(s.s('color')));
  session.setFeatures(d.m('features'));
  return d;
}

/// Owner scan: opens the scanned customer's token.
Future<void> ownerScan(BuildContext context) async {
  final id = await scanToken(context, title: 'Scan a customer’s token');
  if (id != null && context.mounted) await openToken(context, id);
}

class OwnerHome extends StatelessWidget {
  const OwnerHome({super.key});

  @override
  Widget build(BuildContext context) {
    // Menus the super admin switched off for this business are left out (Overview is always on).
    final on = session.menuOn;
    return AppShell(
      items: [
        NavItem('overview', 'Overview', 'home', () => const OwnerOverview()),
        if (on('tokens')) NavItem('tokens', 'Tokens', 'list', () => const OwnerTokens()),
        if (on('services')) NavItem('services', 'Services', 'tag', () => const OwnerServices()),
        if (on('staff')) NavItem('staff', 'Staff', 'users', () => const OwnerStaff()),
        if (on('reports'))
          NavItem('reports', 'Reports', 'chart', () => const ReportsScreen(kind: 'owner'), primary: false),
        if (on('branches')) NavItem('branches', 'Branches & QR', 'qr', () => const OwnerBranches(), primary: false),
        if (on('offers')) NavItem('offers', 'Offers', 'gift', () => const OwnerOffers(), primary: false),
        if (on('reviews')) NavItem('reviews', 'Reviews', 'star', () => const OwnerReviews(), primary: false),
        if (on('settings'))
          NavItem('settings', 'Business profile', 'gear', () => const OwnerSettings(), primary: false),
        NavItem('support', 'Help & support', 'chat', () => const SupportScreen(team: false), primary: false),
      ],
    );
  }
}
