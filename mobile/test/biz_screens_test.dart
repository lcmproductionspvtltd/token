// BQuee Biz screens added with the security review and the step-by-step forms: business sign-up in
// steps, the new/edit business form in steps, changing many businesses at once, and two-step
// sign-in (setup with QR + key, code, backup codes). No server is needed: these check what the
// screen shows and that a step can't be skipped without its required fields.

import 'package:bquee/core/session.dart';
import 'package:bquee/screens/admin/business_features.dart';
import 'package:bquee/screens/admin/business_form.dart';
import 'package:bquee/screens/mfa.dart';
import 'package:bquee/screens/signup.dart';
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

  testWidgets('business sign-up: package prices in the owner’s currency, which they can change', (tester) async {
    _tallScreen(tester);
    await tester.pumpWidget(
      _app(
        const SignupScreen(
          site: {
            'signup': {'enabled': true, 'approval': false, 'trialDays': 14},
            'sections': {'plans': true},
            'categories': <Map<String, dynamic>>[],
            'defaultCurrency': 'USD',
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
    expect(find.byType(DropdownButtonFormField<String>), findsNWidgets(2), reason: 'package + "Prices in"');
    expect(find.text('Prices in'), findsWidgets);
    await tester.tap(find.byType(DropdownButtonFormField<String>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.text('UAE dirham (AED)').last);
    await tester.pumpAndSettle();
    expect(find.text('Business – AED 42 per month (popular)'), findsOneWidget, reason: 'price follows the currency');
    expect(find.text('UAE dirham (AED)'), findsOneWidget);
    await tester.tap(find.byType(DropdownButtonFormField<String>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Indian rupee (INR)').last);
    await tester.pumpAndSettle();
    expect(find.text('Business – ₹999 per month (popular)'), findsOneWidget);
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
    // on/off + contacts + 8 owner menus + 2 features
    expect(find.text('No change'), findsNWidgets(12));
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
}
