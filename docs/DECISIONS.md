# Decisions

## 1. Our own PostgreSQL client (src/db/postgres.js) – kept (Nov 2026)

**Context.** The security reviews (Nov 2026, sections F-06 and 3.6) recommended a maintained driver such as `pg`,
or keeping ours with independent review and broad tests.

**Decision.** Keep our own client. The project rule is "no runtime packages": the server runs on plain Node.js,
so it can be copied and run anywhere with no download, and there is no third-party code in the path of every
query.

**What makes it safe to keep.**

- `tests/db-driver.test.js` (52 checks, on every push): SCRAM-SHA-256 sign-in, TLS with certificate and
  host-name checks (wrong certificate, wrong name, IP hosts), time limits, a connection killed by the server,
  a full pool, transactions rolled back on failure, error codes, exact numbers (no rounding), dates, lists,
  1–3 MB values and garbled server replies that must never crash the server.
- `tests/concurrency-audit.js`: two servers using the database at the same time.
- Every query uses `$n` parameters (no text pasted into SQL).

**Still recommended.** An independent review of the protocol code before a large customer launch. If the
"no packages" rule is ever dropped, switching to `pg` means changing only `src/db/postgres.js` – the rest of the
code uses `db.query(sql, params)` and `db.transaction(fn)`.
