// Page scaffolding shared by every role: loading wrapper, brand header, account sheet.

import 'dart:async';

import 'package:bquee_shared/screens/legal.dart';
import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/screens/account_request.dart';
import 'package:bquee_shared/screens/notes.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../core/session.dart';
import 'profile.dart';

/// Loads data with [load], shows loading / error states, supports pull-to-refresh and an
/// optional auto-refresh [every] (for live queues).
class Loaded<T> extends StatefulWidget {
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final Duration? every;
  const Loaded({super.key, required this.load, required this.builder, this.every});

  @override
  State<Loaded<T>> createState() => LoadedState<T>();
}

class LoadedState<T> extends State<Loaded<T>> {
  T? data;
  Object? error;
  Timer? timer;

  @override
  void initState() {
    super.initState();
    reload();
    if (widget.every != null) {
      timer = Timer.periodic(widget.every!, (_) {
        if (mounted && error == null) reload(quiet: true);
      });
    }
  }

  Future<void> reload({bool quiet = false}) async {
    try {
      final d = await widget.load();
      if (!mounted) return;
      setState(() {
        data = d;
        error = null;
      });
    } catch (e) {
      if (!mounted) return;
      if (!quiet || data == null) setState(() => error = e);
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (data == null && error == null) return const Center(child: CircularProgressIndicator());
    if (data == null) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          ErrorView(
            error!,
            onRetry: () {
              setState(() => error = null);
              reload();
            },
          ),
        ],
      );
    }
    return widget.builder(context, data as T, () => reload());
  }
}

/// Scrollable page with the brand header (title, subtitle, actions) and pull-to-refresh.
class PageScroll extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> actions;
  final Future<void> Function()? onRefresh;
  final List<Widget> children;
  final Widget? headerExtra;
  const PageScroll({
    super.key,
    required this.title,
    this.subtitle,
    this.actions = const [],
    this.onRefresh,
    required this.children,
    this.headerExtra,
  });

  @override
  Widget build(BuildContext context) {
    final scroll = CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: BrandHeader(title: title, subtitle: subtitle, actions: actions, extra: headerExtra),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          sliver: SliverList(delegate: SliverChildListDelegate(children)),
        ),
      ],
    );
    // Soft brand-tinted backdrop behind the cards.
    final b = brandOf(context);
    final bg = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [mix(b.c, 0.09, Tk.canvas), Tk.canvas, mix(b.rose, 0.05, Tk.canvas)],
          stops: const [0, 0.45, 1],
        ),
      ),
      child: scroll,
    );
    final top = MediaQuery.of(context).padding.top;
    final body = onRefresh == null
        ? bg
        : RefreshIndicator(onRefresh: onRefresh!, color: b.c, edgeOffset: top, child: bg);
    // Content scrolling up never runs under the status bar icons.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Stack(
        children: [
          Positioned.fill(child: body),
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: top,
            child: IgnorePointer(
              child: DecoratedBox(decoration: BoxDecoration(color: mix(b.c, 0.62, const Color(0xFF160B22)))),
            ),
          ),
        ],
      ),
    );
  }
}

class BrandHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> actions;
  final Widget? extra;
  const BrandHeader({super.key, required this.title, this.subtitle, this.actions = const [], this.extra});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final user = session.user ?? <String, dynamic>{};
    final name = session.isPlatform
        ? 'BQuee'
        : (session.businessName.isEmpty ? user.s('salonName', 'BQuee') : session.businessName);
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [mix(b.c, 0.62, const Color(0xFF160B22)), mix(b.c, 0.85, b.rose)],
        ),
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(Tk.rXl)),
        boxShadow: [BoxShadow(color: fade(b.c, 0.35), blurRadius: 30, offset: const Offset(0, 12), spreadRadius: -16)],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -50,
            top: -60,
            child: Container(
              width: 190,
              height: 190,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: fade(Colors.white, 0.07), width: 26),
              ),
            ),
          ),
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 10, 14, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (session.isPlatform)
                        // BQuee's own logo for the super admin and the BQuee team.
                        Expanded(
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Image.asset('assets/brand/logo-light.png', height: 30, semanticLabel: 'BQuee'),
                          ),
                        )
                      else ...[
                        BizMark(logo: session.businessLogo, color: b.c, size: 36, onDark: true),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontFamily: Tk.serif,
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                      NotesBell(feed: notes, onDark: true),
                      const SizedBox(width: 4),
                      GestureDetector(
                        onTap: () => showAccountSheet(context),
                        child: Container(
                          padding: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: fade(Colors.white, 0.5), width: 1.5),
                          ),
                          child: Avatar(user.s('name', '?'), size: 34),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: const TextStyle(
                                fontFamily: Tk.serif,
                                color: Colors.white,
                                fontSize: 27,
                                fontWeight: FontWeight.w600,
                                letterSpacing: -0.3,
                              ),
                            ),
                            if (subtitle != null && subtitle!.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text(
                                  subtitle!,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: fade(Colors.white, 0.78), fontSize: 13),
                                ),
                              ),
                          ],
                        ),
                      ),
                      ...actions,
                    ],
                  ),
                  if (extra != null) Padding(padding: const EdgeInsets.only(top: 16), child: extra!),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// White round action button for the header.
class HeaderAction extends StatelessWidget {
  final String icon;
  final String tooltip;
  final VoidCallback onPressed;
  final String? label;
  const HeaderAction(this.icon, {super.key, required this.tooltip, required this.onPressed, this.label});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Padding(
      padding: const EdgeInsets.only(left: 8),
      child: Tooltip(
        message: tooltip,
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(99),
          elevation: 0,
          child: InkWell(
            borderRadius: BorderRadius.circular(99),
            onTap: onPressed,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: label == null ? 11 : 14, vertical: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AppIcon(icon, size: 19, color: b.ink, stroke: 2),
                  if (label != null) ...[
                    const SizedBox(width: 6),
                    Text(
                      label!,
                      style: TextStyle(color: b.ink, fontWeight: FontWeight.w600, fontSize: 13.5),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

const Map<String, String> kRoleLabel = {
  'superadmin': 'Super admin',
  'platform_staff': 'BQuee team',
  'owner': 'Service owner',
  'staff': 'Staff',
};

Future<void> showAccountSheet(BuildContext context) {
  final user = session.user ?? <String, dynamic>{};
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) {
      Widget item(String icon, String label, VoidCallback onTap, {bool danger = false}) => ListTile(
        leading: AppIcon(icon, size: 22, color: danger ? Tk.badFg : Tk.ink2),
        title: Text(
          label,
          style: TextStyle(fontWeight: FontWeight.w500, color: danger ? Tk.badFg : Tk.ink),
        ),
        onTap: onTap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tk.r)),
      );
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Avatar(user.s('name', '?'), size: 52),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.s('name'),
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Tk.ink),
                        ),
                        Text(
                          [
                            kRoleLabel[user.s('role')] ?? '',
                            user.s('salonName'),
                          ].where((x) => x.isNotEmpty).join(' · '),
                          style: const TextStyle(color: Tk.ink3, fontSize: 13),
                        ),
                        Text(
                          user.s('email').isNotEmpty ? user.s('email') : '@${user.s('username')}',
                          style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              const Divider(),
              const SizedBox(height: 6),
              item('user', 'Edit profile', () {
                Navigator.pop(ctx);
                openProfile(context);
              }),
              item('lock', session.user?['hasPassword'] == false ? 'Set a password' : 'Change password', () {
                Navigator.pop(ctx);
                openPassword(context);
              }),
              item('shield', 'Sign-in security', () {
                Navigator.pop(ctx);
                openSecurity(context);
              }),
              if (session.role != 'superadmin')
                item('trash', 'Delete or deactivate account', () {
                  Navigator.pop(ctx);
                  openAccountRequest(context, session.role);
                }),
              item('eye', 'Privacy Policy', () {
                Navigator.pop(ctx);
                openPrivacy(context);
              }),
              item('list', 'Terms and Conditions', () {
                Navigator.pop(ctx);
                openTerms(context);
              }),
              item('logout', 'Sign out', () async {
                Navigator.pop(ctx);
                final ok = await confirmDialog(
                  context,
                  title: 'Sign out?',
                  message: 'You can sign in again any time.',
                  confirm: 'Sign out',
                );
                if (!ok) return;
                session.navigatorKey.currentState?.popUntil((r) => r.isFirst);
                await session.logout();
              }, danger: true),
            ],
          ),
        ),
      );
    },
  );
}

/// Runs an API action with a toast for success or failure. Returns the response or null.
Future<dynamic> runAction(BuildContext context, Future<dynamic> Function() fn, {String? done}) async {
  try {
    final r = await fn();
    if (context.mounted) {
      final msg = done ?? (r is Map && r['message'] != null ? r['message'].toString() : null);
      if (msg != null) toast(context, msg);
    }
    return r ?? true;
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
  } catch (e) {
    if (context.mounted) showError(context, e);
  }
  return null;
}
