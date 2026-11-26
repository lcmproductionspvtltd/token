// Page scaffolding: loading wrapper, brand header, header buttons, actions with toasts.

import 'dart:async';

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/screens/notes.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../core/session.dart';

/// Loads data with [load], shows loading / error states, supports pull-to-refresh and an
/// optional auto-refresh [every] (for live queues).
class Loaded<T> extends StatefulWidget {
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final Duration? every;

  /// Wraps the loading and error views (e.g. a page with a back button) until data arrives.
  final Widget Function(Widget child)? frame;
  const Loaded({super.key, required this.load, required this.builder, this.every, this.frame});

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
    final frame = widget.frame ?? ((Widget c) => c);
    if (data == null && error == null) return frame(const Center(child: CircularProgressIndicator()));
    if (data == null) {
      return frame(
        ListView(
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
        ),
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
    const name = 'BQuee';
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
                      Expanded(
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Image.asset('assets/brand/logo-light.png', height: 30, semanticLabel: name),
                        ),
                      ),
                      if (session.signedIn) ...[NotesBell(feed: notes, onDark: true), const SizedBox(width: 4)],
                      GestureDetector(
                        onTap: () => session.goTab?.call('profile'),
                        child: Container(
                          padding: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: fade(Colors.white, 0.5), width: 1.5),
                          ),
                          child: Avatar(session.name.isEmpty ? '?' : session.name, photo: session.photo, size: 34),
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

/// Plain page with a back button, used around [Loaded] while a full-screen page loads.
Widget loadingPage(Widget child) => Scaffold(
  backgroundColor: Tk.canvas,
  appBar: AppBar(backgroundColor: Colors.white),
  body: child,
);
