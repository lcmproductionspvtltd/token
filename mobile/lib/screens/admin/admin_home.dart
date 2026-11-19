// Super admin and BQuee team app: businesses, categories, reports, default services, team, website,
// account requests.

import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../reports.dart';
import '../shell.dart';
import '../support.dart';
import 'account_requests.dart';
import 'businesses.dart';
import 'catalog_admin.dart';
import 'customers.dart';
import 'team.dart';
import 'website.dart';

class AdminHome extends StatelessWidget {
  const AdminHome({super.key});

  @override
  Widget build(BuildContext context) {
    final isSuper = session.role == 'superadmin';
    return AppShell(
      items: [
        NavItem('salons', 'Businesses', 'store', () => const AdminBusinesses()),
        NavItem('categories', 'Categories', 'grid', () => const AdminCategories()),
        NavItem('reports', 'Reports', 'chart', () => const ReportsScreen(kind: 'admin')),
        NavItem('services', 'Defaults', 'tag', () => const AdminDefaultServices(), primary: !isSuper),
        if (isSuper) NavItem('team', 'Team', 'users', () => const AdminTeam()),
        NavItem('customers', 'Customers', 'user', () => const AdminCustomers(), primary: false),
        NavItem('support', 'Support tickets', 'chat', () => const SupportScreen(team: true), primary: false),
        if (isSuper)
          NavItem('accounts', 'Account requests', 'shield', () => const AdminAccountRequests(), primary: false),
        if (isSuper) NavItem('site', 'Website', 'globe', () => const AdminWebsite(), primary: false),
      ],
    );
  }
}
