# Notes for AI assistants (Claude) working on BQuee

Start with **docs/DEVELOPER-GUIDE.md**. It explains the whole project: structure, database, algorithms,
flows, and the rules below in more detail.

Rules the project owner set:

- Self-contained: no new npm/pub.dev packages, no CDN or outside scripts/fonts.
- Make only the changes asked for; mention anything else you notice instead of changing it.
- App version stays `1.0.0+3` in both `pubspec.yaml` files unless the owner asks.
- Explain things to the owner simply. Their Mac Terminal and Xcode are click-only: they run `.command` files
  and you never type passwords or Apple IDs for them.
- Schema change → new numbered migration (never edit old ones), then regenerate docs/DATABASE.md.
- Website change → `npm run build` and commit `public/app`.
- Every change gets a test. Run `npm test` (TEST_DATABASE_URL is wiped) and keep the GitHub check green.
- Every query: `$n` parameters and the signed-in user's `salon_id`.
- Commit messages: plain words, what changed and why.
