# BQuee Biz on Google Play – everything to fill in

Copy each part into Play Console (play.google.com/console, IBILL Software and Consultancy organisation
account). Files are in `5 Documents/Play Store listing – BQuee Biz/` and `6 Built Apps/BQuee-Biz/`.

## 1. Create the app (Home → Create app)

| Field            | Enter                                                    |
| ---------------- | -------------------------------------------------------- |
| App name         | `BQuee Biz – Token & Queue`                              |
| Default language | English (United States) – en-US                          |
| App or game      | App                                                      |
| Free or paid     | Free                                                     |
| Declarations     | Tick both (Developer Programme Policies, US export laws) |

## 2. Upload the app (Test and release → Production → Create new release)

- App bundle: `6 Built Apps/BQuee-Biz/BQuee-Biz.aab` (package `com.ibill.bquee`, version 1.0.0, build 1).
- Play App Signing: choose **Use Google-generated key** (recommended). Your file is signed with your upload key
  (`Keys/1 Google Play (Android) - upload key/bquee-upload.jks`).
- Release name: `1.0.0 (1)`
- Release notes (en-US):

```
First release of BQuee Biz.
• Live token queue for your business – customers book by QR code
• Staff scan tokens to start and finish each service
• Make a token by hand for walk-in customers
• Notifications for new tokens, messages and updates
• Reports, branches, staff, services, offers and reviews
```

## 3. Store listing (Grow users → Store presence → Main store listing)

**App name** (max 30): `BQuee Biz – Token & Queue`

**Short description** (max 80):

```
Digital tokens and live queues for salons, clinics and service businesses.
```

**Full description** (max 4000):

```
BQuee Biz runs your queue from your phone. Replace paper tokens, token machines and crowded waiting rooms with QR tokens and a live waiting time for every customer.

HOW IT WORKS
• Print your branch QR poster and put it at the entrance.
• Customers scan it, choose services and a staff member, and get a numbered token with a live waiting time on their phone – no app needed for them.
• Staff scan the customer's token to start and finish each service. The queue moves on its own.

FOR OWNERS
• Live overview: tokens waiting, in service and done today
• All tokens of the day with status, services and staff
• Branches with their own QR code, booking page and queue
• Staff and the services each person does
• Services and prices per branch
• Offers and customer reviews on your booking page
• Reports by day, service, staff and branch – export for Excel
• Your logo and colours on your page

FOR STAFF
• "My queue": who is next for you and how long each service takes
• Scan a token to start and finish
• New token for a walk-in customer at the counter, in a few taps
• Go online or offline with one switch

NOTIFICATIONS
• New tokens, cancelled tokens, support replies and updates – in the app and in your phone's status bar

MADE FOR
Salons, barbershops, beauty parlours, spas, clinics, hospital OPDs, labs, service centres, repair shops and offices – anywhere people wait their turn.

Works in the UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, India and Europe. Prices in your own currency.

New business? Sign up in the app or at bquee.com and take your first QR booking today.

Questions or a demo: info@bquee.com · +971 56 570 8076
BQuee is a product of IBILL Software and Consultancy FZ-LLC.
```

**Graphics**

| Item                       | File                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App icon (512×512)         | `BQuee-Biz-icon-512.png`                                                                                                                                           |
| Feature graphic (1024×500) | `BQuee-Biz-feature-graphic-1024x500.png`                                                                                                                           |
| Phone screenshots (2–8)    | `Phone screenshots/With headlines/` – all 7, in number order (1080×1920). Plain app screens without headlines are in `Phone screenshots/Plain/` if you prefer them |
| Tablet screenshots         | Optional – leave empty                                                                                                                                             |

## 4. Store settings (Store presence → Store settings)

| Field        | Enter                                                      |
| ------------ | ---------------------------------------------------------- |
| App category | Business                                                   |
| Tags         | Business, Productivity, Scheduling (pick what Play offers) |
| Email        | info@bquee.com                                             |
| Phone        | +971 56 570 8076                                           |
| Website      | https://bquee.com                                          |

## 5. App content (Policy and programmes → App content)

**Privacy policy**: `https://bquee.com/privacy`

**App access**: "All or some functionality is restricted". Add instructions:

- Name: `Demo business for review`
- Username / password: a demo business account **you** create on bquee.com (Admin → Businesses → New business,
  e.g. "Play Review Demo" with a few services and one staff member). Type its username and password into Play
  yourself.
- Other info:

```
Sign in with the username and password above on the first screen ("Sign in"). This is a business owner account of a demo business. Owners see Overview, Tokens, Staff, Services, Reports, Branches & QR. To try the queue, open the branch booking page from Branches & QR, book a token, then scan or open it in the app.
```

**Ads**: No, the app does not contain ads.

**Content rating** (questionnaire): Category **All other app types**. Answer **No** to violence, sexual
content, language, controlled substances, gambling and simulated gambling. "Users can interact or exchange
content": **No** (support messages go only to the BQuee team). "Shares the user's location": **No**. "Digital
purchases": **No**. Expected rating: Everyone / 3+.

**Target audience and content**: Ages **18 and over** only. Does it appeal to children: **No**.

**News app**: No. **Health apps**: none. **Financial features**: none. **Government app**: No.

**Advertising ID**: No, the app does not use an advertising ID.

**Data safety**:

| Question                                                | Answer                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Collects or shares any of the required user data types? | Yes                                                                                          |
| Is all data encrypted in transit?                       | Yes (HTTPS only)                                                                             |
| Can users ask for their data to be deleted?             | Yes – in the app (Profile → Delete or deactivate account) and at `https://bquee.com/request` |
| Data shared with third parties?                         | No                                                                                           |

Data types collected (all: **Collected**, not shared, processed for **App functionality** and **Account
management**; "Developer communications" too for email/phone; required, not optional unless noted):

- Personal info → **Name**, **Email address**, **Phone number**, **User IDs** (username)
- Photos and videos → **Photos** (business logo and pictures the owner uploads – optional)
- Messages → **Other in-app messages** (support tickets with the BQuee team – optional)
- App activity → **Other user-generated content** (services, offers, business details)

Not collected: location, financial info, health, contacts, calendar, files, audio, web history, device IDs, crash
logs, analytics.

**Account deletion URL** (Play asks separately): `https://bquee.com/request`

## 6. Countries (Production → Countries / regions)

Add: United Arab Emirates, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, India, United Kingdom, Ireland and the
EU countries you serve – or **all countries**.

## 7. Send for review

Publishing overview → **Send changes for review**. Google usually answers within a few days.

## Permissions the app uses (in case Play asks)

- **Camera** – staff scan the QR code on customers' tokens.
- **Notifications** – new tokens, "your turn" and messages in the status bar.
- **Run at start-up** (RECEIVE_BOOT_COMPLETED) – keeps the background check for new notifications after a restart.
- **Internet** – talks to bquee.com.
