# BQuee – running it in production

Step-by-step jobs for whoever runs the live service. Keep this next to the server's passwords (in a password
manager, not in this repository).

## 1. Before going live (checklist)

- [ ] `NODE_ENV=production`, `PUBLIC_URL=https://your-domain`
- [ ] `APP_SECRET` set to 32+ characters of random text. **Required**: in
      production the server refuses to start without it. Keep a copy in your password manager.
- [ ] `DATABASE_URL` with `?sslmode=verify-full` when the database is reached over the internet.
- [ ] `SEED_DEMO_DATA=0`; demo logins removed, or their passwords changed.
- [ ] The super admin has signed in once and set up two-step sign-in, and saved the backup codes.
- [ ] Database user is not a superuser (section 3).
- [ ] Backups run and one restore has been tried (section 4).
- [ ] Health check `/api/health` is watched (section 6).
- [ ] Update the server only after the GitHub check has passed, so a push that breaks a test is not used.

## 2. Secrets

| Secret               | Where it lives                      | How to change it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database password    | Host's environment (`DATABASE_URL`) | Change it in the database, update `DATABASE_URL`, restart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `APP_SECRET`         | Host's environment                  | Unlocks the stored two-step keys. **To change it** (e.g. if it leaked): 1) add `APP_SECRET_PREVIOUS` = the current value, 2) set `APP_SECRET` to a new random value, 3) deploy – at start-up every key is re-encrypted with the new one (the log says how many), 4) remove `APP_SECRET_PREVIOUS` and deploy again. Nobody has to set up two-step sign-in again. Without the old value, everyone sets it up again at next sign-in (`UPDATE users SET mfa_secret = NULL, mfa_enabled_at = NULL, mfa_backup_codes = NULL;`). |
| Super admin password | The admin's password manager        | Sign in → Sign-in security / profile. Forgotten: `node scripts/reset-admin.js admin 'New-long-password'` on the server (also resets two-step sign-in).                                                                                                                                                                                                                                                                                                                                                                    |
| Sessions             | Database                            | To sign everyone out at once: `DELETE FROM sessions; DELETE FROM customer_sessions;`                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Never put secrets in the repository: every push is scanned (`scripts/check-secrets.sh`).

## 3. Database user with only the rights it needs

Run once as the database owner (adjust names). The app user can read and write data but can't create other
users or databases. Migrations run with the same user, so it owns the schema:

```sql
CREATE ROLE bquee_app LOGIN PASSWORD 'long-random-password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE bquee OWNER bquee_app;
REVOKE ALL ON DATABASE bquee FROM PUBLIC;
```

Managed databases (Neon, Supabase) already give a non-superuser account – use that one.

## 4. Backups and restore

**Managed database**: use the provider's automatic backups and point-in-time recovery.

**Own server**: `sh scripts/backup.sh` every night (cron line inside the script). It writes the database and the
uploaded pictures into `backups/` and keeps 14 days. Copy `backups/` to another place (another server or cloud
storage, encrypted) – a backup on the same disk is lost with the disk.

**Restore drill (do it every 3 months, and once before going live):**

1. Make an empty test database: `createdb bquee_restore_test`
2. `pg_restore --no-owner --dbname=postgres://…/bquee_restore_test backups/bquee-<date>.dump`
3. Start a copy of BQuee on it: `DATABASE_URL=…/bquee_restore_test PORT=3998 node server.js`
4. Sign in, open a business, check today's tokens and a report.
5. Write down how long it took and the date of the backup. Delete the test database.

Target: no more than 1 day of data lost; back online within 4 hours.

## 5. Keeping data only as long as needed

Done automatically every hour (`src/services/maintenance.js`): ended sessions, old sign-in limits, unfinished
two-step sign-ins and notifications older than 60 days are removed. Messages from the home page contact form
and the hidden deletion page (`https://bquee.com/request`, the address for the app stores) arrive as
notifications for the super admin and the BQuee team (the bell on the dashboard and in BQuee Biz). Deleted accounts are removed through the account-request flow. Decide with your
lawyer how long finished tokens and reports are kept, and write it in your privacy policy.

## 6. Watching the service

- **Up or down**: an uptime monitor (UptimeRobot, Better Stack…) calls `https://your-domain/api/health` every
  minute and alerts the owner by SMS/e-mail.
- **Errors**: `pm2 logs bquee` on the server. Each error line starts with a request ID; a user can quote the `X-Request-Id`
  from their browser.
- **Database**: watch disk space and connection count in the provider's dashboard. "Server busy" (503) answers
  mean the database pool is full – raise `DATABASE_POOL_SIZE` (default 10) or the database plan.
- **Package prices by currency**: Website → Pricing. "Currencies you sell in" (code + 1 US$ = rate) and each
  package's "Fixed prices" (e.g. `₹999, AED 149, $39`). Nothing is fetched from outside; update the rates now
  and then (₹ and £ move, the Gulf currencies are fixed to the dollar). Unlisted currencies show US$.
- **Certificates**: `certbot renew` runs automatically on the server; the monitor above
  alerts if HTTPS fails.

## 7. Big traffic and attacks

The app limits each address (600 requests a minute) and each account, but a large attack must be stopped
before it reaches the server. Put the site behind **Cloudflare** (free plan is enough to start): DNS through
Cloudflare, proxy on, "Bot Fight Mode" on, and a rate-limit rule for `/api/login` and `/api/public/*`.
Then set `TRUST_PROXY=1` so BQuee sees real visitor addresses.

## 8. When something goes wrong

1. **Site down**: check `/api/health`, then `pm2 logs bquee` on the server. Roll back: `git checkout <previous commit>` in
   `/var/www/bquee`, then `pm2 restart bquee`.
2. **Account taken over**: super admin resets that user's password and two-step sign-in (Businesses or Team),
   which signs them out everywhere.
3. **Secret leaked**: change it (section 2), sign everyone out, check the logs for what was done with it.
4. **Data leaked**: stop the cause, write down what/when/who, tell affected businesses and – where the law asks
   (for example within 72 hours under GDPR, or as India's DPDP rules require) – the authorities.
5. Afterwards: write a short note (what happened, why, what was changed) and add a test that would have caught it.

## Email codes (sign-up check, forgot password)

**Sending service: ZeptoMail** (Zoho) – domain bquee.com verified, sender `info@bquee.com`. While `SMTP_HOST`
is empty (or `EMAIL_CODES=off`) the website hides "Forgot password" and the sign-up code, sign-ups don't need a
code, and too many wrong passwords just wait 15 minutes.

BQuee sends 6-digit codes over SMTP (`src/services/mailer.js`, no package): **every sign-in of a business
owner or customer** (website, and apps from 1.0.0 build 3; super admin, team and staff are not asked),
proving the email at sign-up, "Forgot password", "Confirm my email" in Sign-in security, and signing in
when an account has had too many wrong passwords. If an email can't be sent, sign-in carries on without the
code (logged as `email_failed`) so nobody is locked out.

1. In `/var/www/bquee/.env` add (ZeptoMail; the password is the agent's SMTP "Send Mail token"):

   ```
   SMTP_HOST=smtp.zeptomail.in
   SMTP_PORT=587
   SMTP_USER=emailapikey
   SMTP_PASSWORD=<ZeptoMail token>
   MAIL_FROM=info@bquee.com
   ```

   Port 587 uses STARTTLS (set by itself); 465 works too (TLS from the start).

2. `pm2 restart bquee --update-env`, then on bquee.com press "Forgot your password?" with your own email –
   the code must arrive (check spam the first time).
3. When the new app versions (with the email-code screens) are live in both stores, add `EMAIL_CHECK=required`
   and restart: from then on every sign-up must confirm its email. Until then it is `optional`, so older apps
   can still sign up.

Without `SMTP_HOST` the server can't send codes: "Forgot password" says it isn't available, and the sign-in
step after many wrong passwords is skipped (the account just waits 15 minutes, as before). Failed sends are
logged as `email_failed` / `email_code_failed`.

## Google and Apple sign-in

Business owners can sign in and sign up with "Continue with Google / Apple" on the website and in BQuee Biz.
A button shows only when its settings are filled in (`.env`, then `pm2 restart bquee --update-env`).

**Google** (Google Cloud Console → APIs & Services):

1. OAuth consent screen: app name BQuee, support email, links https://bquee.com/privacy and /terms.
2. Credentials → Create credentials → OAuth client ID → _Web application_.
   Authorised redirect URI: `https://bquee.com/api/oauth/google/callback`.
3. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

**Apple** (developer.apple.com → Certificates, Identifiers & Profiles):

1. Identifiers → the App ID `com.ibill.bquee` → tick _Sign in with Apple_.
2. Identifiers → + → _Services IDs_ (e.g. `com.bquee.web`) → tick _Sign in with Apple_ → Configure:
   domain `bquee.com`, return URL `https://bquee.com/api/oauth/apple/callback`.
3. Keys → + → _Sign in with Apple_ → download `AuthKey_XXXX.p8` (only once!).
4. `APPLE_SERVICES_ID` = the Services ID, `APPLE_TEAM_ID` = your team ID, `APPLE_KEY_ID` = the key's ID,
   `APPLE_PRIVATE_KEY` = the .p8 file's text on one line with `\n` for line breaks.

How it works and what is checked: `src/services/oauth.js`. Staff, the BQuee team and the super admin keep
signing in with their password (and code).

## 9. Releasing a new version

1. Push to GitHub. The **Checks** run (all server tests, web bundle, secret scan, both apps' analyze and tests).
2. Only when they pass, update the server (`cd /var/www/bquee && git pull && pm2 restart bquee --update-env`). Migrations run automatically at start, one server at a time.
3. Apps: build on the Mac with the `.command` files, test on a real phone, then upload to the stores.
4. Keep the previous app build until the new one has been live for a few days.
