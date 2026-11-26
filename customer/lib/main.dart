// BQuee Customer – find a business or scan its QR code, book a token, follow the queue.
// Same server and design as the BQuee web app and business app. Self-contained: bundled fonts
// and icons, our own QR code reader, no plugins.

import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets/keyboard.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'core/session.dart';
import 'screens/auth.dart';
import 'screens/home.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent));
  runApp(const BQueeCustomerApp());
  session.init();
}

class BQueeCustomerApp extends StatelessWidget {
  const BQueeCustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: session,
      builder: (context, _) => MaterialApp(
        title: 'BQuee',
        debugShowCheckedModeBanner: false,
        navigatorKey: session.navigatorKey,
        theme: buildTheme(session.brand),
        // Tapping anywhere outside a text field closes the keyboard (search boxes and forms).
        builder: (context, child) => TapToCloseKeyboard(child: child ?? const SizedBox.shrink()),
        home: !session.ready
            ? const _Splash()
            : !session.signedIn
            ? const AuthScreen()
            : const CustomerHome(),
      ),
    );
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
