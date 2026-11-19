// BQuee – app for super admins, the BQuee team, service owners and staff.
// Same backend and design as the web app. Self-contained: bundled fonts and icons, no plugins.

import 'package:bquee_shared/ui/theme.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'core/session.dart';
import 'screens/admin/admin_home.dart';
import 'screens/login.dart';
import 'screens/owner/owner_home.dart';
import 'screens/staff/staff_home.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent));
  runApp(const BQueeApp());
  session.init();
}

class BQueeApp extends StatelessWidget {
  const BQueeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: session,
      builder: (context, _) => MaterialApp(
        title: 'BQuee Biz',
        debugShowCheckedModeBanner: false,
        navigatorKey: session.navigatorKey,
        theme: buildTheme(session.brand),
        home: !session.ready
            ? const _Splash()
            : !session.signedIn
            ? const LoginScreen()
            : const _RoleHome(),
      ),
    );
  }
}

class _RoleHome extends StatelessWidget {
  const _RoleHome();

  @override
  Widget build(BuildContext context) {
    switch (session.role) {
      case 'superadmin':
      case 'platform_staff':
        return const AdminHome();
      case 'owner':
        return const OwnerHome();
      case 'staff':
        return const StaffHome();
      default:
        return const LoginScreen();
    }
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    // Same as the phone's own launch screen: BQuee purple with the white logo.
    return Scaffold(
      backgroundColor: const Color(0xFF663687),
      body: Center(child: Image.asset('assets/brand/logo-light.png', width: 232, semanticLabel: 'BQuee')),
    );
  }
}
