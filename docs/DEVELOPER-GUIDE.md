# BQuee – developer guide

**Read this first.** It explains the whole project – what it does, how the code is laid out, the database,
the main algorithms, how each flow works end to end, and the rules for changing it safely. It is written for
a new developer or an AI assistant picking the project up with no other context.

Other documents (more detail on one topic):

| File                                   | What's in it                                                |
| -------------------------------------- | ----------------------------------------------------------- |
| [README.md](../README.md)              | Install, run, configure, demo logins                        |
| [DATABASE.md](DATABASE.md)             | Every table and column (generated from the live schema)     |
| [TESTING.md](TESTING.md)               | Every test suite and what it proves; latest results         |
| [SECURITY.md](SECURITY.md)             | What protects the system, and where                         |
| [OPERATIONS.md](OPERATIONS.md)         | Running production: secrets, backups, monitoring, incidents |
| [AUDIT-RESPONSE.md](AUDIT-RESPONSE.md) | The Nov 2026 security audit and how each point was handled  |
| [SEO.md](SEO.md)                       | Keywords, technical SEO and the off-page checklist          |

---

## Contents

1. [What BQuee is](#1-what-bquee-is)
2. [Words used in the code](#2-words-used-in-the-code)
3. [The big picture](#3-the-big-picture)
4. [Folder map](#4-folder-map)
5. [Running it on your computer](#5-running-it-on-your-computer)
6. [The server](#6-the-server)
7. [The database](#7-the-database)
8. [Core algorithms](#8-core-algorithms)
9. [Main flows, end to end](#9-main-flows-end-to-end)
10. [The website (web client)](#10-the-website-web-client)
11. [The phone apps](#11-the-phone-apps)
12. [Security in one page](#12-security-in-one-page)
13. [Tests and the GitHub check](#13-tests-and-the-github-check)
14. [Deploying](#14-deploying)
15. [Project rules – read before changing anything](#15-project-rules--read-before-changing-anything)
16. [How to… (recipes)](#16-how-to-recipes)
17. [Scaling: what holds, what to do next](#17-scaling-what-holds-what-to-do-next)
18. [API reference](#18-api-reference)
19. [History and odd names](#19-history-and-odd-names)

---

## 1. What BQuee is

BQuee is a **QR token booking system for walk-in service businesses** (salons, spas, clinics, repair shops…).
It is a multi-business SaaS: one installation serves many businesses.

- A **customer** scans the QR poster at a branch (or opens the link), picks services and optionally a staff
  member, and gets a numbered **token** with a QR code and a live waiting time. No sign-up needed.
- **Staff** scan the customer's token QR: the first scan starts the service, the next scan finishes it.
- The **business owner** manages branches, services, staff, offers, reviews, the business page, and sees
  tokens and reports.
- The **super admin** (BQuee itself) creates and manages businesses, categories, default services, the home
  page, a team of **platform staff** with chosen permissions, referral links, support tickets and reports.

There are four front-ends, all talking to one server:

| Front-end         | Who uses it                                            | Code                                   |
| ----------------- | ------------------------------------------------------ | -------------------------------------- |
| Website           | Everyone (customers, staff, owners, admin)             | `client/src` → built into `public/app` |
| **BQuee Biz** app | Super admin, team, owners, staff                       | `mobile/` (Flutter)                    |
| **BQuee** app     | Customers (accounts, find businesses, book, my tokens) | `customer/` (Flutter)                  |
| Shared app code   | Both apps                                              | `app-shared/`                          |

---

## 2. Words used in the code

The project started as a salon app, so some names in the code are older than the product name.

| In the code                                      | Means                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `salon`, `salons` table, `salon_id`              | A **business** (any kind, not just salons)                                                        |
| `branch`                                         | One location of a business. Has its own QR poster, queue and token numbers                        |
| `token`                                          | One customer visit (a ticket with a number, e.g. `A-12`)                                          |
| `token_item`                                     | One service inside a token, with its own staff member and status                                  |
| `staff` (table)                                  | A business's worker. May also have a login (`users.role = 'staff'`)                               |
| `owner`                                          | Business owner login (`users.role = 'owner'`)                                                     |
| `superadmin`                                     | BQuee's own administrator                                                                         |
| `platform_staff`                                 | A BQuee **team** member (not business staff) with ticked permissions                              |
| `customer`                                       | A person with a BQuee customer-app account (`customers` table). Walk-in customers need no account |
| `features` / `menus`                             | Per-business switches the super admin controls (e.g. hide customer phone numbers)                 |
| `category` / `service group` / `default service` | Business types, their service groups, and ready-made services owners can load                     |
| `cycle`                                          | How many times a branch's token numbers were reset today                                          |
| MFA / two-step sign-in                           | Authenticator-app code after the password (TOTP)                                                  |

---

## 3. The big picture

```
  Customers' phones / browsers           Staff, owners, admin
   ┌───────────────┐  ┌──────────────┐    ┌───────────────┐  ┌──────────────┐
   │ Website (PWA) │  │ BQuee app    │    │ Website       │  │ BQuee Biz app│
   │ cookie session│  │ bearer token │    │ cookie session│  │ bearer token │
   └──────┬────────┘  └──────┬───────┘    └──────┬────────┘  └──────┬───────┘
          │ HTTPS (JSON /api/…, static files)    │                  │
          └────────────────┬────────────────────┴──────────────────┘
                           ▼
              ┌─────────────────────────────┐
              │  server.js  (Node.js ≥ 20,  │   no npm packages at runtime
              │  plain http/https module)   │
              │  src/app.js → router →      │
              │  routes/* → services/*      │
              └──────────────┬──────────────┘
                             │ our own PostgreSQL client (src/db/postgres.js)
                             ▼
              ┌─────────────────────────────┐
              │  PostgreSQL (27 tables)     │  migrations in src/db/migrations
              └─────────────────────────────┘
  Uploaded pictures: disk (storage/uploads) or the `images` table (UPLOADS_STORAGE=database).
```

Key design choices (keep them):

- **Self-contained.** The server uses only Node.js built-ins. The website is bundled once with esbuild
  and the result is committed. The apps use only Flutter plus our own copies of `material_ui` /
  `cupertino_ui`. Nothing loads from a CDN. Nothing downloads at runtime.
- **The database is the source of truth.** Rate limits, sessions and locks all live in PostgreSQL, so several
  server processes can run side by side.
- **Updates come by polling, not sockets.** Screens re-ask the server every 15–30 s, and only while visible.

---

## 4. Folder map

```
server.js                  starts the server: config check, migrations, HTTP(S), maintenance timer
src/
  config.js                every environment variable, read once
  app.js                   builds the request handler: security headers, flood guard, CSRF, routes, static files
  http/
    router.js              tiny router: router.get('/api/x/:id', handler)
    errors.js              HttpError + badRequest/forbidden/notFound helpers
    security.js            headers/CSP, RateLimiter (PostgreSQL), FloodGuard, httpsRedirect
    cookies.js             cookie parse/build
    compress.js            brotli/gzip choice for website files and API answers
    seo.js                 search engines: server-made home/business pages, noindex, 404, robots.txt, sitemap
    static-files.js        serves public/ and uploads, with a bounded cache
  db/
    postgres.js            our PostgreSQL client + pool (TLS, timeouts, transactions)
    migrate.js             runs migrations/*.sql once each, in name order, under a lock
    migrations/001…022     the schema, step by step (never edit old ones)
  services/                business logic, no HTTP – reusable and testable
    auth.js                passwords, sessions, cookies, roles, two-step sign-in
    tokens.js              booking, scanning (start/finish), daily expiry
    queue.js               waiting-time maths (pure functions)
    reports.js             reports for every role
    features.js            per-business menus/features
    totp.js, secret-box.js authenticator codes; encryption of stored secrets
    uploads.js, image-check.js   picture uploads and checking they are real images
    site.js                home page content
    account-requests.js    delete/deactivate account requests
    maintenance.js         hourly clean-up
    serializers.js         database rows → JSON shapes sent to clients
    catalog.js, categories.js, accounts.js, common-passwords.js
  routes/                  one file per area; each exports (router, ctx) => { router.get(…) }
    public.js              no login: business pages, branch queue, booking, token page
    auth.js                sign-in, two-step, sign-out, my profile/password/sessions
    customer.js            BQuee customer app accounts and bookings
    staff.js               scan actions, staff queue, online status
    owner.js               everything an owner manages
    admin*.js              super admin: businesses, team, referrals, catalog, access rules
    reports.js, support.js, site.js, account-requests.js
  utils/                   ids, dates, input validation
  content/legal.js         Terms and Conditions + Privacy Policy text (website pages and server copies)
client/src/                React website source (see section 10)
public/                    what the server serves: index.html, sw.js, icons, fonts, built app in public/app
mobile/                    BQuee Biz Flutter app
customer/                  BQuee customer Flutter app
app-shared/                Dart code used by both apps (API client, theme, widgets, QR engine…)
material_ui/, cupertino_ui/ our own copies of Flutter's widget packages (BSD licence) – don't edit
scripts/                   seed, reset-admin, backup, build-client, package-apps, db-doc, check-secrets…
tests/                     server tests + tests/ui browser checks (Playwright)
deploy/                    systemd unit, nginx example
docs/                      these documents
app-packages/              ready-to-build zips of each app (made by scripts/package-apps.sh)
Dockerfile, docker-compose.yml, start.sh, start.bat   ways to run it
.github/workflows/checks.yml   the GitHub check on every push
```

---

## 5. Running it on your computer

Needs Node.js 20+ and PostgreSQL. (`./start.sh` can download a portable Node.js into `runtime/`.)

```bash
cp .env.example .env                 # set DATABASE_URL
./start.sh seed                      # demo business "Lotus Salon & Spa" + demo logins (empty DB only)
./start.sh                           # http://localhost:3000
```

Demo logins (seed only): `admin` / `Admin@123`, `owner` / `Owner@123`, `staff` / `Staff@123`.
Admin and owner set up two-step sign-in on first sign-in (any authenticator app).

Website development:

```bash
npm install                          # dev only: esbuild, react, react-dom (pinned versions)
npm run build:watch                  # rebuilds public/app on every change in client/src
```

Tests (**the database in TEST_DATABASE_URL is wiped**):

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/bquee_test npm test
```

Apps: on a Mac, `cd mobile && bash tool/build_mac.sh` (same in `customer/`). It installs Java, Flutter and the
Android SDK into `~/bquee-sdk` the first time, then builds Android and iOS. The owner of this project runs the
double-click `.command` files in the BQuee folder instead.

---

## 6. The server

### 6.1 What happens to one request

```
request ─► server.js handler
        ─► app.js
            1. request ID (X-Request-Id), security headers (CSP, HSTS, frame DENY…)
            2. FloodGuard: ≤600 requests/min and ≤200 at once per IP, else 429/503
            3. /api/… ?
               ├─ OPTIONS → 403 (no cross-site API use)
               ├─ JSON body (≤4 MB) must be an object
               ├─ cookie session + non-GET → CSRF check (header token = cookie, same Origin)
               ├─ router.match(method, path) → handler({ req, res, body, query, params, ip })
               └─ result → JSON 200 (≥1 KB: brotli/gzip, except sign-in answers) · HttpError → its status + { error } · other error → 500 (logged with request ID)
            4. otherwise → seo.js first: / and /s/<slug> get a server-made page (title, text, structured data),
               private pages get noindex, /robots.txt and /sitemap.xml (see docs/SEO.md)
            5. then static-files.js: public/ (the website, gzip at once, strongest brotli made in the background), /uploads/…
               pictures; an unknown address → index.html with HTTP 404 + noindex (the app shows its "not found" page)
```

### 6.2 A route file

Every file in `src/routes/` looks like this:

```js
module.exports = function (router, { db, auth, tokens, limiter, config }) {
  router.get('/api/owner/things/:id', async ({ req, params, query }) => {
    const user = await auth.requireUser(req, 'owner'); // 401 / 403 if not allowed
    const id = v.text(params.id, 40); // validate every input
    const { rows } = await db.query('SELECT … WHERE id = $1 AND salon_id = $2', [id, user.salon_id]);
    if (!rows[0]) throw notFound('Not found'); // HttpError → JSON { error }
    return serialize.thing(rows[0]); // whatever is returned is sent as JSON
  });
};
```

Rules that keep it safe:

- **Always** filter by the signed-in user's business (`salon_id = $n`). This is the tenant wall.
- **Always** use `$1, $2…` parameters. Table/column names in SQL may only come from fixed lists in the code.
- **Validate** with `src/utils/validate.js` (`v.text`, `v.integer`, `v.money`, `v.date`, `v.email`…). They
  refuse objects/arrays where text or numbers are expected.
- Throw `badRequest / forbidden / notFound` (from `http/errors.js`) with a message a user can understand –
  it is shown as-is in the apps and the website.
- Rate-limit anything a stranger can call: `limiter.check(bucket, ip, max, windowMs)`.

### 6.3 Who may do what

| Role               | Signs in at                | Can                                                                                                                                                                                         |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `superadmin`       | `/login`, Biz app          | Everything                                                                                                                                                                                  |
| `platform_staff`   | `/login`, Biz app          | Business list always; the rest only with ticked permissions: `salons.create`, `salons.edit`, `salons.toggle`, `salons.delete`, `revenue.view`, `defaults.manage` (`routes/admin-access.js`) |
| `owner`            | `/s/<slug>/login`, Biz app | Their own business; menus the super admin switched off are blocked (`ownerWith(req, 'menu')` in owner.js)                                                                                   |
| `staff`            | `/s/<slug>/login`, Biz app | Their queue, scanning their own services, their reports (if allowed)                                                                                                                        |
| customer (account) | BQuee app                  | Their profile and bookings                                                                                                                                                                  |
| nobody             | –                          | Business pages, branch queue numbers, booking, token page                                                                                                                                   |

Per-business switches (`services/features.js`): owner menus (`tokens`, `reports`, `branches`, `services`, `staff`,
`offers`, `reviews`, `settings`), `maskContacts` (hide customer phone/email from owner and staff),
`reportExport`, `staffReports`. Stored as JSON in `salons.features`.

### 6.4 Sessions

|           | Website                                                                                   | Apps                            |
| --------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| How       | `HttpOnly` cookie `__Host-bq_session` (+ readable `bq_csrf` cookie for CSRF)              | `Authorization: Bearer <token>` |
| Marked by | header `X-BQuee-Client: web`                                                              | –                               |
| Stored    | `sessions` table holds only the SHA-256 of the token                                      | same                            |
| Length    | admin/team 12 h · owner 14 days · staff 30 days · customers (`customer_sessions`) 90 days | same                            |

`auth.requireUser(req, ...roles)` finds the session, checks it hasn't expired, and checks the account and its
business are active and the role is allowed.

### 6.5 Configuration

All environment variables are read in `src/config.js`: `DATABASE_URL`, `DATABASE_POOL_SIZE`, `PORT`, `TZ`,
`NODE_ENV`, `PUBLIC_URL` / `PUBLIC_HOSTS`, `APP_SECRET`, `TRUST_PROXY`,
`ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`, `SEED_DEMO_DATA`, `UPLOADS_STORAGE` / `UPLOADS_DIR`,
`HTTPS_CERT` / `HTTPS_KEY` / `HTTP_REDIRECT_PORT`, `API_REQUESTS_PER_MINUTE`. See README section 4.

**Package prices by country** (`src/services/fx.js`, `src/services/world.js`; self-contained): BQuee knows
every currency (about 150, with their countries) and maps IANA time zones to countries. The super admin lists
the currencies they sell in with a rate each (`currencies: [{ code, rate }]`, 1 US$ = rate) and gives packages
optional fixed prices (`fixedPrices: "₹999, AED 149, $39"`). A visitor sees the fixed price for their currency,
else the US$ price converted, else the main price converted; a currency not listed shows US$.
`/api/public/site?tz=…&region=…` returns `plans[].prices`, `currencies` (on sale) and `currencyHint` (the
visitor's currency from that time zone/region); the website and BQuee Biz send the device's values and show
a "Prices in" menu. Sign-up sends `currency`; the server works the amount out again.

**`TZ` matters:** "today" (token dates, daily numbers, reports) follows the server's time zone. Set
`TZ=Asia/Kolkata` (or the businesses' zone).

---

## 7. The database

PostgreSQL, 27 tables. Ids are random 12-character hex text (`utils/ids.js`). Full column list: [DATABASE.md](DATABASE.md)
(regenerate with `DATABASE_URL=… node scripts/db-doc.js` after a migration).

### 7.1 Tables by area

| Area               | Tables                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Businesses         | `salons` (a business: name, slug, category, plan, expiry, features, branding), `branches`, `business_categories`, `service_groups`, `default_services`                                                            |
| What's sold        | `services`, `service_branches` (which branches offer a service; none = all), `service_branch_prices` (price override per branch), `staff`, `staff_services` (who can do what), `offers`, `testimonials` (reviews) |
| Queue              | `tokens`, `token_items`, `token_counters` (last number per branch per day)                                                                                                                                        |
| People and sign-in | `users` (superadmin, platform_staff, owner, staff logins), `sessions`, `mfa_challenges`, `customers`, `customer_sessions`, `rate_limits`                                                                          |
| BQuee itself       | `site_content` (home page), `referral_links`, `support_tickets`, `support_messages`, `account_requests`, `images` (pictures when stored in the database)                                                          |

### 7.2 How they connect

```
business_categories ─┬─< service_groups
                     ├─< default_services
                     └─< salons (category_id) >── referral_links (referral_link_id), users (onboarded_by)
salons ─┬─< branches ─┬─< staff ─< staff_services >─ services
        │             ├─< token_counters (one row per branch per day)
        │             └─< tokens ─< token_items >─ services, staff
        ├─< services ─< service_branches / service_branch_prices >─ branches
        ├─< offers, testimonials, support_tickets ─< support_messages
        └─< users (owner and staff logins; staff users point at staff.id)
users ─< sessions, mfa_challenges, referral_links
customers ─< customer_sessions;  tokens.customer_id → customers (set when booked in the app)
```

Deleting a business cascades to everything under it. A branch can't be deleted while staff belong to it
(`RESTRICT`). Tokens keep a copy of the service name, price and duration (`token_items`), so later
price changes don't rewrite history.

### 7.3 Migrations

- `src/db/migrations/NNN_name.sql`, applied once each in name order, recorded in `schema_migrations`.
- Each file runs in a transaction under an advisory lock, so two servers starting together are safe.
- **Never edit a migration that has shipped.** Add a new file with the next number (`023_…`).
- Run automatically at server start (`server.js`), or `npm run migrate`.

---

## 8. Core algorithms

### 8.1 Token numbers (per branch, per day)

`token_counters` holds `(branch_id, token_date) → last_number, cycle`. Booking does, inside the booking
transaction:

```sql
INSERT INTO token_counters (branch_id, token_date, last_number) VALUES ($1, $2, 1)
ON CONFLICT (branch_id, token_date) DO UPDATE SET last_number = token_counters.last_number + 1
RETURNING last_number, cycle
```

One atomic statement, so two bookings at the same moment (even on two servers) can never get the same number
(tested in `tests/concurrency-audit.js`). A new day is a new row, so numbers restart at 1 each day. The owner's
**Reset numbers** sets `last_number = 0` and `cycle + 1`. The displayed number is `prefix + number`, e.g. `A-7`.

### 8.2 Booking: choosing the staff member

`services/tokens.js → book()`, one transaction:

1. Check the branch and its business are active and not expired.
2. For each chosen service (max 20, no duplicates): the service must belong to the business and be offered at
   this branch. Use the branch's price if one is set. Eligible staff = active, **online**, at this branch,
   able to do the service.
3. If the customer chose a staff member, use them. For **"No preference"**, pick the eligible staff member
   with the **least work queued** (`queue.staffLoad`), counting work already given to them in this same
   booking.
4. Check the offer (same business, active, not expired); take the next token number; insert the token and
   its items.

### 8.3 Waiting time (`services/queue.js`, pure functions)

- Each staff member has their own queue, in booking order (`created_at`, then number).
- Minutes left on one item: waiting → its full duration; running → `duration − minutes since start`, but at least
  1 (an overrunning service still keeps the person busy).
- For each service the customer is still waiting for, the wait is the work left on that staff member's queue
  **from customers booked earlier**, plus any service they are running for a later customer.
- The customer's wait is the **smallest** of those (they're called as soon as any service can start). It is
  never less than the time left on their own running service, because a customer can't be in two chairs at once.
- "Ahead" = how many earlier customers are in that queue. Rounded up to whole minutes.

Hand-worked cases are in `tests/queue.test.js`. Change the maths there first, then in `queue.js`.

### 8.4 Token status

Each `token_item` is `waiting → in_progress → done` (or `missed`). The token's status comes from its items
(`statusFromItems`): all done → `done`; any running → `serving`; else `waiting`. An owner can also set
`cancelled`. **Daily expiry** (`expireStaleTokens`): tokens from earlier days that are still open become
`missed` (or `done` if something was finished). Running items are closed at their planned end.

### 8.5 Scanning (staff)

`POST /api/token/:id/next` (`tokens.act`): locks the token row (`FOR UPDATE`) and looks only at the scanning
staff member's own items. If one of them is running, it is finished; otherwise their next waiting one starts. One
QR code and one button for everything. Starting also marks the staff member online.

**Starting and finishing tokens** (owner's Settings, `salons.token_flow`, sent as `salon.tokenFlow`):
- `perService` (default) – each service on a token has its own Start / Finish (`start` / `finish` with
  `{ index }`), on the owner's Tokens page, the staff queue and the token page, in the website and the Biz app.
- `whole` – one Start / Finish per token: `start`, `finish` and `next` without an index act on **all** of the
  person's services at once (a staff member's own; every service for the owner). The customer's "It's your
  turn" names all services started together.

### 8.6 Sign-in limits (`http/security.js → RateLimiter`)

A sliding window stored in PostgreSQL (`rate_limits`: key, current window count, previous window count).
`allowed if previous × (time left of window ÷ window) + current < max`, which is smoother than fixed windows.
`attempt()` counts only **failed** tries (HTTP 401), so successful sign-ins never lock a user out. Shared by all
server processes. Old rows are removed hourly.

### 8.7 Two-step sign-in (TOTP)

`services/totp.js`, RFC 6238: HMAC-SHA1 over the 30-second step number, 6 digits, ±1 step allowed for clock
drift. The step used last is saved (`users.mfa_last_step`), so a code can't be replayed. Secrets are encrypted
with AES-256-GCM using `APP_SECRET` (`secret-box.js`). 10 backup codes are stored as SHA-256 hashes, and each
works once. Sign-in = password → `mfa_challenges` row (5 tries, short life) → code → session.

### 8.8 QR codes

Own encoder and decoder, so no library is needed: `client/src/lib/qr-encoder.js` / `qr-decoder.js` (website) and
`app-shared/lib/core/qr/` (apps). The token QR holds the token page address `…/t/<tokenId>`. Scanners pull
the id out of it. Round trips are tested in both languages.

### 8.9 Pictures

`services/image-check.js` reads the bytes and accepts only real PNG/JPEG/WEBP (structure, size, no
trailing data, no script text in the picture's text parts – JPG comments/EXIF/XMP, PNG text chunks, WEBP
EXIF/XMP). The compressed picture data itself is not searched: random bytes there often look like `<%` or
`#!/` in ordinary photos, and that data is never run. Pictures get random names, size limits per kind (`uploads.js`), and are
served so they can never run as a page. The website and the apps also re-draw pictures as JPG before uploading.

### 8.10 Background clean-up

`services/maintenance.js`, hourly. Takes a database try-lock so only one server does it, then deletes expired
sessions, customer sessions, rate-limit rows, two-step challenges and notifications older than 60 days.

### 8.12 Notifications (`services/notify.js`, no outside service)

One row per person in `notifications` (`user_id` for owners, staff and the BQuee team, `customer_id` for
customers), written when something happens: a new token (owner + the staff on it; not the staff member who made
it by hand), "It's your turn" when a service starts (customer), a cancelled token (customer + staff), a new
business sign-up, a support ticket or reply, an account request (super admin) and the home page contact form /
the hidden `/request` deletion page (BQuee team). "Read" is one number per person (`users.notes_read`,
`customers.notes_read`). Sending never breaks the action – a failure is only logged.
Reading: `GET /api/notifications?after=<id>` (customers: `/api/customer/notifications`) returns only newer
ones; when this server wrote or read that person's newest id in the last 20 seconds and nothing is newer, it
answers from memory without the database. The dashboards ask every 30 s while in front (2 min in the
background, with optional desktop alerts); the apps every 30 s while open, and the phone's own background check
while closed (Android `NotesJob` about every 15 min, iPhone Background App Refresh when iOS allows) shows new ones
in the status bar. There is no Firebase/APNs push, so a closed app can be some minutes late.

### 8.13 Staff-made tokens

`GET /api/staff/my-services` and `POST /api/staff/tokens` (`tokens.book` with `byStaff`): the staff member is
always the one signed in and only services linked to them can be picked; it works while they show as offline.

### 8.14 Sign-up with Google / Apple, and setting a password later

Google/Apple only verifies the email: the owner still fills the whole business sign-up form (package,
business name, **business type – required whenever the BQuee team has set up types**, booking form, name,
mobile). Such accounts start with `users.has_password = false` (sent as `user.hasPassword`); the menu then
shows **Set a password**, and `PUT /api/me/password` accepts the first one without a current password. After
that it works like any other password (current password needed).

### 8.11 Static file cache

`http/static-files.js` caches file bytes by path. An entry is replaced when the file's modified time changes,
the total is capped at 48 MB (oldest out first), and `realpath` blocks symlinks out of the folder.

---

## 9. Main flows, end to end

**Customer books (website, no account)**

1. Scans the branch poster → `/b/<branchId>`. `GET /api/public/landing/:branchId` returns the business, branch,
   services, offers, reviews and live queue numbers.
2. `/b/<branchId>/book`: steps (services → staff → name and mobile) → `POST /api/public/book` (rate-limited).
3. Goes to `/t/<tokenId>`. `GET /api/public/token/:id` every 15 seconds shows number, status, wait and the QR.
   The token can be saved as JPG/PDF. The token id in the link is the customer's proof. It is random and not
   guessable.

**Customer books (BQuee app)** – the same, through `/api/customer/*`. The token is tied to the account and
listed under "My tokens".

**Staff serve** – Biz app or website `/staff` → scanner → `POST /api/token/:id/next` → start, then finish.
Queue at `GET /api/staff/queue` (polled every 15 s).

**Owner sign-up (self-service)** – home page or Biz app "Create business" → steps → `POST /api/public/signup`
(rate-limited; optional approval by the super admin; trial days from the home page settings) → owner account →
two-step setup → dashboard. A referral link (`/?ref=code`) credits the team member who shared it.

**Sign-in with two-step**

```
POST /api/login {username, password}
   → owner/admin/team: { mfa: { step: 'setup'|'verify', challenge, secret?, uri? } }
   → staff: signed in straight away
POST /api/login/mfa {challenge, code}  → session (cookie on web / token in app) + backup codes after setup
```

**Super admin changes many businesses** – tick businesses → "Change selected" → every setting starts at
"No change" → `POST /api/admin/salons/bulk` with only the changed settings (on/off, contact masking, menus,
features). Needs `salons.edit` / `salons.toggle`.

**Account deletion / deactivation** – the user asks (password checked) → `account_requests` → the super admin
approves (carried out) or rejects with a note. Customers ask from the app.

**Support** – owner raises a ticket → messages back and forth → admin closes it. Screens poll every 20–30 s.

**Reports** – `services/reports.js` builds totals by day, service, staff, branch and business from tokens in a
date range. Owner, staff (own work) and admin each get their own view. CSV export if allowed.

---

## 10. The website (web client)

React 19, bundled by `scripts/build-client.js` (esbuild) into `public/app/app.js` + `app.css`. **The built
files are committed.** Rebuild with `npm run build` after any change in `client/src`, and commit both. The
GitHub check fails if they differ.

```
client/src/
  main.jsx         route table: / · /login · /signup · /admin · /owner · /staff · /s/:slug · /s/:slug/login
                   · /b/:branchId · /b/:branchId/book · /t/:tokenId · /terms · /privacy
  core/            api.js (fetch wrapper: cookies, CSRF header, errors), router.jsx (tiny history router),
                   ui.jsx (dialogs, toasts, useLoad, useInterval…), format.js, Steps.jsx (stepper), pwa.jsx
  pages/           Home (BQuee home page), Account (sign in / sign up), Login (business sign-in), MfaStep
  customer/        Landing, Booking, BookingSteps, TokenPage, QueueCheck…
  dash/            AdminApp + its tabs, Shell (dashboard frame), StaffApp, Reports, Support, dialogs
  dash/owner/      OwnerApp + its pages (Branches, Services, Staff, Offers, Tokens, Settings…)
  lib/             QR encoder/decoder, camera Scanner, PDF and poster makers, token image
  styles/          plain CSS: tokens.css (colours, sizes) + one index file per area importing small files
```

- No CSS framework and no UI library: plain CSS with variables. Each area has an index file (`styles/dash.css`
  etc.) that `@import`s small files.
- `public/sw.js` is a service worker: it caches the app shell and pictures for offline and install, and
  **never caches `/api`**. Raise its `VERSION` when you change what it caches. Sign-out clears it.
- Inline scripts are blocked by CSP. Don't add any, and don't load anything from another site.

---

## 11. The phone apps

|            | BQuee Biz (`mobile/`)                                                   | BQuee (`customer/`)  |
| ---------- | ----------------------------------------------------------------------- | -------------------- |
| Users      | super admin, team, owners, staff (screen chosen by role in `main.dart`) | customers            |
| Package id | `com.ibill.bquee`                                                       | `com.bquee.customer` |
| Server     | `kDefaultServer` in `lib/core/session.dart`, HTTPS only                 | same                 |
| Version    | `1.0.0+1` in `pubspec.yaml` – **don't change unless the owner asks**    | same                 |

```
app-shared/lib/
  core/api.dart        HTTP client (dart:io), JSON, ApiException, refuses non-HTTPS
  core/native.dart     MethodChannel 'bquee/native' → Kotlin/Swift: prefs, secure secrets (Keystore/Keychain),
                       camera + torch, image picker, share, openUrl (safe link kinds only)
  core/format.dart     money, dates, status names, initials
  core/qr/             QR encoder + decoder
  ui/theme.dart        colours (Tk), fonts, buildTheme(brandColour), brandOf(context)
  ui/widgets.dart      exports all shared widgets (ui/widgets/*.dart: buttons, cards, forms, filters, …)
  ui/steps.dart        StepBar + StepFormPage (long forms in steps)
  screens/             screens both apps use (account deletion request, Privacy Policy and Terms)
mobile/lib/screens/    login, signup, mfa, shell, scanner, reports, support, profile, token_detail
                       admin/ (businesses, business_form, business_features, team, website, catalog…),
                       owner/ (overview, tokens, branches, services, staff, marketing, settings), staff/
customer/lib/screens/  home, explore, business, book, tokens, scanner, auth, profile
```

- **No packages from pub.dev.** Camera, secure storage, sharing and pictures are done natively in
  `android/app/src/main/kotlin/…/MainActivity.kt` and `ios/Runner/AppDelegate.swift`. Each of these files
  exists once per app, so change both apps.
- Sessions: the token is kept in the secure store. `session.dart` moves an old plain token into it and swaps
  it for a fresh one.
- Screens refresh with `Loaded(... every: Duration(seconds: 15))` (`screens/common.dart`).
- Build: `tool/build_mac.sh`. Ready-to-build zips: `bash scripts/package-apps.sh` → `app-packages/`.

---

## 12. Security in one page

Details in [SECURITY.md](SECURITY.md).

- **Passwords:** scrypt hashes. 8+ characters (12+ for admin/team). Common passwords refused.
- **Two-step sign-in:** required for super admin, team and owners.
- **Website session:** HttpOnly cookie + CSRF token + Origin check. **Apps:** secure store + HTTPS only.
- **Tenant wall:** every owner/staff query filters by their `salon_id`. Tested in the API and security audits.
- **SQL:** parameters only. **XSS:** React escaping + strict CSP. **Clickjacking:** framing denied.
- **Limits:** per-IP flood guard; per-IP and per-account sign-in limits (in PostgreSQL); booking/lookup limits.
- **Database TLS:** verified certificate required in production over the internet.
- **Uploads:** content-checked pictures only.
- **Secrets:** `APP_SECRET` encrypts authenticator keys. The secret scan runs on every push.

---

## 13. Tests and the GitHub check

```
tests/run.js            runs everything below on a fresh database (npm test)
  qr-engine.test.js       QR draw/read
  queue.test.js           waiting-time maths, hand-worked
  static-files.test.js    path escapes, symlinks, cache cap
  http-rules.test.js      bad %-codes, HTTPS redirect host
  db-driver.test.js       our PostgreSQL client (TLS, timeouts, pool…)
  api-audit.js            every feature end to end, roles, business isolation (~490 checks)
  security-audit.js       injection, XSS, sessions, role climbing, headers, limits
  account-requests-audit.js
  session-audit.js        cookies, CSRF, two-step, session lengths, revocation
  concurrency-audit.js    two servers at once
  helpers/session.js      sign-in helper that also completes two-step sign-in
tests/ui/               Playwright: click-audit.js (every button, every page), qr-ticket-proof.js, responsive-audit.js
mobile/test, customer/test   Flutter widget tests
```

`.github/workflows/checks.yml` runs on every push: syntax check, secret scan, `npm audit`, rebuild and compare the
web bundle, `npm test` on PostgreSQL 16, then `flutter analyze` + `flutter test` for both apps and the shared
code. Update the server only when it passes.

---

## 14. Deploying

- **Live (bquee.com):** Hostinger VPS – Node with PM2 (app `bquee`, port 3105), nginx with https (certbot),
  PostgreSQL on the same server. Update: `cd /var/www/bquee && git pull && pm2 restart bquee --update-env`.
  Migrations run on start. Settings in `/var/www/bquee/.env` (`APP_SECRET`, `PUBLIC_URL`, `TZ`, …).
- **Other servers:** `deploy/bquee.service` (systemd) + `deploy/nginx.conf`, or Docker (`docker-compose.yml`).
- Production runbook (secrets, backups, restore drill, monitoring, incidents, Cloudflare): [OPERATIONS.md](OPERATIONS.md).

---

## 15. Project rules – read before changing anything

1. **Stay self-contained.** No new npm packages at runtime, no pub.dev packages, no CDN, no outside fonts or
   scripts. If something is needed, write it or vendor it into the repo with its licence.
2. **Plain, readable code.** Short functions, comments that say _why_, user-facing messages in simple English.
3. **Don't make changes nobody asked for.** Fix what was asked and mention anything else you noticed.
4. **Every change gets a test.** Server change → add checks to the right audit. App screen → a widget test.
5. **Schema changes = new migration file.** Then regenerate `docs/DATABASE.md`.
6. **Website change → `npm run build` and commit `public/app`.**
7. **Apps: keep version `1.0.0+1`** unless the owner asks. Change both apps when touching shared or native code.
8. **Tenant wall and parameters in every query.** Validate every input.
9. **Never commit secrets** (`.env`, keys). The secret scan will fail the push.
10. **Run `npm test` before pushing**, and watch the GitHub check go green.
11. Commit messages say what changed and why, in plain words.

---

## 16. How to… (recipes)

**Add an API endpoint**

1. Pick the route file for the area (`src/routes/owner.js`…). Add `router.post('/api/owner/…', async ({ req, body }) => {…})`.
2. Check the role first (`auth.requireUser` / `ownerWith(req, 'menu')` / `admin(req, 'permission')`).
3. Validate the body with `v.*`. Put the logic in a service if it's more than a few lines.
4. Add checks to `tests/api-audit.js` (it works, wrong role → 403, other business → 404).
5. Add the call in `client/src/core/api.js` users and/or the app screen.

**Add a column or table**

1. New `src/db/migrations/023_what.sql` (`ALTER TABLE … ADD COLUMN … DEFAULT …`).
2. Update `services/serializers.js` if clients should see it.
3. `npm test`, then `DATABASE_URL=… node scripts/db-doc.js` to refresh DATABASE.md.

**Add a per-business switch for the super admin**

1. `services/features.js`: add it to the defaults (or to `MENUS` for an owner menu).
2. Enforce it on the server (e.g. `ownerWith(req, 'newmenu')`).
3. Show it in `client/src/dash/FeaturesDialog.jsx`, `BulkBusinessDialog.jsx`, and the Biz app
   `screens/admin/business_features.dart`.

**Add a website page**

1. Component in `client/src/pages` (or the area folder). Add it to the route table in `main.jsx`.
2. CSS in a new small file, imported from the area's index CSS.
3. `npm run build`. Add the page to `tests/ui/click-audit.js` so every button on it gets pressed.

**Add an app screen**

1. Screen in `mobile/lib/screens/…` (or `customer/…`), using shared widgets from `bquee_shared/ui/widgets.dart`.
2. Data via `session.api.getJson('/api/…')`, refreshed with `Loaded(…, every: …)` if live.
3. Add a widget test in `test/`. Push and check the GitHub "apps" jobs.

**Change waiting-time maths** – write the expected minutes for your case in `tests/queue.test.js` first, then change `services/queue.js`.

---

## 17. Scaling: what holds, what to do next

What already scales:

- **Several server processes** behind a load balancer. All shared state (sessions, limits, locks, counters) is in
  PostgreSQL, and this is tested with two servers.
- Indexed queries for the hot paths (open tokens by branch and date, sessions by token hash).
- The landing page loads all branches' queues in one query.

Watch, and do next when it grows:

| Sign                           | Do                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Many pictures in the database  | Move to disk or object storage (S3/R2) behind a CDN. `uploads.js` is the only place that stores pictures                |
| Database CPU high from polling | Lower poll rates on hidden screens, add short server-side caching for `/api/public/branch/:id/queue`, or a read replica |
| Pool "server busy" (503)       | Raise `DATABASE_POOL_SIZE` and the database plan                                                                        |
| Large attacks                  | Cloudflare/WAF in front (see OPERATIONS.md)                                                                             |
| Reports slow over long ranges  | Summary table per day per business, filled by the maintenance job                                                       |
| Need instant updates           | Server-Sent Events from the same Node server (still no package needed)                                                  |

---

## 18. API reference

All under `/api`, JSON in and out. Errors are `{ "error": "message" }` with an HTTP status.
Permissions: see section 6.3.

| Area                                | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Health and sign-in                  | `GET health` · `POST login` · `POST login/mfa` · `POST logout` · `GET me` · `PUT me/profile` · `PUT me/password` · `GET me/mfa` · `POST me/mfa/backup-codes` · `GET me/sessions` · `POST me/sessions/revoke-others` · `POST session/rotate` · `POST csp-report`                                                                                                                                                                                                                                                                                        |
| Public (no login)                   | `GET public/site` · `GET public/salon/:slug` · `GET public/landing/:branchId` · `GET public/branch/:id` · `GET public/branch/:id/queue` · `GET public/branch/:id/lookup` · `POST public/book` · `GET public/token/:id` · `GET public/manifest/:id` · `GET public/referral/:code` · `POST public/signup`                                                                                                                                                                                                                                                |
| Customer app                        | `POST customer/signup` · `POST customer/login` · `POST customer/logout` · `POST customer/session/rotate` · `GET/PUT customer/me` · `GET customer/businesses` · `POST customer/book` · `GET customer/tokens` · `GET customer/tokens/:id` · `GET/POST customer/account-request` · `POST customer/account-request/:id/cancel`                                                                                                                                                                                                                             |
| Staff                               | `GET staff/queue` · `PUT staff/status` · `POST token/:id/:action` (start, finish, next, cancel) · `GET token/:id/services` · `GET staff/reports`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Owner                               | `GET owner/data` · `PUT owner/salon` · `POST/PUT/DELETE owner/branches[/:id]` · `POST owner/branches/:id/reset-numbers` · `GET owner/tokens` · `GET owner/default-services` · `POST owner/default-services/load` · `POST/PUT/DELETE owner/services[/:id]` · `POST/PUT owner/staff[/:id]` · `PUT owner/staff/:id/active` · `PUT owner/staff/:id/status` · `POST/PUT/DELETE owner/offers[/:id]` · `POST/PUT/DELETE owner/testimonials[/:id]` · `GET owner/reports` · `GET/POST owner/tickets` · `GET owner/tickets/:id` · `POST owner/tickets/:id/reply` |
| Super admin – businesses            | `GET admin/data` · `POST admin/salons` · `PUT/DELETE admin/salons/:id` · `PUT admin/salons/:id/features` · `POST admin/salons/bulk` · `GET admin/reports`                                                                                                                                                                                                                                                                                                                                                                                              |
| Super admin – people                | `GET/POST admin/team` · `PUT/DELETE admin/team/:id` · `POST admin/users/:id/mfa-reset` · `GET admin/customers` · `PUT admin/customers/:id` · `GET admin/account-requests` · `POST admin/account-requests/:id/decide` · `POST admin/account-requests/:id/reactivate`                                                                                                                                                                                                                                                                                    |
| Super admin – catalog and site      | `GET/POST admin/categories` · `PUT/DELETE admin/categories/:id` · `POST admin/service-groups` · `PUT/DELETE admin/service-groups/:id` · `GET/POST admin/default-services` · `PUT/DELETE admin/default-services/:id` · `GET/PUT/DELETE admin/site` · `GET/POST admin/referral-links` · `PUT admin/referral-links/:id` · `GET admin/tickets` · `GET admin/tickets/:id` · `POST admin/tickets/:id/reply`                                                                                                                                                  |
| Account requests (owner/staff/team) | `GET/POST account-request` · `POST account-request/:id/cancel`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

To list them from the code: `grep -rn "router\.\(get\|post\|put\|delete\)(" src/routes`.

---

## 19. History and odd names

- Product names over time: **SalonQ → TokenQ → BQuee**. The GitHub repo is `lcmproductionspvtltd/token`. Code and the database say `salon` for a business (section 2).
- Apps: **BQuee Biz** (business app, folder `mobile/`) and **BQuee** (customer app, folder `customer/`).
- `material_ui` / `cupertino_ui` are Flutter's own packages, copied in on 19 Nov 2026 so builds need no download
  (see their `BQUEE.md`).
- The PostgreSQL client is our own (a choice made in the Nov 2026 audit). It has its own test suite. Treat it
  as critical code: change it only with tests.
