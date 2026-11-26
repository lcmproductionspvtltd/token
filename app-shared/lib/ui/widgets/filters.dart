// Search box, filter chips, dropdown filters and section titles above lists.
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

/// A dropdown filter: a rounded box showing what it filters ([label]) and the chosen option; a tap opens
/// a sheet with all options. The first option is the "everything" one (e.g. "All"); any other choice
/// tints the box so it's clear the list is filtered.
class FilterDropdown<T> extends StatelessWidget {
  final String label;
  final String icon;
  final Map<T, String> options;
  final T value;
  final ValueChanged<T> onChanged;
  const FilterDropdown({
    super.key,
    required this.label,
    required this.icon,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  Future<void> _open(BuildContext context) async {
    final b = brandOf(context);
    final picked = await showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 0, 22, 8),
                child: Row(
                  children: [
                    AppIcon(icon, size: 20, color: b.c),
                    const SizedBox(width: 10),
                    Text(label, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Tk.ink)),
                  ],
                ),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  children: [
                    for (final e in options.entries)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Material(
                          color: e.key == value ? fade(b.c, 0.08) : Colors.transparent,
                          borderRadius: BorderRadius.circular(14),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(14),
                            onTap: () => Navigator.of(ctx).pop(e.key),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      e.value,
                                      style: TextStyle(
                                        fontSize: 15,
                                        fontWeight: e.key == value ? FontWeight.w700 : FontWeight.w500,
                                        color: e.key == value ? b.ink : Tk.ink,
                                      ),
                                    ),
                                  ),
                                  if (e.key == value) AppIcon('check', size: 20, color: b.c, stroke: 2.4),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (picked != null && picked != value) {
      HapticFeedback.selectionClick();
      onChanged(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = brandOf(context);
    final filtered = options.isNotEmpty && value != options.keys.first;
    return Semantics(
      button: true,
      label: '$label: ${options[value] ?? ''}',
      child: Material(
        color: filtered ? fade(b.c, 0.07) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _open(context),
          child: Container(
            height: 54,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: filtered ? b.c : Tk.line2, width: filtered ? 1.4 : 1),
            ),
            child: Row(
              children: [
                AppIcon(icon, size: 18, color: filtered ? b.c : Tk.ink3),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Tk.ink3),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        options[value] ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: filtered ? b.ink : Tk.ink),
                      ),
                    ],
                  ),
                ),
                AppIcon('chevd', size: 16, color: filtered ? b.c : Tk.ink3, stroke: 2.2),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Dropdown filters side by side, sharing the width (one alone takes the full width).
class FilterRow extends StatelessWidget {
  final List<Widget> children;
  const FilterRow({super.key, required this.children});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(child: children[i]),
        ],
      ],
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
