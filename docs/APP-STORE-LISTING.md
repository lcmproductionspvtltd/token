# BQuee Biz on the Apple App Store – everything to fill in

App Store Connect (appstoreconnect.apple.com), team **Illiyas Ca** (922LKWTMML). Files:
`5 Documents/App Store listing – BQuee Biz/` and `6 Built Apps/BQuee-Biz/`.

## 1. New app (Apps → + → New App)

| Field            | Enter                       |
| ---------------- | --------------------------- |
| Platforms        | iOS                         |
| Name             | `BQuee Biz – Token & Queue` |
| Primary language | English (U.S.)              |
| Bundle ID        | `com.ibill.bquee`           |
| SKU              | `bquee-biz-ios`             |
| User access      | Full access                 |

## 2. App information

| Field              | Enter                                            |
| ------------------ | ------------------------------------------------ |
| Subtitle (30)      | `Live tokens for your business`                  |
| Category           | Primary **Business**, secondary **Productivity** |
| Content rights     | No, it doesn't use third-party content           |
| Age rating         | Answer **None / No** to everything → **4+**      |
| Privacy policy URL | `https://bquee.com/privacy`                      |

## 3. Version 1.0 page

**Screenshots** (drag in number order):

- iPhone 6.9" display: `iPhone 6.9/With headlines/` (1320×2868) – all 7
- iPad 13" display: `iPad 13/With headlines/` (2064×2752) – all 7 (needed: the app also runs on iPad)

**Promotional text** (170):

```
Replace paper tokens and crowded waiting rooms. QR tokens, live waiting times and a queue for every staff member – run it all from your iPhone.
```

**Description**: the same text as the Google Play full description in
`Play Store – what to fill in (BQuee Biz).md` (section 3).

**Keywords** (100, commas, no spaces):

```
queue,token,salon,clinic,booking,QR,waiting,appointment,walk-in,barber,spa,reception,line,staff
```

| Field         | Enter                                        |
| ------------- | -------------------------------------------- |
| Support URL   | `https://bquee.com/#contact`                 |
| Marketing URL | `https://bquee.com`                          |
| Version       | `1.0.0`                                      |
| Copyright     | `2026 IBILL Software and Consultancy FZ-LLC` |

**Build**: upload from Xcode (Product → Archive → Distribute App → App Store Connect → Upload), wait about 15
minutes, then choose build **1.0.0 (2)** here. Export compliance is already answered in the app (it uses only
standard HTTPS encryption).

**App Review information**

- Sign-in required: **Yes**. Username / password: the demo business account you create on bquee.com
  (Admin → Businesses → New business, e.g. "App Review Demo"). Type them in yourself.
- Contact: your name, `+971 56 570 8076`, `info@bquee.com`
- Notes:

```
BQuee Biz is the business app of BQuee (bquee.com): business owners and their staff run a token queue. Sign in on the first screen with the demo account above (a business owner of a demo business). Owners see Overview, Tokens, Staff, Services, Reports and Branches & QR. Staff accounts see "My queue" and can add a token for a walk-in customer. Customers don't need this app – they book in the browser or with our separate customer app, BQuee.
Account deletion: Profile (top right) → Delete or deactivate account, or https://bquee.com/request.
Sign in with Apple is offered next to Google sign-in.
```

## 4. App Privacy (App Privacy → Get started)

Data collection: **Yes**. For each type: **Linked to the user**, **not used for tracking**, purpose **App
Functionality** (and **Customer Support** for contact info).

| Data type                         | Why                                   |
| --------------------------------- | ------------------------------------- |
| Contact Info → Name               | account, shown to the business        |
| Contact Info → Email Address      | sign-in, password reset, replies      |
| Contact Info → Phone Number       | account, business contact             |
| User Content → Photos or Videos   | business logo and pictures (optional) |
| User Content → Customer Support   | support tickets with the BQuee team   |
| User Content → Other User Content | services, offers, business details    |
| Identifiers → User ID             | the account                           |

Not collected: location, health, financial info, contacts, browsing/search history, usage data, diagnostics,
device ID, purchases.

## 5. Pricing and availability

Price **Free**. Availability: all countries, or the ones you serve (UAE, GCC, India, UK, Europe).

## 6. Submit

**Add for Review** → **Submit to App Review**. Apple usually answers within 1–2 days.
