// The bell (with the number of new notifications) and the list it opens. Used by both apps.

import 'package:material_ui/material_ui.dart';

import '../core/json.dart';
import '../core/notes.dart';
import '../ui/icons.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

/// Round bell button. [onDark] for coloured headers.
class NotesBell extends StatelessWidget {
  final NotesFeed feed;
  final bool onDark;
  const NotesBell({super.key, required this.feed, this.onDark = false});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: feed,
      builder: (context, _) {
        final n = feed.unread;
        final icon = AppIcon('bell', size: 21, color: onDark ? Colors.white : Tk.ink, stroke: 2);
        return Semantics(
          button: true,
          label: n > 0 ? 'Notifications, $n new' : 'Notifications',
          child: InkResponse(
            radius: 24,
            onTap: () => showNotes(context, feed),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: n > 0
                  ? Badge(label: Text(n > 99 ? '99+' : '$n'), backgroundColor: Tk.rose, child: icon)
                  : icon,
            ),
          ),
        );
      },
    );
  }
}

/// The list of notifications, newest first. Opening it marks them read.
Future<void> showNotes(BuildContext context, NotesFeed feed) {
  feed.markRead();
  feed.check();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.8),
        child: ListenableBuilder(
          listenable: feed,
          builder: (ctx, _) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(22, 4, 22, 10),
                child: Text(
                  'Notifications',
                  style: TextStyle(fontFamily: Tk.serif, fontSize: 20, fontWeight: FontWeight.w600, color: Tk.ink),
                ),
              ),
              if (feed.items.isEmpty)
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 10, 16, 30),
                  child: EmptyState(
                    icon: 'bell',
                    title: 'Nothing yet',
                    text: 'New tokens, your turn, messages and updates show up here.',
                  ),
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                    itemCount: feed.items.length,
                    separatorBuilder: (_, _) => const Divider(height: 1, color: Tk.line),
                    itemBuilder: (_, i) => _NoteTile(feed.items[i]),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _NoteTile extends StatelessWidget {
  final Json n;
  const _NoteTile(this.n);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(n.s('title'), style: const TextStyle(fontWeight: FontWeight.w600, color: Tk.ink, fontSize: 14.5)),
          if (n.s('body').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(n.s('body'), style: const TextStyle(color: Tk.ink2, fontSize: 13.5)),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(timeAgo(n.s('at')), style: const TextStyle(color: Tk.ink3, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
