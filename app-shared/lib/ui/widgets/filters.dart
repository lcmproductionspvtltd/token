// Search box, filter chips and section titles above lists.
// Part of the shared widgets – apps import them all through ui/widgets.dart.

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../icons.dart';
import '../theme.dart';

/* ---------- search and filters ---------- */

/// Rounded search field for lists.
class SearchBox extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onChanged;
  const SearchBox({super.key, this.hint = 'Search', required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return TextField(
      onChanged: onChanged,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: hint,
        isDense: true,
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        prefixIcon: Padding(
          padding: const EdgeInsets.only(left: 14, right: 8),
          child: AppIcon('search', size: 18, color: Tk.ink3),
        ),
        prefixIconConstraints: const BoxConstraints(minWidth: 40, minHeight: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(99),
          borderSide: const BorderSide(color: Tk.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(99),
          borderSide: const BorderSide(color: Tk.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(99),
          borderSide: BorderSide(color: b.c, width: 1.6),
        ),
      ),
    );
  }
}

/// A row of filter chips that scrolls sideways when it doesn't fit.
class FilterChips<T> extends StatelessWidget {
  final Map<T, String> options;
  final T value;
  final ValueChanged<T> onChanged;
  const FilterChips({super.key, required this.options, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: [
          for (final e in options.entries) ...[
            Material(
              color: e.key == value ? b.c : Colors.white,
              borderRadius: BorderRadius.circular(99),
              child: InkWell(
                borderRadius: BorderRadius.circular(99),
                onTap: () {
                  HapticFeedback.selectionClick();
                  onChanged(e.key);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: e.key == value ? b.c : Tk.line2),
                  ),
                  child: Text(
                    e.value,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: e.key == value ? Colors.white : Tk.ink2,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

/// Search box with filter chips under it – the standard filter bar above a list.
class ListFilters extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onSearch;
  final List<Widget> chips;
  const ListFilters({super.key, this.hint = 'Search', required this.onSearch, this.chips = const []});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SearchBox(hint: hint, onChanged: onSearch),
          for (final c in chips) ...[const SizedBox(height: 10), c],
        ],
      ),
    );
  }
}

/// True when [q] is empty or any of [fields] contains it (case-insensitive).
bool textMatches(String q, Iterable<String> fields) {
  final s = q.trim().toLowerCase();
  if (s.isEmpty) return true;
  return fields.any((f) => f.toLowerCase().contains(s));
}

/// Section heading with the web's short gradient bar.
class SectionTitle extends StatelessWidget {
  final String title;
  final String? sub;
  final Widget? trailing;
  const SectionTitle(this.title, {super.key, this.sub, this.trailing});

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 4,
            height: 20,
            decoration: BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [b.c, b.rose]),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Tk.ink, letterSpacing: -0.2),
                ),
                if (sub != null && sub!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(sub!, style: const TextStyle(fontSize: 12.5, color: Tk.ink3)),
                  ),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
