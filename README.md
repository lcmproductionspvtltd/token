# BQuee – QR token booking for any service business

> **Owner: how to run, go live and update the website and both apps – [docs/FULL-GUIDE.md](docs/FULL-GUIDE.md).**
>
> **Developers (and AI assistants): read [docs/DEVELOPER-GUIDE.md](docs/DEVELOPER-GUIDE.md) first** – the whole project explained: structure, database, algorithms, flows, rules and how-tos.

BQuee is a multi-business SaaS for clinics, salons, service centres, offices and any business with a queue. Customers scan a branch QR code, pick services and staff, and get a digital token with a live waiting time. Staff scan the token to start and finish each service. Service owners manage their business from a dashboard, and a super admin sells and manages business accounts.

- **Self-contained:** no npm packages, CDNs, web fonts or icon libraries. The QR encoder and decoder, the PDF writer and the PostgreSQL driver are all in this repository.
- **Database:** PostgreSQL 13 or newer. Migrations run automatically when the server starts.
- **Runtime:** Node.js 20 or newer. A portable Node.js for Linux x64 ships in `runtime/`, and the start scripts download one for other systems.

---

## Mobile app

The Android and iOS app for super admins, the BQuee team, service owners and staff is in [`mobile/`](mobile/README.md). It uses the same server and logins, and is self-contained in the same way.

Ready-to-build zip packages of both apps (source + one-click Mac build + Windows/Linux steps) are in [`app-packages/`](app-packages/). Download one, unzip it and follow `HOW TO BUILD.txt` inside. After app changes, make new ones with `bash scripts/package-apps.sh`.

## 1. Quick start

### Option A – Docker (app and PostgreSQL together)

```bash
docker compose up -d
docker compose exec app node scripts/seed.js     # optional: demo data
```

Open <http://localhost:3000>. Before going live, set `DB_PASSWORD` and `ADMIN_PASSWORD` in your shell or in a `.env` next to `docker-compose.yml`.

### Option B – Your own PostgreSQL

1. Create a database:

   ```sql
   CREATE USER bquee WITH PASSWORD 'choose-a-password';
   CREATE DATABASE bquee OWNER bquee;
   ```

2. Configure BQuee:

   ```bash
   cp .env.example .env
   # edit DATABASE_URL and ADMIN_PASSWORD
   ```

3. Start BQuee:

   ```bash
   ./start.sh            # Linux / macOS   (Windows: start.bat)
   ./start.sh seed       # optional: demo data
   ```

`npm start`, `npm run seed` and the other npm scripts work too if Node.js is installed.

---

## 2. Test logins (demo data)

`./start.sh seed` loads one sample salon, **Lotus Salon & Spa**, with services, staff, offers, reviews and today's queue. It also creates one test login per role:

| Role          | Username | Password    | Opens    |
| ------------- | -------- | ----------- | -------- |
| Super admin   | `admin`  | `Admin@123` | `/admin` |
| Service owner | `owner`  | `Owner@123` | `/owner` |
| Staff         | `staff`  | `Staff@123` | `/staff` |

Super admin and platform team sign in at `/login`. Service owners and staff sign in on their business's own page, e.g. `/s/lotus-salon/login`. The customer pages need no login: the seed prints the branch link (`/b/lotussalonspa` – the business name; the branch id works too), and the salon page is `/s/lotus-salon`.

> **Two-step sign-in:** the super admin sets it up the first time they sign in (scan the QR code with any authenticator app, then keep the 10 backup codes). Business owners and customers confirm each sign-in with a code emailed to them (once email is set up, see OPERATIONS.md). Staff don't need either.
>
> Change these passwords, or run `./start.sh seed --force` only on a test database, before going live. `--force` deletes **all** data.

Without demo data, the first start creates the super admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD`. If `ADMIN_PASSWORD` is empty, a random password is printed in the log.

---

## 3. How it works

| Who           | Flow                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer      | Scans the branch QR → landing page (live queue, offers, reviews, contact) → chooses services → optionally a staff member → enters name and mobile → gets a numbered token with QR code and a live waiting time. Can book **with an offer** (discount applied), check any token's wait by number, download the token as **JPG** or **PDF**, and **install the site as an app** (Android, iPhone, desktop). |
| Staff         | Signs in on the business's own sign-in page → sees their queue → goes online/offline → scans a token (first scan starts, next scan finishes) → can add extra services to a token.                                                                                                                                                                                                                         |
| Service owner | Branches with QR posters, services (or **load default services** for their business type), staff with logins, offers with optional discounts, reviews, brand colour, logo and cover, social links, live token list with CSV export, and a **reset token numbers** button (numbers also restart daily).                                                                                                    |
| Super admin   | Creates businesses (with **business category**, owner login, plan, price, expiry), manages **business categories** and their **service groups**, the **default services** owners can load, and a **team** of platform staff with ticked permissions. Can **select many businesses** and switch them on/off or change their menus and features (e.g. hide customers’ phone numbers and emails) in one go.  |
| Platform team | Signs in at `/login`; sees the business list and can only do what the super admin allowed (create/edit/enable/delete businesses, see plan amounts, manage default services). Separate from business staff.                                                                                                                                                                                                |

**Screen sizes:** every page adapts to the screen width. Phones get one column. Tablets (700px and wider) get wider pages, two-column grids and two carousel cards at a time. Desktops (1100px and wider) get a full-width landing page, three columns and a side-by-side token page. In the dashboards, the sidebar becomes a slide-out menu on phones and tablets in portrait, and a slim icon rail on tablets in landscape. Tables turn into cards whenever there isn't room for every column.

**Waiting time:** every staff member has their own queue. A customer's wait is the time left on everything booked before them with the same staff member, and a running service counts only its remaining minutes. "No preference" goes to whoever will be free first. Tokens are valid on the day they are booked, and token numbers restart daily per branch.

---

## 4. Configuration (`.env`)

| Variable                   | Default                                       | Purpose                                                                                           |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | `postgres://bquee:bquee@localhost:5432/bquee` | PostgreSQL connection. Add `?sslmode=verify-full` when the database is reached over the internet. |
| `PORT`                     | `3000`                                        | HTTP(S) port                                                                                      |
| `ADMIN_USERNAME`           | `admin`                                       | First super admin                                                                                 |
| `ADMIN_EMAIL`              | –                                             | Optional email login for the super admin                                                          |
| `ADMIN_PASSWORD`           | random                                        | First super admin password (min 12 characters)                                                    |
| `APP_SECRET`               | –                                             | Long random secret that encrypts two-step sign-in keys. Required in production; keep a copy.      |
| `PUBLIC_URL`               | –                                             | The site's address, e.g. `https://bquee.com` (HTTPS redirect, cookie checks)                      |
| `TRUST_PROXY`              | `0`                                           | Set `1` behind Nginx, Caddy or a load balancer                                                    |
| `UPLOADS_STORAGE`          | `disk`                                        | `disk`, or `database` for hosts that wipe the disk on restart                                     |
| `UPLOADS_DIR`              | `storage/uploads`                             | Uploaded logos and photos (disk storage)                                                          |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | – / `465` | A mailbox with SMTP for email codes (sign-up check, forgot password). Empty = codes off |
| `EMAIL_CHECK`              | `optional`                                    | `required` = every sign-up confirms its email with a code (after the new app versions are live) |
| `SEED_DEMO_DATA`           | `0`                                           | `1` loads the demo salon into an empty database on start                                          |
| `HTTPS_CERT` / `HTTPS_KEY` | –                                             | Built-in HTTPS                                                                                    |
| `HTTP_REDIRECT_PORT`       | –                                             | Also listen here and redirect to HTTPS                                                            |

Phones only allow the camera on **HTTPS**. Use a reverse proxy with Let's Encrypt (see `deploy/nginx.conf`) or the built-in HTTPS. For a LAN test certificate, run `sh scripts/make-cert.sh 192.168.1.20`.

---

## 5. Production checklist

- Strong `ADMIN_PASSWORD` (12+ characters), `APP_SECRET` and database password; `SEED_DEMO_DATA=0` for a clean live site, or demo logins removed/changed.
- HTTPS (reverse proxy or built-in) and `TRUST_PROXY=1` behind a proxy.
- Nothing to set for time zones: the business day is the UTC day, and times show in each person's own clock.
- Daily backups: `sh scripts/backup.sh` (database dump plus uploaded images, kept 14 days).
- Process manager: `deploy/bquee.service` (systemd) or Docker with `restart: unless-stopped`.
- Forgotten super admin password or lost two-step phone: `./start.sh reset-admin` (or `node scripts/reset-admin.js admin 'New-long-passw0rd'`).
- Full runbook (backups, restore drill, monitoring, incidents): [docs/OPERATIONS.md](docs/OPERATIONS.md). What protects BQuee: [docs/SECURITY.md](docs/SECURITY.md). Audit answers: [docs/AUDIT-RESPONSE.md](docs/AUDIT-RESPONSE.md).

---

## 6. Project structure

```
server.js                  entry point: migrations, first admin, HTTP(S) server
src/
  config.js                settings from .env / environment
  app.js                   request handling: JSON API + static files
  db/
    postgres.js            PostgreSQL client (wire protocol, SCRAM auth, TLS, pool)
    migrate.js             runs migrations/*.sql once each
    migrations/            database schema
  http/                    router, errors, security headers, rate limiter, static files
  services/                auth, tokens, queue maths, catalogue, uploads, serializers
  routes/                  auth, public, customer app, staff, owner, admin, reports, site, support, account requests
  utils/                   validation, dates, ids
client/src/                React web app (source)
  main.jsx                 routes
  core/                    API client, router, formatting, UI kit (buttons, dialogs, toasts, pagination)
  customer/                landing, booking, token page
  dash/                    dashboard shell, owner sections, staff panel, super admin
  pages/                   home, sign-in
  lib/                     QR encoder/decoder, PDF writer, token image, poster, scanner
  styles/                  design tokens and base, then customer/, landing/, dash/, site/ – one file per
                           screen or part; customer.css, landing.css, dash.css, site.css load them in order
mobile/                    BQuee Biz app (Flutter) – super admin, BQuee team, owners, staff
customer/                  BQuee customer app (Flutter) – scan, book, follow tokens
app-shared/                code both apps share (local Flutter package `bquee_shared`): server
                           connection, formatting, phone features, QR, theme, icons, widgets
material_ui/, cupertino_ui/  our own copy of Flutter's official Material and iPhone-style widget
                           packages (unchanged, from pub.dev) – the apps build without downloading
                           them; see material_ui/BQUEE.md for how to update
app-packages/              ready-to-build zips of both apps (`bash scripts/package-apps.sh`)
docs/                      developer guide, database map, testing, security, operations runbook, audit response
public/                    what the server serves (no CDN, no outside requests)
  index.html
  app/                     built bundle – app.js + app.css (committed, rebuilt by `npm run build`)
  fonts/                   Poppins + Lora (SIL Open Font License), Latin subsets
  img/                     favicon, default salon cover
scripts/                   seed, reset-admin, backup, make-cert, portable Node.js download, app packages, db map
tests/                     server tests (API, security, sign-in, database client, two servers); ui/ browser checks
deploy/                    nginx and systemd examples
runtime/                   portable Node.js (Linux x64 included)
```

---

## 7. Development and tests

```bash
npm test               # QR engine, waiting time, API flows, security, sign-in, database client, two servers at once
npm install            # dev only: React, ReactDOM, esbuild
npm run build          # rebuilds public/app/ from client/src
npm run build:watch    # rebuilds on every change
```

The built files in `public/app/` are committed, so the server needs no build step.

**GitHub check:** every push runs `.github/workflows/checks.yml` – all server tests on a fresh PostgreSQL, the web bundle is rebuilt and must match what is committed, a secret scan, a package security audit, and `flutter analyze` + `flutter test` for both apps.

The tests use `TEST_DATABASE_URL` (default `postgres://bquee:bquee@localhost:5432/bquee_test`), and **that database is wiped on every run**.

Browser checks (need the demo data and Playwright) and the full list of what is tested: see [docs/TESTING.md](docs/TESTING.md). Database map: [docs/DATABASE.md](docs/DATABASE.md).

Code style: Prettier (`.prettierrc.json`) with a 120-character line width and single quotes.
