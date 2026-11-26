# BQuee – full guide: run on your Mac, go live, update the website and both apps

One place for everything you do by hand. Plain steps, in order. Secrets (passwords, keys) are never written
here – they live in the `Keys` folder on the Mac and in your password manager.

**What BQuee is made of**

| Part | What it is | Where the code is | Where it runs |
|---|---|---|---|
| Website + server | The website, dashboards and the API both apps talk to | `server.js`, `src/`, `client/` | bquee.com (Hostinger VPS) |
| Database | PostgreSQL – all businesses, tokens, users | `src/db/migrations/` (schema) | Same VPS |
| **BQuee Biz** app | Owners, staff, BQuee team, super admin | `mobile/` | App Store + Google Play, id `com.ibill.bquee` |
| **BQuee** customer app | Customers book tokens | `customer/` | App Store + Google Play, id `com.bquee.customer` |
| Shared app code | Screens and parts both apps use | `app-shared/`, `material_ui/` | Built into both apps |

**The Mac folder** `Downloads › BQuee Token Final Source`

| Item | Use |
|---|---|
| `1 Full Source Code` | The whole project as on GitHub. The buttons below use it. |
| `5 Documents` | Store texts, screenshots, review videos, technical guides |
| `6 Built Apps` | Finished app files after a build (`.aab`, `.ipa`, `.apk`) |
| `Keys` | **Secret** – Play upload key, Apple keys, server backups. Never share. |
| `Build BQuee Biz.command`, `Build BQuee Customer.command` | Double-click: build both stores' files |
| `Run BQuee Website on this Mac.command` | Double-click: website on your Mac |
| `Test … on iPhone Simulator.command` | Double-click: app in a virtual iPhone |

---

## Part A – Run everything on your Mac (local)

### A1. The website and server

1. Once only: install **Postgres.app** (free database app). The button opens postgresapp.com if it is
   missing – download it, drag it into Applications, open it, click **Initialize**.
2. Double-click **Run BQuee Website on this Mac.command**.
3. The first time it downloads Node.js into the project and makes a separate local database
   `bquee_local` with a demo business. bquee.com is never touched.
4. The browser opens <http://localhost:3000> by itself.
5. Demo logins (only on the local demo database):

   | Role | Username | Password | Sign-in page |
   |---|---|---|---|
   | Super admin | `admin` | `Admin@123` | `/login` |
   | Business owner | `owner` | `Owner@123` | `/s/lotus-salon/login` |
   | Staff | `staff` | `Staff@123` | `/s/lotus-salon/login` |

6. The super admin is asked to set up two-step sign-in with an authenticator app the first time. Business owners
   get a code by email instead.
7. To stop: close the Terminal window. Local pictures and settings are in `~/bquee-local`.

Developers without the button: `cp .env.example .env`, set `DATABASE_URL`, then `./start.sh seed` once and
`./start.sh` (needs PostgreSQL 13+). Website code changes: `npm run build:watch`.

### A2. The apps in a virtual iPhone

1. Xcode must be installed (Applications or Downloads – the button finds it in both).
2. Double-click **Test BQuee Biz on iPhone Simulator.command** (or **Test BQuee Customer …**).
3. A virtual iPhone opens with the app. It talks to the **live** server bquee.com, so use test accounts.
4. A log is saved in `6 Built Apps/BQuee-Biz/simulator-log.txt` (or `BQuee-Customer`) – send it to Claude if
   something fails.

### A3. The apps on your own phone

- **iPhone:** use TestFlight. After uploading a build (Part C), App Store Connect › the app › TestFlight ›
  add yourself to the internal group › install from the TestFlight app.
- **Android:** copy `6 Built Apps/BQuee-Biz/BQuee-Biz.apk` (or the customer `.apk`) to the phone and open it
  (allow "install unknown apps" once).

---

## Part B – The live website and server (bquee.com)

### B1. What is on the server

- Hostinger VPS. Project folder **`/var/www/bquee`**.
- Node.js run by **PM2** (app name `bquee`, port 3105), **nginx** in front with HTTPS (certbot renews it).
- PostgreSQL on the same server. Settings in **`/var/www/bquee/.env`** (a copy is in `Keys/5 Server backups`).
- Database changes (migrations) run by themselves when the server starts.

### B2. Put a new website/server version live

Only after Claude has pushed the change to GitHub **and the GitHub "Checks" are green**:

1. Open the Hostinger panel › your VPS › **Browser terminal** (or `ssh root@<your server IP>` in Terminal).
2. Paste this one line and press Enter:

   ```bash
   cd /var/www/bquee && git fetch origin && git reset --hard origin/main && pm2 restart bquee --update-env
   ```

3. Check: open <https://bquee.com/api/health> – it must say `ok`. Then open bquee.com and sign in once.

The built website (`public/app`) is already in GitHub, so nothing needs building on the server.

### B3. If the new version is broken – go back

```bash
cd /var/www/bquee && git log --oneline -5          # find the previous version's code (first column)
git reset --hard <previous code> && pm2 restart bquee --update-env
```

Then tell Claude what broke. (A migration that already ran stays; that is normally harmless.)

### B4. Change a setting (.env)

```bash
nano /var/www/bquee/.env        # change the line, Ctrl+O Enter to save, Ctrl+X to close
pm2 restart bquee --update-env
```

Keep `APP_SECRET` the same forever (it unlocks two-step sign-in). Update the copy in `Keys/5 Server backups`.

**Email codes** (sign-up email check, "Forgot password") are sent through **ZeptoMail** (Zoho's sending
service; the domain bquee.com is verified there and only `info@bquee.com` may send). The `.env` lines are in
**Part G**. Without them the website simply hides "Forgot password" and the sign-up code.

### B5. Everyday checks

| What | How |
|---|---|
| Is it up? | <https://bquee.com/api/health> (an uptime monitor such as UptimeRobot can watch it every minute) |
| Errors | `pm2 logs bquee` (Ctrl+C to stop watching) |
| Restart | `pm2 restart bquee` |
| Backups | `sh /var/www/bquee/scripts/backup.sh` (database + pictures, kept 14 days in `backups/`) – copy them off the server |
| Forgot super admin password | `cd /var/www/bquee && node scripts/reset-admin.js admin 'New-long-password'` |

More (restore drill, Cloudflare, incidents): `docs/OPERATIONS.md`.

### B6. A brand-new server (only if you ever move)

1. Ubuntu server with Node.js 20+, PostgreSQL 13+, nginx, certbot, PM2 (`npm i -g pm2`).
2. `git clone https://github.com/lcmproductionspvtltd/token /var/www/bquee`
3. Create the database (`docs/OPERATIONS.md` section 3), copy your `.env` from `Keys/5 Server backups`.
4. `cd /var/www/bquee && pm2 start server.js --name bquee && pm2 save && pm2 startup`
5. nginx: use `deploy/nginx.conf`, then `certbot --nginx -d bquee.com -d www.bquee.com`.
6. Restore the latest backup (`pg_restore`, see `docs/OPERATIONS.md` section 4) and point the domain's DNS
   to the new server.

---

## Part C – Release a new version of the apps

Both apps talk to bquee.com, so **put the server update live first (B2)**, then the apps.

### C1. Before building – the number

Every upload to a store needs a **higher build number**. It is in `mobile/pubspec.yaml` and
`customer/pubspec.yaml`, line `version: 1.0.0+3` → the number after `+` is the build.

- Same app version, new build (fixes during review): `1.0.0+3` → `1.0.0+4`.
- After 1.0.0 is **live** on the App Store, Apple needs a new version for the next release: `1.0.1+4`.
- Tell Claude which you want; Claude changes both files and pushes.

### C2. Build

1. Make sure `1 Full Source Code` on the Mac has the latest code (Claude copies it, or download from GitHub).
2. Double-click **Build BQuee Biz.command**, wait for **SUCCESS** (first build after a clean Mac is long).
3. Double-click **Build BQuee Customer.command**, wait for **SUCCESS**.
4. Results in `6 Built Apps`:

   | File | Goes to |
   |---|---|
   | `BQuee-Biz.aab`, `BQuee-Customer.aab` | Google Play |
   | `BQuee-Biz.ipa`, `BQuee-Customer.ipa` | Apple (with Transporter) |
   | `.apk` | Installing directly on an Android phone (testing) |
   | `-unsigned.ipa` | Ignore |

   On **BUILD FAILED**, send Claude `build-log.txt` from the same folder.

The Android files are signed with `Keys/1 Google Play (Android) - upload key/bquee-upload.jks` (password in
the Mac Keychain). Google needs this same key for every update of both apps.

### C3. Apple App Store (each app)

1. Open **Transporter** (Mac App Store, signed in with the Apple developer account).
2. Drag in `BQuee-Biz.ipa` (or `BQuee-Customer.ipa`) › **Deliver**. Wait for "Delivered".
3. App Store Connect › the app › wait 10–30 min until the build shows under TestFlight (status "Ready").
4. Test it on your iPhone through TestFlight.
5. App Store Connect › the app › **Distribution**:
   - A new version: **+** next to "iOS App" › version number (e.g. 1.0.1) › fill "What's New".
   - **Build** › pick the new build.
   - App Review Information: demo login filled in; attach a new screen recording if Apple asked for one.
6. **Add for Review** › **Submit**. Apple usually answers in 1–2 days.
7. "Automatically release" = live as soon as approved; "Manually release" = press **Release** yourself.

Demo accounts for Apple's reviewers: Biz – the owner demo account; customer – the `test@gmail.com` account.
Their passwords are in App Store Connect › App Review Information (and in your password manager).

### C4. Google Play (each app)

1. <https://play.google.com/console> › the app › **Test and release › Production** › **Create new release**.
2. **Upload** › choose `BQuee-Biz.aab` (or `BQuee-Customer.aab`). Wait until it shows the new version.
3. Release notes, e.g. `<en-US>Bug fixes and improvements.</en-US>` › **Next** › **Save**.
4. **Publishing overview** › **Send changes for review**. Google usually answers in 1–7 days.
5. If an earlier release is still in review, sending restarts that review – that is fine.

### C5. After the release

- Keep the previous `.aab`/`.ipa` (rename the folder, e.g. `6 Built Apps – 1.0.0 (2)`) until the new one has
  been live for a few days.
- Store texts and screenshots: `5 Documents › 1 BQuee Biz app – store files` and
  `2 BQuee customer app – store files`.

---

## Part D – How a change goes from idea to live (the usual way)

1. **Tell Claude the change** (what, where – web, Biz app, customer app).
2. Claude changes the code, adds a test, runs the tests, builds the website and pushes to GitHub.
3. GitHub **Checks** run (server tests, website, secret scan, both apps). Claude waits for green.
4. **Website/server change:** you run the one line in **B2**. Done.
5. **App change:** Claude raises the build number (C1) and updates `1 Full Source Code` on the Mac; you run the
   two Build buttons (C2), test on your phone, then upload to Apple (C3) and Google (C4).
6. A change to both: always server first (step 4), then apps (step 5) – old app versions keep working with
   the new server.

---

## Part E – Accounts and where things are

| What | Where |
|---|---|
| GitHub | `lcmproductionspvtltd/token` (branch `main`) |
| Website | <https://bquee.com> – deletion page for the stores: <https://bquee.com/request> |
| Apple | App Store Connect – BQuee Biz (app 6837735599), BQuee (app 6839333407) |
| Google Play | Play Console (developer IBILL Software and Consultancy) – BQuee Biz, BQuee |
| Play upload key | `Keys/1 Google Play (Android) - upload key/bquee-upload.jks` – details in `Keys/KEYS - READ ME.txt` |
| Server settings backup | `Keys/5 Server backups` |
| Support contact | info@bquee.com · +971 56 570 8076 |

## Part G – Email codes (ZeptoMail)

BQuee sends its 6-digit codes through **ZeptoMail** (cpaas.zoho.in). Already done there: domain **bquee.com
verified** (DKIM and bounce records), mail agent **agent_1**, and a sender list that allows only
**info@bquee.com**.

1. **SMTP password:** ZeptoMail › Mail Agents › agent_1 › **SMTP/API › SMTP** – copy the password ("Send Mail
   token"). Never paste it in a chat; if it was ever shared, make a new one there and the old one stops working.
   If IP restriction is on for the agent, add the VPS address `201.18.205.236`.
2. **On the VPS:** `nano /var/www/bquee/.env`, add (paste the token yourself – only the long code, without the
   word `Zoho-enczapikey` in front):

   ```
   SMTP_HOST=smtp.zeptomail.in
   SMTP_PORT=587
   SMTP_USER=emailapikey
   SMTP_PASSWORD=<ZeptoMail token>
   MAIL_FROM=info@bquee.com
   ```

   `SMTP_USER` is always the word `emailapikey`. `MAIL_FROM` must be the allowed sender `info@bquee.com`.
   Save: Ctrl+O, Enter, Ctrl+X. Then:

   ```bash
   pm2 restart bquee --update-env
   ```

3. **Test:** bquee.com › Sign in › **Forgot your password?** with your own owner email – a 6-digit code must
   arrive within a minute (check spam the first time). Nothing? `pm2 logs bquee --lines 30 --nostream` and send
   Claude the line with `email_failed` (it never shows the password).

**What turns on by itself after the restart** – no code change, no new build:

| Where | What appears |
|---|---|
| Every business owner sign-in | After the password, a 6-digit code by email (super admin, team and staff: not asked) |
| Both sign-in pages | "Forgot your password?" (code by email → new password) |
| Business sign-up | "Send code" and the code box (proves the email) – no authenticator app to set up |
| Sign-in security | "Confirm email" with a code |
| After 10 wrong passwords | An emailed sign-in code instead of waiting 15 minutes |

To hide them again: remove the SMTP lines (or add `EMAIL_CODES=off`) and restart.

The **phone apps** have the same screens from **1.0.0 build 3** on, and follow the same switch: hidden while
codes are off, shown by themselves once SMTP is added – no new build needed then. (BQuee Biz: the sign-in
code, "Forgot your password?", the sign-up code. BQuee customer app: the sign-in code, "Forgot your
password?" and the sign-up code.) The current store versions (build 2) keep signing in without a code. After build 3 is live in both stores, add `EMAIL_CHECK=required`
to `.env` and restart: from then on every new sign-up must confirm its email.

---

## Part F – When something goes wrong

| Problem | First thing to do |
|---|---|
| bquee.com down | `pm2 logs bquee`, then `pm2 restart bquee`; still down → go back (B3) |
| App can't connect | Check <https://bquee.com/api/health>; the apps only work when the server is up |
| Build failed | Send Claude `6 Built Apps/…/build-log.txt` |
| Store rejected the app | Copy Apple's/Google's message to Claude |
| Lost the Play upload key | Play Console › the app › App signing › Upload key › Request reset |
| Forgot password (owner, staff with email) | While email codes are off: reset it for them (super admin › the business), or `reset-admin.js` for the admin. Once on: bquee.com › **Forgot your password?** |
| Forgot super admin password | `node scripts/reset-admin.js admin 'New-long-password'` on the server |

More detail: `docs/DEVELOPER-GUIDE.md` (how the code works), `docs/OPERATIONS.md` (running it live),
`docs/SECURITY.md`, `docs/TESTING.md`.
