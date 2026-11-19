# BQuee – how it is protected

This page explains, in plain words, what protects BQuee and where it is in the code. Each item is covered by an
automatic test (see [TESTING.md](TESTING.md)). What code cannot do on its own (a penetration test, legal papers,
backups on your host) is listed in [AUDIT-RESPONSE.md](AUDIT-RESPONSE.md).

## Sign-in

| What               | How                                                                                                                                                                                                                                                                  | Where                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Passwords          | Stored only as scrypt hashes with a random salt. At least 8 characters; **12 for the super admin and the BQuee team**. Very common passwords (`Password@123`, `Admin@123`, …) are refused.                                                                           | `src/services/auth.js`, `common-passwords.js`                 |
| Two-step sign-in   | **Required** for the super admin, the BQuee team and business owners. Works with any authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…). Setup shows a QR code and a key; 10 one-time backup codes are given. A code can't be used twice. | `src/services/totp.js`, `auth.js`, `022_mfa.sql`              |
| Lost phone         | Use a backup code. The super admin can reset an owner's or team member's two-step sign-in (Businesses / Team). The super admin's own: `node scripts/reset-admin.js` on the server.                                                                                   | `admin-team.js`, `scripts/reset-admin.js`                     |
| Guessing passwords | Per address: 20 tries / 10 min. Per account: 10 wrong tries / 15 min (right tries don't count, so a real user is not locked out by success). Two-step codes: 5 tries per sign-in. Limits are kept in PostgreSQL, so they hold across restarts and several servers.   | `src/http/security.js` (`RateLimiter`), `021_rate_limits.sql` |
| Session length     | Super admin and team: 12 hours. Owners: 14 days. Staff: 30 days. Customers: 90 days (phone app).                                                                                                                                                                     | `auth.js` `SESSION_HOURS`                                     |
| Ending sessions    | Changing a password signs out every other device. "Sign-in security" shows your devices and can sign out all others. A staff password changed by the owner signs that staff member out.                                                                              | `auth.js`, `routes/auth.js`                                   |

## Website (browser)

| What                                           | How                                                                                                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session                                        | Kept in a **secure cookie the page's scripts cannot read** (`HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` name on HTTPS). Nothing secret in `localStorage`.                 |
| Cross-site requests (CSRF)                     | Every change needs a second token from a readable cookie, sent back in a header, and must come from our own site (Origin check). Other sites' scripts can't make changes.     |
| Scripts injected into pages (XSS)              | React escapes text; the Content-Security-Policy allows only our own scripts, no plugins, and reports violations to `/api/csp-report`. Saved links only accept `http`/`https`. |
| Being shown inside another site (clickjacking) | Not allowed (`X-Frame-Options: DENY`, `frame-ancestors 'none'`).                                                                                                              |
| HTTPS                                          | HSTS on; plain-HTTP visits go to HTTPS on the configured address only (`PUBLIC_URL`), never one taken from the request.                                                       |
| Sign-out on a shared computer                  | Clears the session cookie and the offline cache (service worker).                                                                                                             |

## Phone apps

| What          | How                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in token | Kept in the phone's secure store: **Android Keystore** (encrypted) and **iOS Keychain** (this device only, removed after reinstall). Old tokens are moved there and replaced with a fresh one on first start.      |
| Server        | Fixed to the BQuee server; HTTPS only. Plain-HTTP connections are refused (Android also blocks them system-wide). Local test servers only in development.                                                          |
| Links         | Only safe kinds are opened (`https`, `http`, `tel`, `mailto`, `sms`, WhatsApp, maps, authenticator). `javascript:`, `file:`, `content:` and unknown kinds are refused – checked in Dart and again in Kotlin/Swift. |

## Server and database

| What                    | How                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection           | All values are sent as parameters (`$1`), never pasted into SQL. Table/column names in queries come only from fixed lists in the code.                                                |
| Database connection     | Over the internet it must use verified TLS (`sslmode=verify-full`). The server **refuses to start in production** with an unencrypted or unverified connection to a non-private host. |
| Our own database client | Tested on its own: verified TLS, wrong certificate refused, timeouts, broken replies, pool limits, transactions (`tests/db-driver.test.js`).                                          |
| Too many requests       | Per address: 600 requests a minute and 200 at once; when busy the server answers "try again" instead of slowing down for everyone. Database waits are capped (busy → 503).            |
| Bad input               | Wrong types (lists or objects where text/numbers are expected) are refused; money must be a real number; bad links in the address give 400.                                           |
| Uploads                 | Only real PNG/JPG/WEBP pictures, checked by their content; size limits; random names; served so they can't run as a page.                                                             |
| Secrets                 | Two-step keys are encrypted with `APP_SECRET` (AES-256-GCM). Backup codes are stored hashed. No secrets in the code (checked on every push).                                          |
| Logs                    | Errors are logged with a request ID (also sent as `X-Request-Id`); passwords and tokens are never logged.                                                                             |
| Two servers at once     | Booking numbers, migrations and clean-up are safe with several servers (tested with two servers booking at the same time).                                                            |
