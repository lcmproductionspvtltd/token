// Pages of long lists – same behaviour as the web lists.
// Part of the shared widgets – apps import them all through ui/widgets.dart.

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../icons.dart';
import '../theme.dart';
import 'cards.dart';

/* ---------- pagination (same behaviour as the web lists) ---------- */

class PagerBar extends StatelessWidget {
  final int page, pages, total, from, to;
  final ValueChanged<int> onPage;
  const PagerBar({
    super.key,
    required this.page,
    required this.pages,
    required this.total,
    required this.from,
    required this.to,
    required this.onPage,
  });

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    Widget arrow(String icon, bool enabled, int target) => IconButton(
      onPressed: enabled ? () => onPage(target) : null,
      icon: AppIcon(icon, size: 18, color: enabled ? b.ink : Tk.line2, stroke: 2.2),
      visualDensity: VisualDensity.compact,
      tooltip: icon == 'prev' ? 'Previous page' : 'Next page',
    );
    final nums = <int>[];
    for (var p = 1; p <= pages; p++) {
      if (p == 1 || p == pages || (p - page).abs() <= 1) nums.add(p);
    }
    final children = <Widget>[];
    int? last;
    for (final p in nums) {
      if (last != null && p - last > 1)
        children.add(
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 2),
            child: Text('…', style: TextStyle(color: Tk.ink3)),
          ),
        );
      final on = p == page;
      children.add(
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: Material(
            color: on ? Colors.transparent : b.wash,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: on ? null : () => onPage(p),
              child: Ink(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: on ? b.gradBtn : null,
                  boxShadow: on
                      ? [BoxShadow(color: fade(b.c, 0.4), blurRadius: 12, offset: const Offset(0, 5), spreadRadius: -5)]
                      : null,
                ),
                child: Center(
                  child: Text(
                    '$p',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, color: on ? Colors.white : b.ink),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      last = p;
    }
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$from–$to of $total',
                  style: const TextStyle(color: Tk.ink2, fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
                if (pages > 1) Text('Page $page of $pages', style: const TextStyle(color: Tk.ink3, fontSize: 11.5)),
              ],
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(99),
              border: Border.all(color: b.lineC),
              boxShadow: [
                BoxShadow(color: fade(b.c, 0.12), blurRadius: 18, offset: const Offset(0, 8), spreadRadius: -10),
              ],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 3),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [arrow('prev', page > 1, page - 1), ...children, arrow('next', page < pages, page + 1)],
            ),
          ),
        ],
      ),
    );
  }
}

/// Splits [all] into pages of [size]; [build] renders the current page's items plus the bar.
class PagedColumn<T> extends StatefulWidget {
  final List<T> all;
  final int size;
  final Widget Function(T item) itemBuilder;
  final double gap;
  const PagedColumn({super.key, required this.all, required this.itemBuilder, this.size = 10, this.gap = 10});

  @override
  State<PagedColumn<T>> createState() => _PagedColumnState<T>();
}

class _PagedColumnState<T> extends State<PagedColumn<T>> with AutomaticKeepAliveClientMixin {
  int page = 1;

  @override
  bool get wantKeepAlive => true;

  void _go(int p) {
    if (p == page) return;
    HapticFeedback.selectionClick();
    setState(() => page = p);
    // Bring the top of the list into view so the new page is what you see.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Scrollable.ensureVisible(
        context,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        alignmentPolicy: ScrollPositionAlignmentPolicy.keepVisibleAtStart,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final total = widget.all.length;
    final pages = total == 0 ? 1 : (total + widget.size - 1) ~/ widget.size;
    final current = page > pages ? pages : page;
    final start = (current - 1) * widget.size;
    final end = start + widget.size > total ? total : start + widget.size;
    final items = widget.all.sublist(start, end);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) SizedBox(height: widget.gap),
          AccentScope(color: stripAt(start + i), child: widget.itemBuilder(items[i])),
        ],
        // The pager only appears when there is more than one page.
        if (pages > 1) PagerBar(page: current, pages: pages, total: total, from: start + 1, to: end, onPage: _go),
      ],
    );
  }
}
