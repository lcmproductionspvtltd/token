# BQuee – how everything is checked

All checks are automatic and can be re-run at any time.

## 1. `npm test` (server, database, security)

Needs PostgreSQL. ⚠ The database in `TEST_DATABASE_URL` is wiped on every run.

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/bquee_test npm test
```

| Suite            | File                              | What it proves                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QR engine        | `tests/qr-engine.test.js`         | QR codes are drawn and read back correctly                                                                                                                                                                                                                                          |
| Waiting time     | `tests/queue.test.js`             | Hand-worked queues give the exact expected minutes (queue ahead, running services, overruns, two stylists, ties, rounding)                                                                                                                                                          |
| API audit        | `tests/api-audit.js`              | Every feature end to end: booking without login, roles, business isolation, QR start/finish, reports, referrals, support tickets, branch prices, bulk business changes, uploads                                                                                                     |
| Account requests | `tests/account-requests-audit.js` | Delete / deactivate requests for customers, owners, staff and team members: password check, one waiting request, cancel, approve (carries it out), reject with a note, switch back on, admin-only handling                                                                          |
| Security audit   | `tests/security-audit.js`         | Bad input, SQL injection, stored scripts (XSS), forged/expired sessions, role climbing, other-business access, hidden plan changes, QR misuse, password leaks, security headers, brute-force limit                                                                                  |
| Sign-in security | `tests/session-audit.js`          | Website cookie sessions (HttpOnly, Secure, `__Host-`), CSRF token and Origin check, two-step sign-in (setup, codes, replay, backup codes, reset), session lengths, sign out other devices, password change signs out others, 12-character admin passwords, common passwords refused |
| Database client  | `tests/db-driver.test.js`         | Our own PostgreSQL client: verified TLS (wrong certificate / wrong name refused), timeouts, broken replies, pool limits and waits, transactions                                                                                                                                     |
| Two servers      | `tests/concurrency-audit.js`      | Two servers booking at the same branch at once: no duplicate token numbers; sign-in limits shared; migrations safe when both start together                                                                                                                                         |
| Static files     | `tests/static-files.test.js`      | No file outside `public/` reachable (`../`, encoded, symlinks); cache size limit                                                                                                                                                                                                    |
| Address rules    | `tests/http-rules.test.js`        | Broken `%` codes give 400; HTTPS redirect never goes to a foreign Host; compression choice                                                                                                                                                                                          |

### Upload rules (tested in the API audit)

- Only real **PNG, JPG or WEBP** pictures. The file's own structure is checked (`src/services/image-check.js`), never its name.
- Refused: scripts, web pages, SVG, PDF or ZIP disguised as pictures, anything hidden after the picture data, code in the picture's text parts (comments, EXIF/XMP, PNG text), broken files, pictures over 8000 px.
- Accepted: ordinary photos whose compressed picture data happens to contain bytes like `<%` or `#!/` (`tests/image-check.test.js`).
- Size limits (`src/services/uploads.js`): profile photos 600 KB · service/offer pictures 800 KB · logo 1 MB · ticket screenshot 2 MB · cover 2.5 MB. Whole request: 4 MB.
- The web and both apps redraw every picture into a fresh JPG before upload, which also removes hidden data.
- Stored pictures get a new random name and are served with headers that stop a browser from ever running them.
- There are no PDF or document uploads in BQuee; PDFs are refused.

## 2. Browser checks (web screens)

Start a server with the demo data (`SEED_DEMO_DATA=1`) on port 3999, then:

| Check        | Command                             | What it proves                                                                                                                                                                              |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every button | `node tests/ui/click-audit.js`      | Visitor, super admin, owner and staff; every menu page; desktop and phone width; every safe button pressed and every dialog opened – no JavaScript errors, no server errors, no blank pages |
| Ticket QR    | `node tests/ui/qr-ticket-proof.js`  | A customer books, the ticket's QR is read from the phone screen and from the downloaded JPG with the staff scanner's decoder, and two scans start and finish the service                    |
| Screen sizes | `node tests/ui/responsive-audit.js` | Nothing overflows or overlaps from 320 px phones to wide desktops                                                                                                                           |

## 3. Apps

`flutter analyze` and `flutter test` run on every push (GitHub check) and inside the Mac build scripts.

| File                                                             | What it proves                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mobile/test/widget_test.dart`, `customer/test/widget_test.dart` | QR codes, icons, formatting, page numbers                                                                                                                                           |
| `*/test/shared_test.dart`                                        | Only safe links open; HTTPS only; step bar; stepped forms check each step and keep typed text on Back                                                                               |
| `mobile/test/biz_screens_test.dart`                              | Business sign-up steps; new-business form's 4 steps; "change many businesses" starts at No change and refuses an empty change; two-step sign-in setup, code and backup-code screens |

## 4. GitHub check (every push)

`.github/workflows/checks.yml`: JavaScript syntax, secret scan (`scripts/check-secrets.sh`), `npm audit`, web bundle rebuilt and compared with the committed one, `npm test` on a fresh PostgreSQL 16, and `flutter analyze` + `flutter test` for both apps.

## Test logins and two-step sign-in

The tests set up two-step sign-in for the admin and owner logins themselves and keep the keys in `/tmp/bquee-test-mfa.json` (`tests/helpers/session.js`). Delete that file after re-seeding the database.

## Latest results (19 Nov 2026)

```
QR engine:           8 passed, 0 failed
Waiting time:       21 passed, 0 failed
Static files:       12 passed, 0 failed
Address rules:      18 passed, 0 failed
Database client:    38 passed, 0 failed
API audit:         524 passed, 0 failed
Security:           72 passed, 0 failed
Account requests:   86 passed, 0 failed
Sign-in security:   57 passed, 0 failed
Two servers:        13 passed, 0 failed
Click audit:   52 pages, 357 buttons pressed, 50 dialogs, 0 problems
Ticket QR:      7 of 7 steps passed
Screen sizes:   no problems
```
