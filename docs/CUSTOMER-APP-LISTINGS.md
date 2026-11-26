# BQuee (customer app) – Google Play and App Store, everything to fill in

The app for customers: find a business, scan its QR code, book a token and follow the queue live.
Package / Bundle ID **`com.bquee.customer`**, version 1.0.0 (1). Files: `5 Documents/Store listing – BQuee customer app/`
and `6 Built Apps/BQuee-Customer/` (after **Build BQuee Customer**).

## Texts (both stores)

**App name** (30): `BQuee – Book Tokens & Queue`

**Short description / Subtitle**

- Google Play short description (80): `Book a token, skip the waiting room and see your place in the queue live.`
- App Store subtitle (30): `Skip the waiting room`

**App Store promotional text** (170):

```
Scan the QR code at a salon, clinic or service centre, book your token and wait anywhere. BQuee shows how many are ahead and tells you when it's your turn.
```

**Full description** (Google Play and App Store):

```
BQuee takes the waiting out of waiting rooms. Book a token at salons, barbershops, spas, clinics, labs and service centres, then wait wherever you like – BQuee shows your place in the queue live and tells you when it's your turn.

HOW IT WORKS
• Scan the business's QR code, or find it in the app.
• Choose your services and a staff member (or "no preference").
• Get a numbered token with a live waiting time.
• Wait in a café, your car or at home – come back just in time.
• Show your token's QR code at the counter; staff scan it to start your service.

FEATURES
• Live waiting time and the number of people ahead of you
• "It's your turn" notifications on your phone
• All your tokens in one place – today's and past visits
• Book again in one tap
• Offers and reviews from the business
• Works in the UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, India and Europe

Your account holds only your name, phone number and email. You can delete it at any time in Profile.

Questions: info@bquee.com · +971 56 570 8076
BQuee is a product of IBILL Software and Consultancy FZ-LLC.
```

**App Store keywords** (100):

```
queue,token,booking,salon,clinic,waiting,QR,appointment,barber,spa,line,turn,walk-in,wait time
```

**Release notes / What's new**: `First release of BQuee.`

## Graphics

| Item                                   | File                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| Google Play app icon (512×512)         | `BQuee-icon-512.png`                                     |
| Google Play feature graphic (1024×500) | `BQuee-feature-graphic-1024x500.png`                     |
| Google Play phone screenshots          | `Screenshots/Google Play/With headlines/` (1080×1920)    |
| App Store iPhone 6.9"                  | `Screenshots/iPhone 6.9/With headlines/` (1320×2868)     |
| App Store iPad 13"                     | `Screenshots/iPad 13/With headlines/` (2064×2752)        |
| App Store icon                         | Comes from the app build (1024×1024, already in the app) |

Plain versions without headlines are next to each "With headlines" folder.

## Google Play

1. **Create app**: name above, English (United States), App, Free, tick both declarations.
2. **Production → Create new release**: upload `BQuee-Customer.aab`, Google-generated app signing key, release
   name `1.0.0 (1)`.
3. **Store settings**: category **Lifestyle** (or **Business**), email `info@bquee.com`, phone
   `+971 56 570 8076`, website `https://bquee.com`.
4. **App content**
   - Privacy policy: `https://bquee.com/privacy`
   - App access: "All functionality is available without special access" is **not** right – customers sign in.
     Choose "restricted" and give a demo customer account you create in the app (Sign up with any test email).
   - Ads: No. Target audience: **18 and over**. News app: No. Government: No. Financial / health features: none.
   - Content rating: All other app types; **No** to everything; users interact: **No**; location: **No**;
     digital purchases: **No** → Everyone.
   - Advertising ID: No.
   - Data safety: collects data **Yes**; encrypted in transit **Yes**; deletion **Yes** (Profile → Delete or
     deactivate my account, and `https://bquee.com/request`); shared: **No**. Types (collected, for App
     functionality and Account management): **Name**, **Email address**, **Phone number**, **User IDs**,
     **Photos** (optional profile photo), **App activity → Other actions** (bookings and tokens).
   - Account deletion URL: `https://bquee.com/request`
5. **Countries**: as for BQuee Biz. **Send for review**.

## Apple App Store

1. **New App**: iOS, name above, English (U.S.), Bundle ID `com.bquee.customer`, SKU `bquee-customer-ios`.
2. **App information**: subtitle above; category **Lifestyle** (secondary **Business**); age rating all
   **None** → 4+; privacy policy `https://bquee.com/privacy`.
3. **Version 1.0**: screenshots (iPhone 6.9" and iPad 13"), promotional text, description, keywords; support URL
   `https://bquee.com/#contact`; marketing URL `https://bquee.com`; copyright
   `2026 IBILL Software and Consultancy FZ-LLC`.
4. **Build**: open `1 Full Source Code/customer/ios/Runner.xcworkspace`, Signing & Capabilities → Team
   **Illiyas Ca**, Any iOS Device → Product → Archive → Distribute App → App Store Connect → Upload; then pick build
   1.0.0 (1).
5. **App Review information**: sign-in required **Yes** – a demo customer account you create in the app. Notes:

```
BQuee is the customer app of BQuee (bquee.com). Sign in with the demo account above. Explore shows businesses; open one, choose a service and book a token. My tokens shows the live waiting time and the token's QR code. Account deletion: Profile → Delete or deactivate my account, or https://bquee.com/request.
```

6. **App Privacy**: collects data **Yes**, linked to the user, not used for tracking, purpose App Functionality:
   Contact Info → Name, Email Address, Phone Number; User Content → Photos (optional profile photo);
   Identifiers → User ID; Usage Data → Product Interaction (bookings and tokens).
7. **Pricing**: Free, all or your countries. **Submit to App Review**.

## Permissions (if asked)

- **Camera** – scan a business's QR code to open its booking page.
- **Notifications** – "It's your turn" and changes to your token.
- **Run at start-up** – keeps the background check for notifications after a restart.
