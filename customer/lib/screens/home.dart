// Signed-in layout: Explore, Scan (opens the camera), My tokens and Profile.

import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../core/session.dart';
import 'book.dart';
import 'business.dart';
import 'explore.dart';
import 'profile.dart';
import 'scanner.dart';
import 'tokens.dart';

/// Scans a business QR code and opens it: a branch QR goes straight to booking,
/// a business-page QR shows the business with its branches.
Future<void> scanAndOpen(BuildContext context) async {
  final place = await scanBusiness(context);
  if (place == null || !context.mounted) return;
  if (place.kind == 'branch') {
    await openBooking(context, place.id);
  } else {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => BusinessScreen(slug: place.id)));
  }
}

class CustomerHome extends StatefulWidget {
  const CustomerHome({super.key});

  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _CustomerHomeState extends State<CustomerHome> {
  static const _tabs = ['explore', 'scan', 'tokens', 'profile'];
  String current = 'explore';
  final Map<String, Widget> _pages = {};

  @override
  void initState() {
    super.initState();
    session.goTab = (t) {
      if (mounted && _tabs.contains(t) && t != 'scan') setState(() => current = t);
    };
  }

  @override
  void dispose() {
    session.goTab = null;
    super.dispose();
  }

  Widget _page(String id) => switch (id) {
    'tokens' => const MyTokensScreen(),
    'profile' => const ProfileScreen(),
    _ => const ExploreScreen(),
  };

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    // The tokens list rebuilds after each booking so it is never stale.
    final key = current == 'tokens' ? 'tokens-${session.tokensVersion}' : current;
    final page = _pages.putIfAbsent(key, () => _page(current));

    Widget icon(String name, bool on) => AppIcon(name, size: 22, color: on ? b.ink : Tk.ink3, stroke: on ? 2.1 : 1.8);

    return Scaffold(
      body: KeyedSubtree(key: ValueKey(key), child: page),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(color: fade(b.c, 0.12), blurRadius: 24, offset: const Offset(0, -6), spreadRadius: -10),
          ],
        ),
        child: NavigationBar(
          selectedIndex: _tabs.indexOf(current),
          onDestinationSelected: (i) {
            final id = _tabs[i];
            if (id == 'scan') {
              HapticFeedback.selectionClick();
              scanAndOpen(context);
              return;
            }
            setState(() => current = id);
          },
          destinations: [
            NavigationDestination(icon: icon('home', false), selectedIcon: icon('home', true), label: 'Explore'),
            NavigationDestination(
              icon: Container(
                width: 46,
                height: 34,
                decoration: BoxDecoration(
                  gradient: b.gradBtn,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [BoxShadow(color: b.glow, blurRadius: 12, offset: const Offset(0, 4), spreadRadius: -4)],
                ),
                alignment: Alignment.center,
                child: const AppIcon('qr', size: 20, color: Colors.white, stroke: 2),
              ),
              label: 'Scan',
            ),
            NavigationDestination(icon: icon('ticket', false), selectedIcon: icon('ticket', true), label: 'My tokens'),
            NavigationDestination(icon: icon('user', false), selectedIcon: icon('user', true), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
