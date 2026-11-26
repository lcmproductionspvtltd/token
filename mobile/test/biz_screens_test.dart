// BQuee Biz screens added with the security review and the step-by-step forms: business sign-up in
// steps, the new/edit business form in steps, changing many businesses at once, and two-step
// sign-in (setup with QR + key, code, backup codes). No server is needed: these check what the
// screen shows and that a step can't be skipped without its required fields.

import 'package:bquee/core/session.dart';
import 'package:bquee/screens/admin/business_features.dart';
import 'package:bquee/screens/admin/business_form.dart';
import 'package:bquee/screens/mfa.dart';
import 'package:bquee/screens/owner/overview.dart';
import 'package:bquee/screens/profile.dart';
import 'package:bquee/screens/signup.dart';
import 'package:bquee/screens/staff/new_token.dart';
import 'package:bquee/ui/token_flow.dart';
import 'package:bquee_shared/core/format.dart';
import 'package:bquee_shared/core/notes.dart';
import 'package:bquee_shared/screens/notes.dart';
import 'package:bquee_shared/ui/theme.dart';
import 'package:bquee_shared/ui/widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _app(Widget child) => MaterialApp(theme: buildTheme(Tk.bqueePurple), home: child);

/// A screen with one button that runs [open] (to open full-screen forms the way the app does).
Widget _opener(void Function(BuildContext) open) => _app(
  Builder(
    builder: (c) => Scaffold(
      body: Center(child: Btn('Open', onPressed: () => open(c))),
    ),
  ),
);

void _tallScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  const site = {
    'signup': {'enabled': true, 'approval': false, 'trialDays': 14},
    'sections': {'plans': false},
    'categories': <Map<String, dynamic>>[],
  };

  testWidgets('business sign-up: 3 steps, business name needed before Next', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(_app(const SignupScreen(site: site)));
    await tester.pumpAndSettle();
    expect(find.text('Business'), findsWidgets);
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Enter business name'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextFormField, 'Business name *'), 'Lotus Salon');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Your customers’ booking form'), findsOneWidget, reason: 'step 2: booking form');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('About you'), findsOneWidget, reason: 'step 3: your account');
    expect(find.text('Create my account'), findsOneWidget);
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Your customers’ booking form'), findsOneWidget, reason: 'Back goes one step');
  });

  testWidgets('business sign-up: packages are a dropdown, the popular one picked', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(
      _app(
        const SignupScreen(
          site: {
            'signup': {'enabled': true, 'approval': false, 'trialDays': 14},
            'sections': {'plans': true},
            'categories': <Map<String, dynamic>>[],
            'plans': [
              {'name': 'Starter', 'price': 'Free', 'period': '14-day trial', 'highlight': false},
              {'name': 'Business', 'price': '₹999', 'period': 'per month', 'highlight': true},
            ],
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
    expect(find.text('Business – ₹999 per month (popular)'), findsOneWidget, reason: 'popular plan picked');
    await tester.tap(find.text('Business – ₹999 per month (popular)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Starter – Free · 14-day trial').last);
    await tester.pumpAndSettle();
    expect(find.text('Starter – Free · 14-day trial'), findsOneWidget, reason: 'another plan can be chosen');
  });

  testWidgets('business sign-up: package prices in the currency of where the phone is – no manual choice', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(
      _app(
        const SignupScreen(
          site: {
            'signup': {'enabled': true, 'approval': false, 'trialDays': 14},
            'sections': {'plans': true},
            'categories': <Map<String, dynamic>>[],
            'defaultCurrency': 'USD',
            'currencyHint': 'AED',
            'currencies': [
              {'code': 'INR', 'name': 'Indian rupee', 'countries': ['IN']},
              {'code': 'AED', 'name': 'UAE dirham', 'countries': ['AE']},
              {'code': 'USD', 'name': 'US dollar', 'countries': <String>[]},
            ],
            'plans': [
              {'name': 'Starter', 'price': 'Free', 'period': '14-day trial', 'highlight': false},
              {
                'name': 'Business',
                'price': '₹999',
                'period': 'per month',
                'highlight': true,
                'prices': {'INR': '₹999', 'AED': 'AED 42', 'USD': '\$12'},
              },
            ],
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget, reason: 'only the package – no currency menu');
    expect(find.text('Prices in'), findsNothing);
    expect(find.text('Business – AED 42 per month (popular)'), findsOneWidget, reason: 'the phone is in the UAE');
  });

  testWidgets('sign-up: Google / Apple buttons only when the server offers them', (tester) async {
    _tallScreen(tester);
    const base = {
      'signup': {'enabled': true, 'approval': false, 'trialDays': 14},
      'sections': {'plans': false},
      'categories': <Map<String, dynamic>>[],
    };
    await tester.pumpWidget(_app(const SignupScreen(site: base)));
    await tester.pumpAndSettle();
    expect(find.text('Sign up with Google'), findsNothing);
    await tester.pumpWidget(
      _app(
        const SignupScreen(
          key: ValueKey('with-social'), // a fresh screen, not the one above
          site: {
            ...base,
            'social': {'google': true, 'apple': true},
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sign up with Google'), findsOneWidget);
    expect(find.text('Sign up with Apple'), findsOneWidget);
  });

  testWidgets('sign-up with Google: no username or password, email from Google', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(
      _app(
        const SignupScreen(
          site: {
            'signup': {'enabled': true, 'approval': false, 'trialDays': 14},
            'sections': {'plans': false},
            'categories': <Map<String, dynamic>>[],
            'social': {'google': true},
          },
          social: {'ticket': 't', 'verifier': 'v', 'provider': 'google', 'email': 'sana@gmail.test', 'name': 'Sana K'},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sign up with Google'), findsNothing, reason: 'already signing up with Google');
    await tester.enterText(find.widgetWithText(TextFormField, 'Business name *'), 'Sana Salon');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Signing up with Google as sana@gmail.test'), findsOneWidget);
    expect(find.text('Username *'), findsNothing);
    expect(find.text('Password *'), findsNothing);
    expect(find.text('Sana K'), findsOneWidget, reason: 'name filled in from Google');
  });

  testWidgets('new business form: 4 steps, each checked before Next', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(_opener((c) => editBusiness(c, null, const [], false)));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('New business'), findsOneWidget);
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Enter business name'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextFormField, 'Business name *'), 'Lotus Salon');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Customer booking form'), findsOneWidget, reason: 'step 2');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Owner'), findsWidgets, reason: 'step 3');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Enter username'), findsOneWidget, reason: 'a new business needs the owner sign-in');
    expect(find.text('Plan name'), findsNothing);
    expect(find.byTooltip('Show password'), findsOneWidget, reason: 'owner password has an eye button');
    await tester.tap(find.byTooltip('Show password'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Hide password'), findsOneWidget, reason: 'the password is now shown');
  });

  testWidgets('change many businesses: every setting starts at "No change"', (tester) async {
    _tallScreen(tester);
    session.user = {'role': 'superadmin'};
    addTearDown(() => session.user = null);
    await tester.pumpWidget(_opener((c) => editBusinessesBulk(c, const ['a', 'b'])));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('Change 2 businesses'), findsOneWidget);
    // on/off + contacts + 8 owner menus + 3 features (export, staff reports, app buttons)
    expect(find.text('No change'), findsNWidgets(13));
    expect(find.text('Hide'), findsOneWidget);
    await tester.tap(find.text('Apply to selected'));
    await tester.pumpAndSettle();
    expect(find.text('Choose at least one setting to change'), findsOneWidget, reason: 'nothing picked → nothing sent');
  });

  testWidgets('two-step sign-in setup: QR code, key in groups, code needed', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(
      _app(
        const MfaScreen(
          mfa: {
            'step': 'setup',
            'secret': 'JBSWY3DPEHPK3PXP',
            'uri': 'otpauth://totp/BQuee:owner?secret=JBSWY3DPEHPK3PXP&issuer=BQuee',
            'challenge': 'x',
          },
        ),
      ),
    );
    expect(find.text('Protect your account'), findsOneWidget);
    expect(find.text('JBSW Y3DP EHPK 3PXP'), findsOneWidget);
    expect(find.text('Open authenticator app'), findsOneWidget);
    await tester.tap(find.text('Turn on and sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the 6-digit code from your authenticator app.'), findsOneWidget);
  });

  testWidgets('two-step sign-in: code, or a backup code instead', (tester) async {
    await tester.pumpWidget(_app(const MfaScreen(mfa: {'step': 'verify', 'challenge': 'x'})));
    expect(find.text('Enter your code'), findsOneWidget);
    expect(find.text('6-digit code'), findsOneWidget);
    await tester.tap(find.text('Lost your phone? Use a backup code'));
    await tester.pumpAndSettle();
    expect(find.text('Backup code'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'abc');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Enter one of your backup codes, like 4f7k-2m9q.'), findsOneWidget);
  });

  testWidgets('backup codes are all shown, with copy and share', (tester) async {
    _tallScreen(tester);
    final codes = List.generate(10, (i) => 'ab${i}c-d${i}ef');
    await tester.pumpWidget(
      _app(
        Scaffold(
          body: BackupCodesView(codes: codes, onDone: () {}),
        ),
      ),
    );
    for (final c in codes) {
      expect(find.text(c), findsOneWidget);
    }
    expect(find.text('Copy'), findsOneWidget);
    expect(find.text('Share'), findsOneWidget);
  });

  testWidgets('staff new token: their own name is fixed and only their services are offered', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(
      _app(
        const NewTokenScreen(
          currency: 'AED',
          preset: {
            'staff': {'id': 'st1', 'name': 'Anu'},
            'services': [
              {'id': 'cut', 'name': 'Haircut', 'duration': 30, 'price': 50},
              {'id': 'beard', 'name': 'Beard trim', 'duration': 15, 'price': 20},
            ],
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Anu (you)'), findsOneWidget, reason: 'the staff member is shown, not chosen');
    expect(find.byType(DropdownButtonFormField<String>), findsNothing, reason: 'no staff picker');
    expect(find.text('Haircut'), findsOneWidget);
    expect(find.text('Beard trim'), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsNWidgets(2));
    await tester.tap(find.text('Create token'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the customer’s name.'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'Meera');
    await tester.tap(find.text('Create token'));
    await tester.pumpAndSettle();
    expect(find.text('Choose at least one service.'), findsOneWidget, reason: 'a service must be picked');
  });

  testWidgets('notifications: bell shows the new count, the list shows each one', (tester) async {
    final feed = NotesFeed()
      ..items = [
        {'id': 2, 'title': 'New token A-012', 'body': 'Booked for Ravi: Cut (Anu)', 'at': DateTime.now().toIso8601String()},
        {'id': 1, 'title': 'It’s your turn – A-011', 'body': 'Cut with Anu is starting now.', 'at': '2020-01-01T00:00:00Z'},
      ]
      ..unread = 2;
    await tester.pumpWidget(_app(Scaffold(body: Center(child: NotesBell(feed: feed)))));
    expect(find.text('2'), findsOneWidget, reason: 'badge with the number of new ones');
    await tester.tap(find.byType(NotesBell));
    await tester.pumpAndSettle();
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('New token A-012'), findsOneWidget);
    expect(find.text('Booked for Ravi: Cut (Anu)'), findsOneWidget);
    expect(find.text('just now'), findsOneWidget);
    expect(feed.unread, 0, reason: 'opening the list marks them read');
  });

  test('notifications: time ago in plain words', () {
    final now = DateTime.utc(2026, 11, 25, 12);
    expect(timeAgo('2026-11-25T11:59:30Z', now), 'just now');
    expect(timeAgo('2026-11-25T11:55:00Z', now), '5 min ago');
    expect(timeAgo('2026-11-25T09:00:00Z', now), '3 h ago');
    expect(timeAgo('2026-11-24T10:00:00Z', now), 'yesterday');
    expect(timeAgo('2026-11-20T12:00:00Z', now), '5 days ago');
  });

  testWidgets('business sign-up: the business type must be chosen when there are types', (tester) async {
    _tallScreen(tester);
    final typed = <String, dynamic>{
      for (final e in site.entries)
        if (e.key != 'categories') e.key: e.value,
      'categories': [
        {'id': 'c1', 'name': 'Salon'},
        {'id': 'c2', 'name': 'Clinic'},
      ],
    };
    await tester.pumpWidget(_app(SignupScreen(site: typed)));
    await tester.pumpAndSettle();
    expect(find.text('Business type *'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextFormField, 'Business name *'), 'Lotus Salon');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Choose your business type'), findsWidgets, reason: 'Next is stopped until a type is chosen');
    expect(find.text('Your customers’ booking form'), findsNothing);
  });

  testWidgets('start / finish setting: two choices, tapping one picks it', (tester) async {
    var value = 'perService';
    await tester.pumpWidget(
      _app(
        Scaffold(
          body: StatefulBuilder(
            builder: (c, set) => TokenFlowChoice(value: value, onChanged: (v) => set(() => value = v)),
          ),
        ),
      ),
    );
    expect(find.text('Each service separately'), findsOneWidget);
    expect(find.text('Whole token at once'), findsOneWidget);
    await tester.tap(find.text('Whole token at once'));
    await tester.pump();
    expect(value, 'whole');
    expect(wholeTokens({'tokenFlow': 'whole'}), isTrue);
    expect(wholeTokens({'tokenFlow': 'perService'}), isFalse);
    expect(wholeTokens(<String, dynamic>{}), isFalse, reason: 'each service on its own is the default');
  });

  Map<String, dynamic> owner(String flow) => {
    'salon': {'currency': '₹', 'tokenFlow': flow},
    'branches': [
      {'id': 'b1', 'name': 'Main'},
    ],
  };
  final Map<String, dynamic> token = {
    'id': 't1',
    'number': 7,
    'prefix': 'A',
    'date': todayIso(),
    'status': 'serving',
    'branchId': 'b1',
    'createdAt': DateTime.now().millisecondsSinceEpoch,
    'total': 300,
    'customer': {'name': 'Ravi', 'mobile': '98765'},
    'items': [
      {'serviceName': 'Cut', 'staffName': 'Anu', 'status': 'in_progress', 'price': 100},
      {'serviceName': 'Spa', 'staffName': 'Sam', 'status': 'waiting', 'price': 150},
      {'serviceName': 'Wash', 'staffName': 'Sam', 'status': 'waiting', 'price': 50},
    ],
  };

  testWidgets('owner tokens: each service has its own Start / Finish (per service)', (tester) async {
    await tester.pumpWidget(
      _app(
        Scaffold(
          body: SingleChildScrollView(
            child: OwnerTokenCard(t: token, d: owner('perService'), onChanged: () async {}),
          ),
        ),
      ),
    );
    expect(find.widgetWithText(Btn, 'Start'), findsNWidgets(2), reason: 'one per waiting service');
    expect(find.widgetWithText(Btn, 'Finish'), findsOneWidget, reason: 'one for the running service');
  });

  testWidgets('owner tokens: one Start / Finish for the whole token (whole)', (tester) async {
    await tester.pumpWidget(
      _app(
        Scaffold(
          body: SingleChildScrollView(
            child: OwnerTokenCard(t: token, d: owner('whole'), onChanged: () async {}),
          ),
        ),
      ),
    );
    expect(find.widgetWithText(Btn, 'Start'), findsNothing, reason: 'no buttons per service');
    expect(find.widgetWithText(Btn, 'Finish'), findsOneWidget, reason: 'one button: finish what is running');
  });

  testWidgets('Google/Apple owner: “Set a password” without the current password', (tester) async {
    session.user = {'role': 'owner', 'name': 'Sana', 'hasPassword': false};
    addTearDown(() => session.user = null);
    await tester.pumpWidget(_opener(openPassword));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('Set a password'), findsWidgets);
    expect(find.widgetWithText(TextFormField, 'Current password *'), findsNothing);
    expect(find.widgetWithText(TextFormField, 'New password *'), findsOneWidget);
  });

  testWidgets('owner with a password: Change password asks for the current one', (tester) async {
    session.user = {'role': 'owner', 'name': 'Sana', 'hasPassword': true};
    addTearDown(() => session.user = null);
    await tester.pumpWidget(_opener(openPassword));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('Change password'), findsWidgets);
    expect(find.widgetWithText(TextFormField, 'Current password *'), findsOneWidget);
  });
}
