// App layout: bottom navigation for the main sections, a "More" sheet for the rest.

import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'common.dart';

class NavItem {
  final String id;
  final String label;
  final String icon;
  final Widget Function() builder;
  final bool primary;
  final int badge;
  const NavItem(this.id, this.label, this.icon, this.builder, {this.primary = true, this.badge = 0});
}

class AppShell extends StatefulWidget {
  final List<NavItem> items;
  final Widget? fab;
  const AppShell({super.key, required this.items, this.fab});

  @override
  State<AppShell> createState() => AppShellState();
}

class AppShellState extends State<AppShell> {
  String current = '';
  final Map<String, Widget> _pages = {};

  void go(String id) {
    if (widget.items.any((i) => i.id == id)) setState(() => current = id);
  }

  @override
  void initState() {
    super.initState();
    // Signed in: start checking for notifications (status bar + the bell in the header).
    notes.start(session.api, '/api/notifications', 'token');
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final items = widget.items;
    if (current.isEmpty || !items.any((i) => i.id == current)) current = items.first.id;
    final primary = items.where((i) => i.primary).take(4).toList();
    final more = items.where((i) => !primary.contains(i)).toList();
    final page = _pages.putIfAbsent(current, () => items.firstWhere((i) => i.id == current).builder());
    final inPrimary = primary.indexWhere((i) => i.id == current);
    final selected = inPrimary >= 0 ? inPrimary : primary.length;

    Widget icon(NavItem i, bool on) {
      final ic = AppIcon(i.icon, size: 22, color: on ? b.ink : Tk.ink3, stroke: on ? 2.1 : 1.8);
      if (i.badge <= 0) return ic;
      return Badge(label: Text('${i.badge}'), backgroundColor: b.rose, child: ic);
    }

    return Scaffold(
      body: KeyedSubtree(key: ValueKey(current), child: page),
      floatingActionButton: widget.fab,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(color: fade(b.c, 0.12), blurRadius: 24, offset: const Offset(0, -6), spreadRadius: -10),
          ],
        ),
        child: NavigationBar(
          selectedIndex: selected,
          onDestinationSelected: (idx) {
            if (idx < primary.length) {
              setState(() => current = primary[idx].id);
            } else {
              _showMore(context, more);
            }
          },
          destinations: [
            for (final i in primary)
              NavigationDestination(icon: icon(i, false), selectedIcon: icon(i, true), label: i.label),
            if (more.isNotEmpty)
              NavigationDestination(
                icon: AppIcon('menu', size: 22, color: Tk.ink3),
                selectedIcon: AppIcon('menu', size: 22, color: b.ink, stroke: 2.1),
                label: 'More',
              ),
          ],
        ),
      ),
    );
  }

  void _showMore(BuildContext context, List<NavItem> more) {
    final b = brandOf(context);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.only(left: 6, bottom: 8),
                child: Text(
                  'More',
                  style: TextStyle(fontFamily: Tk.serif, fontSize: 20, fontWeight: FontWeight.w600, color: Tk.ink),
                ),
              ),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.05,
                children: [
                  for (final i in more)
                    InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () {
                        Navigator.pop(ctx);
                        setState(() => current = i.id);
                      },
                      child: Container(
                        decoration: BoxDecoration(
                          color: i.id == current ? b.tint : b.wash,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: i.id == current ? b.lineC : Colors.transparent),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(gradient: b.gradBtn, borderRadius: BorderRadius.circular(14)),
                              alignment: Alignment.center,
                              child: AppIcon(i.icon, size: 22, color: Colors.white, stroke: 2),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              i.label,
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Tk.ink),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Btn(
                'My account',
                icon: 'user',
                kind: BtnKind.soft,
                onPressed: () {
                  Navigator.pop(ctx);
                  showAccountSheet(context);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
