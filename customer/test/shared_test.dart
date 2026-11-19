// Self-checks for shared parts added with the security review: the step bar and stepped form
// page (long forms), safe links, and HTTPS-only connections.

import 'package:bquee_shared/core/api.dart';
import 'package:bquee_shared/core/native.dart';
import 'package:bquee_shared/screens/legal.dart';
import 'package:bquee_shared/ui/steps.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
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
}
