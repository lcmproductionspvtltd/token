// Support tickets – the same screens for both sides:
//   team == false  business owner: raise tickets, follow replies, answer back
//   team == true   super admin / BQuee team: every business's tickets, reply, change status and priority

import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/json.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/ui/icons.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../core/session.dart';
import 'common.dart';

const Map<String, (String, String)> kTicketCategories = {
  'bug': ('Bug', 'bolt'),
  'issue': ('Problem', 'shield'),
  'question': ('Question', 'chat'),
  'billing': ('Plan & billing', 'calendar'),
  'feature': ('Feature request', 'sparkle'),
  'other': ('Other', 'list'),
};
const Map<String, String> kTicketStatus = {
  'open': 'Open',
  'in_progress': 'In progress',
  'resolved': 'Resolved',
  'closed': 'Closed',
};
const Map<String, String> kTicketPriority = {'low': 'Low', 'normal': 'Normal', 'high': 'High', 'urgent': 'Urgent'};

Tag ticketStatusTag(String s) => switch (s) {
  'open' => const Tag('Open', dot: true, tone: TagTone.amber),
  'in_progress' => const Tag('In progress', dot: true, tone: TagTone.blue),
  'resolved' => const Tag('Resolved', dot: true, tone: TagTone.green),
  _ => const Tag('Closed', dot: true),
};

String _when(int ms) {
  if (ms <= 0) return '';
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  final now = DateTime.now();
  final today = d.year == now.year && d.month == now.month && d.day == now.day;
  return '${today ? 'Today' : dayText(isoOf(d))}, ${clock(ms)}';
}

class SupportScreen extends StatefulWidget {
  final bool team;
  const SupportScreen({super.key, required this.team});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final GlobalKey<LoadedState<Json>> key = GlobalKey<LoadedState<Json>>();
  String q = '';
  late String status = widget.team ? 'active' : 'all';
  String cat = '';

  String get base => widget.team ? '/api/admin/tickets' : '/api/owner/tickets';

  Future<void> _open(String id) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => TicketScreen(id: id, team: widget.team),
      ),
    );
    key.currentState?.reload();
  }

  Future<void> _new() async {
    var category = 'issue';
    final subject = TextEditingController();
    final message = TextEditingController();
    var image = '';
    String? createdId;
    final ok = await FormPage.open(
      context,
      title: 'New support ticket',
      submitLabel: 'Send ticket',
      builder: (ctx, setState) => [
        const Text(
          'What is it about?',
          style: TextStyle(fontWeight: FontWeight.w600, color: Tk.ink),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final e in kTicketCategories.entries)
              ChoiceChip(
                selected: category == e.key,
                onSelected: (_) => setState(() => category = e.key),
                avatar: AppIcon(e.value.$2, size: 16, color: category == e.key ? Colors.white : Tk.ink2),
                label: Text(e.value.$1),
                labelStyle: TextStyle(color: category == e.key ? Colors.white : Tk.ink2, fontWeight: FontWeight.w600),
                selectedColor: brandOf(ctx).c,
                showCheckmark: false,
              ),
          ],
        ),
        const SizedBox(height: 16),
        FieldX(
          'Subject',
          subject,
          required: true,
          maxLength: 120,
          hint: 'e.g. QR code doesn’t scan on the poster',
          caps: TextCapitalization.sentences,
        ),
        FieldX(
          'Describe it',
          message,
          required: true,
          maxLines: 6,
          maxLength: 4000,
          keyboard: TextInputType.multiline,
          caps: TextCapitalization.sentences,
          helper: 'What happened, where, and what you expected.',
        ),
        ImageField(
          'Screenshot (optional)',
          value: image,
          maxSize: 1400,
          wide: true,
          onChanged: (v) => setState(() => image = v),
        ),
      ],
      onSubmit: () async {
        final r = asJson(
          await session.api.post('/api/owner/tickets', {
            'category': category,
            'subject': subject.text.trim(),
            'message': message.text.trim(),
            if (image.isNotEmpty) 'image': image,
          }),
        );
        createdId = r.s('id');
      },
    );
    if (ok && createdId != null && mounted) {
      toast(context, 'Ticket raised');
      _open(createdId!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final team = widget.team;
    return Loaded<Json>(
      key: key,
      every: const Duration(seconds: 30),
      load: () => session.api.getJson(base),
      builder: (context, d, reload) {
        final b = brandOf(context);
        final c = d.m('counts');
        final all = d.l('tickets');
        final shown = all.where((t) {
          final okStatus =
              status == 'all' ||
              (status == 'active'
                  ? (t.s('status') == 'open' || t.s('status') == 'in_progress')
                  : t.s('status') == status);
          return okStatus &&
              (cat.isEmpty || t.s('category') == cat) &&
              textMatches(q, [t.s('subject'), t.s('business'), t.s('raisedBy'), '#${t.i('number')}']);
        }).toList();
        return PageScroll(
          title: team ? 'Support tickets' : 'Help & support',
          subtitle: team
              ? 'Bugs, problems and questions from businesses'
              : 'Raise a ticket – the BQuee team replies here',
          onRefresh: reload,
          actions: [if (!team) HeaderAction('plus', tooltip: 'New ticket', label: 'New', onPressed: _new)],
          children: [
            Figures([
              FigureItem('Open', '${c.i('open')}', 'clock', Tk.amber),
              FigureItem('In progress', '${c.i('inProgress')}', 'refresh', Tk.sky),
              FigureItem('Resolved', '${c.i('resolved')}', 'check', Tk.green),
              FigureItem(team ? 'Need a reply' : 'New replies', '${d.i('unread')}', 'chat', b.c),
            ]),
            const SizedBox(height: 18),
            ListFilters(
              hint: team ? 'Search subject, business, #' : 'Search tickets',
              onSearch: (v) => setState(() => q = v),
              chips: [
                FilterChips<String>(
                  options: const {
                    'all': 'All',
                    'active': 'Open + in progress',
                    'open': 'Open',
                    'in_progress': 'In progress',
                    'resolved': 'Resolved',
                    'closed': 'Closed',
                  },
                  value: status,
                  onChanged: (v) => setState(() => status = v),
                ),
                FilterChips<String>(
                  options: {'': 'All types', for (final e in kTicketCategories.entries) e.key: e.value.$1},
                  value: cat,
                  onChanged: (v) => setState(() => cat = v),
                ),
              ],
            ),
            const SizedBox(height: 4),
            SectionTitle(plural(shown.length, 'ticket')),
            if (shown.isEmpty)
              AppCard(
                child: EmptyState(
                  icon: 'chat',
                  title: all.isEmpty ? (team ? 'No tickets yet' : 'No support tickets yet') : 'No tickets match',
                  text: all.isEmpty
                      ? (team
                            ? 'Tickets from business owners appear here.'
                            : 'Found a bug or need help? Raise a ticket and the BQuee team will reply here.')
                      : 'Try another filter.',
                  action: !team && all.isEmpty
                      ? Btn('New ticket', icon: 'plus', kind: BtnKind.soft, onPressed: _new)
                      : null,
                ),
              )
            else
              PagedColumn<Json>(
                key: ValueKey('$q|$status|$cat'),
                all: shown,
                gap: 12,
                itemBuilder: (t) {
                  final category = kTicketCategories[t.s('category')] ?? kTicketCategories['other']!;
                  final urgent = t.s('priority') == 'high' || t.s('priority') == 'urgent';
                  return ListCard(
                    onTap: () => _open(t.s('id')),
                    leading: team
                        ? BizMark(logo: t.s('businessLogo'), color: parseHexColor(t.s('businessColor')), size: 46)
                        : IconChip(category.$2, color: t.s('category') == 'bug' ? Tk.badFg : b.c, size: 46),
                    title: t.s('subject'),
                    subtitle: '#${t.i('number')} · ${category.$1}${team ? ' · ${t.s('business')}' : ''}',
                    trailing: t.b('unread')
                        ? Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: b.c, borderRadius: BorderRadius.circular(99)),
                            child: Text(
                              team ? 'New' : 'Reply',
                              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                            ),
                          )
                        : null,
                    detailIcon: 'clock',
                    detail: '${plural(t.i('replies'), 'reply', 'replies')} · updated ${_when(t.i('updatedAt'))}',
                    tags: [
                      ticketStatusTag(t.s('status')),
                      if (urgent) Tag(kTicketPriority[t.s('priority')] ?? '', icon: 'bolt', tone: TagTone.red),
                    ],
                  );
                },
              ),
          ],
        );
      },
    );
  }
}

/* ---------------- one ticket: conversation ---------------- */

class TicketScreen extends StatefulWidget {
  final String id;
  final bool team;
  const TicketScreen({super.key, required this.id, required this.team});

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> {
  final GlobalKey<LoadedState<Json>> key = GlobalKey<LoadedState<Json>>();
  final msg = TextEditingController();
  String image = '';
  bool busy = false;

  String get base => '${widget.team ? '/api/admin/tickets' : '/api/owner/tickets'}/${widget.id}';

  @override
  void dispose() {
    msg.dispose();
    super.dispose();
  }

  Future<void> _send([Map<String, dynamic> extra = const {}]) async {
    if (msg.text.trim().isEmpty && image.isEmpty && extra.isEmpty) {
      toast(context, 'Write a reply first', error: true);
      return;
    }
    setState(() => busy = true);
    final r = await runAction(
      context,
      () =>
          session.api.post('$base/reply', {'message': msg.text.trim(), if (image.isNotEmpty) 'image': image, ...extra}),
      done: extra['status'] != null
          ? 'Marked as ${(kTicketStatus[extra['status']] ?? '').toLowerCase()}'
          : extra['priority'] != null
          ? 'Priority changed'
          : 'Reply sent',
    );
    if (!mounted) return;
    setState(() {
      busy = false;
      if (r != null) {
        msg.clear();
        image = '';
      }
    });
    if (r != null) key.currentState?.reload();
  }

  Future<void> _attach() async {
    final p = await Native.pickImage(maxSize: 1400);
    if (p != null && mounted) setState(() => image = p);
  }

  @override
  Widget build(BuildContext context) {
    final team = widget.team;
    return Scaffold(
      backgroundColor: Tk.canvas,
      appBar: AppBar(
        backgroundColor: Colors.white,
        leading: IconButton(
          icon: const AppIcon('back', size: 22),
          tooltip: 'Back',
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('Ticket'),
      ),
      body: Loaded<Json>(
        key: key,
        every: const Duration(seconds: 20),
        load: () => session.api.getJson(base),
        builder: (context, t, reload) {
          final b = brandOf(context);
          final category = kTicketCategories[t.s('category')] ?? kTicketCategories['other']!;
          final msgs = t.l('messages');
          return Column(
            children: [
              Expanded(
                child: RefreshIndicator(
                  onRefresh: reload,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                    children: [
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '#${t.i('number')} · ${t.s('subject')}',
                              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Tk.ink),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              [
                                category.$1,
                                if (team) t.s('business') + (t.s('raisedBy').isEmpty ? '' : ' – ${t.s('raisedBy')}'),
                                'raised ${_when(t.i('createdAt'))}',
                              ].join(' · '),
                              style: const TextStyle(color: Tk.ink3, fontSize: 12.5),
                            ),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                ticketStatusTag(t.s('status')),
                                Tag(
                                  '${kTicketPriority[t.s('priority')] ?? 'Normal'} priority',
                                  icon: 'bolt',
                                  tone: t.s('priority') == 'high' || t.s('priority') == 'urgent'
                                      ? TagTone.red
                                      : TagTone.neutral,
                                ),
                              ],
                            ),
                            if (team) ...[
                              const SizedBox(height: 14),
                              Row(
                                children: [
                                  Expanded(
                                    child: SelectX<String>(
                                      'Status',
                                      value: t.s('status'),
                                      options: [for (final e in kTicketStatus.entries) MapEntry(e.key, e.value)],
                                      onChanged: (v) => v == t.s('status') || busy ? null : _send({'status': v}),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: SelectX<String>(
                                      'Priority',
                                      value: t.s('priority'),
                                      options: [for (final e in kTicketPriority.entries) MapEntry(e.key, e.value)],
                                      onChanged: (v) => v == t.s('priority') || busy ? null : _send({'priority': v}),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      for (final m in msgs)
                        if (m.s('status').isNotEmpty)
                          Center(
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(99),
                                border: Border.all(color: Tk.line2),
                              ),
                              child: Text(
                                '${m.s('author')} marked this ${(kTicketStatus[m.s('status')] ?? m.s('status')).toLowerCase()} · ${_when(m.i('createdAt'))}',
                                style: const TextStyle(color: Tk.ink3, fontSize: 11.5),
                              ),
                            ),
                          )
                        else
                          _Bubble(m: m, mine: m.b('fromTeam') == team, team: team, brand: b),
                    ],
                  ),
                ),
              ),
              SafeArea(
                top: false,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    border: Border(top: BorderSide(color: Tk.line)),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (image.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: SizedBox(
                                  width: 48,
                                  height: 48,
                                  child: NetImage(image, fallback: const SizedBox()),
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Expanded(
                                child: Text('Screenshot attached', style: TextStyle(color: Tk.ink3, fontSize: 12.5)),
                              ),
                              IconButton(
                                onPressed: () => setState(() => image = ''),
                                icon: const AppIcon('x', size: 18, color: Tk.ink3),
                                tooltip: 'Remove',
                              ),
                            ],
                          ),
                        ),
                      if (!team && (t.s('status') == 'resolved' || t.s('status') == 'closed'))
                        const Padding(
                          padding: EdgeInsets.only(bottom: 6),
                          child: Text(
                            'Replying opens this ticket again.',
                            style: TextStyle(color: Tk.ink3, fontSize: 12),
                          ),
                        ),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          IconButton(
                            onPressed: _attach,
                            icon: AppIcon('image', size: 22, color: b.c),
                            tooltip: 'Attach screenshot',
                          ),
                          Expanded(
                            child: TextField(
                              controller: msg,
                              minLines: 1,
                              maxLines: 5,
                              maxLength: 4000,
                              textCapitalization: TextCapitalization.sentences,
                              decoration: InputDecoration(
                                hintText: team ? 'Reply to the business…' : 'Write a reply…',
                                counterText: '',
                                isDense: true,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconBtn('arrow', tooltip: 'Send', onPressed: busy ? null : () => _send()),
                        ],
                      ),
                      if (team && t.s('status') != 'resolved')
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                            onPressed: busy ? null : () => _send({'status': 'resolved'}),
                            icon: const AppIcon('check', size: 18, color: Tk.doneFg),
                            label: Text(
                              msg.text.trim().isEmpty ? 'Mark resolved' : 'Reply & resolve',
                              style: const TextStyle(color: Tk.doneFg, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final Json m;
  final bool mine;
  final bool team;
  final Brand brand;
  const _Bubble({required this.m, required this.mine, required this.team, required this.brand});

  @override
  Widget build(BuildContext context) {
    final who = m.b('fromTeam') && !team ? 'BQuee support · ${m.s('author')}' : m.s('author');
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
          decoration: BoxDecoration(
            color: mine ? brand.wash : Colors.white,
            border: Border.all(color: mine ? brand.lineC : Tk.line),
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: Radius.circular(mine ? 16 : 5),
              bottomRight: Radius.circular(mine ? 5 : 16),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$who · ${_when(m.i('createdAt'))}', style: const TextStyle(color: Tk.ink3, fontSize: 11.5)),
              if (m.s('body').isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(m.s('body'), style: const TextStyle(color: Tk.ink, height: 1.45)),
              ],
              if (m.s('image').isNotEmpty) ...[
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: () => Native.openUrl(session.api.url(m.s('image'))),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: NetImage(m.s('image'), height: 180, fallback: const SizedBox()),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
