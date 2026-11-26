// Self-checks for shared parts: the step bar and stepped form page (long forms), safe links,
// HTTPS-only connections, the keyboard closing on outside taps (but not on Paste), and dropdown filters.

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/screens/email_code.dart';
import 'package:bquee_shared/screens/legal.dart';
import 'package:bquee_shared/ui/steps.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _app(Widget child) => MaterialApp(theme: buildTheme(Tk.bqueePurple), home: child);

void main() {
  test('only safe kinds of links are opened', () {
    for (final ok in [
      'https://bquee.com',
      'http://shop.example',
      'tel:+919876543210',
      'mailto:a@b.co',
      'https://wa.me/91987',
      'otpauth://totp/BQuee:x?secret=ABC',
    ]) {
      expect(Native.isSafeUrl(ok), isTrue, reason: ok);
    }
    for (final bad in [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'file:///etc/passwd',
      'content://x/y',
      'intent://scan',
      'data:text/html,<b>x</b>',
      '',
      'not a link',
    ]) {
      expect(Native.isSafeUrl(bad), isFalse, reason: bad);
    }
  });

  test('the apps only talk to the server over HTTPS', () async {
    final api = Api('http://bquee.example');
    await expectLater(
      api.get('/api/me'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('non-HTTPS'))),
    );
    expect(
      Api('https://bquee.example').url('http://evil.example/x.jpg'),
      '',
      reason: 'plain http images are not loaded',
    );
    expect(Api('https://bquee.example').url('/uploads/a.jpg'), 'https://bquee.example/uploads/a.jpg');
    expect(Api.isLocalTest(Uri.parse('http://10.0.2.2:3000')), isTrue, reason: 'emulator test server allowed');
  });

  testWidgets('Privacy Policy and Terms links are shown (app stores need them)', (tester) async {
    await tester.pumpWidget(_app(const Scaffold(body: LegalLinks())));
    expect(find.text('Privacy Policy'), findsOneWidget);
    expect(find.text('Terms and Conditions'), findsOneWidget);
  });

  testWidgets('Privacy Policy opens inside the app, with "Try again" when it can’t load', (tester) async {
    final before = serverApi;
    serverApi = Api('http://offline.example'); // refused (not HTTPS), like having no connection
    addTearDown(() => serverApi = before);
    await tester.pumpWidget(_app(const Scaffold(body: LegalLinks())));
    await tester.tap(find.text('Privacy Policy'));
    await tester.pumpAndSettle();
    expect(find.text('Privacy Policy'), findsWidgets, reason: 'the policy screen opened');
    expect(find.text('Couldn’t load the Privacy Policy'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('step bar: current step named, finished steps ticked and tappable', (tester) async {
    final semantics = tester.ensureSemantics();
    var picked = -1;
    await tester.pumpWidget(
      _app(
        Scaffold(
          body: StepBar(steps: const ['Business', 'Booking', 'Owner'], at: 1, onPick: (i) => picked = i),
        ),
      ),
    );
    expect(find.text('Booking'), findsOneWidget, reason: 'current step shows its name');
    expect(find.text('Owner'), findsNothing, reason: 'other steps show only a number on a phone');
    expect(find.text('3'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel(RegExp('^Step 1: Business')));
    expect(picked, 0, reason: 'a finished step can be opened again');
    await tester.tap(find.text('3'));
    expect(picked, 0, reason: 'a later step can not be skipped to');
    semantics.dispose();
  });

  testWidgets('stepped form: Next checks only this step, Back keeps what was typed', (tester) async {
    final name = TextEditingController();
    final owner = TextEditingController();
    var saved = false;
    await tester.pumpWidget(
      _app(
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: Btn(
                'Open',
                onPressed: () => StepFormPage.open(
                  context,
                  title: 'New business',
                  submitLabel: 'Create',
                  steps: const ['Business', 'Owner'],
                  builder: (ctx, setState, step) => [
                    if (step == 0) FieldX('Business name', name, required: true),
                    if (step == 1) FieldX('Owner name', owner, required: true),
                  ],
                  onSubmit: () async => saved = true,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Enter business name'), findsOneWidget, reason: 'empty required field stops Next');
    expect(find.text('Owner name *'), findsNothing);
    await tester.enterText(find.byType(TextFormField), 'Lotus');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Owner name *'), findsOneWidget, reason: 'moved to step 2');
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Lotus'), findsOneWidget, reason: 'step 1 still has what was typed');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create'));
    await tester.pumpAndSettle();
    expect(saved, isFalse, reason: 'last step checked too');
    await tester.enterText(find.byType(TextFormField), 'Meera');
    await tester.tap(find.text('Create'));
    await tester.pumpAndSettle();
    expect(saved, isTrue);
  });

  testWidgets('tapping outside a text field closes the keyboard; tapping the field keeps it', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(Tk.bqueePurple),
        builder: (context, child) => TapToCloseKeyboard(child: child!),
        home: Scaffold(
          body: Column(
            children: [
              const SizedBox(height: 40),
              const TextField(key: Key('search'), decoration: InputDecoration(hintText: 'Search')),
              const SizedBox(height: 300),
              TextButton(onPressed: () {}, child: const Text('Other')),
            ],
          ),
        ),
      ),
    );
    final field = find.byKey(const Key('search'));
    final editable = find.descendant(of: field, matching: find.byType(EditableText));
    bool open() => tester.state<EditableTextState>(editable).widget.focusNode.hasFocus;

    await tester.tap(field);
    await tester.pump();
    expect(open(), isTrue, reason: 'tapping the search box opens the keyboard');

    await tester.tap(field);
    await tester.pump();
    expect(open(), isTrue, reason: 'tapping the box again keeps it open');

    await tester.tapAt(const Offset(200, 250)); // empty area
    await tester.pump();
    expect(open(), isFalse, reason: 'tapping an empty area closes it');

    await tester.tap(field);
    await tester.pump();
    await tester.tap(find.text('Other')); // a button elsewhere
    await tester.pump();
    expect(open(), isFalse, reason: 'tapping a button elsewhere closes it too');
  });

  testWidgets('Paste works: tapping the field’s Paste menu doesn’t close the keyboard first', (tester) async {
    // The phone's clipboard holds a password.
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.getData') return <String, dynamic>{'text': 'Secret-Pass-77'};
      if (call.method == 'Clipboard.hasStrings') return <String, dynamic>{'value': true};
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    final pass = TextEditingController();
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(Tk.bqueePurple),
        builder: (context, child) => TapToCloseKeyboard(child: child!),
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.only(top: 200),
            child: TextField(key: const Key('pass'), controller: pass, obscureText: true),
          ),
        ),
      ),
    );
    final field = find.byKey(const Key('pass'));
    await tester.tap(field);
    await tester.pump();
    await tester.longPress(field);
    await tester.pumpAndSettle();
    expect(find.text('Paste'), findsOneWidget, reason: 'the Paste menu opens');
    await tester.tap(find.text('Paste'));
    await tester.pumpAndSettle();
    expect(pass.text, 'Secret-Pass-77', reason: 'the password is pasted');
  });

  testWidgets('dropdown filter: shows the choice, opens a list, picks another option', (tester) async {
    var value = '';
    await tester.pumpWidget(
      _app(
        StatefulBuilder(
          builder: (context, set) => Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(20),
              child: FilterRow(
                children: [
                  FilterDropdown<String>(
                    label: 'Business',
                    icon: 'store',
                    options: const {'': 'All businesses', 'a': 'Lotus Salon', 'b': 'City Clinic'},
                    value: value,
                    onChanged: (v) => set(() => value = v),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.text('Business'), findsOneWidget);
    expect(find.text('All businesses'), findsOneWidget);
    await tester.tap(find.text('All businesses'));
    await tester.pumpAndSettle();
    expect(find.text('City Clinic'), findsOneWidget, reason: 'the sheet lists every option');
    await tester.tap(find.text('City Clinic'));
    await tester.pumpAndSettle();
    expect(value, 'b');
    expect(find.text('City Clinic'), findsOneWidget, reason: 'the box now shows the choice');
    expect(find.text('All businesses'), findsNothing);
  });

  testWidgets('customer forgot password: email first, no staff note', (tester) async {
    await tester.pumpWidget(
      _app(ForgotPasswordScreen(api: Api('https://example.invalid'), account: 'customer', email: 'a@b.co')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Email me a code'), findsOneWidget);
    expect(find.text('a@b.co'), findsOneWidget, reason: 'the email typed on the sign-in screen is filled in');
    expect(find.textContaining('Staff without an email'), findsNothing);
  });

  test('sign-up email code: "sent" only for the email the code went to', () {
    final v = EmailCode();
    v.email.text = 'Ana@Mail.test';
    expect(v.sent, isFalse);
    v.ticket = 't';
    v.sentTo = 'ana@mail.test';
    v.code.text = '123456';
    expect(v.sent, isTrue);
    expect(v.body(), {'email': 'Ana@Mail.test', 'emailTicket': 't', 'emailCode': '123456'});
    v.email.text = 'other@mail.test';
    expect(v.sent, isFalse, reason: 'changing the email needs a new code');
  });

  test('appointment times read in the phone’s own clock; the business day is the UTC day', () {
    final at = DateTime(2026, 11, 28, 16, 30); // local time
    expect(appointmentText(at.millisecondsSinceEpoch), 'Sat, Nov 28 · 4:30 PM');
    expect(appointmentText(0), '');
    final utc = DateTime.now().toUtc();
    expect(todayIso(), '${utc.year}-${two(utc.month)}-${two(utc.day)}');
    expect(kAppointmentLeadMinutes, 15, reason: 'same as the server');
  });
}
