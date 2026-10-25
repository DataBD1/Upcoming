# Fix 10: scaling store (lib/pgstore.js, api/backup.js, api/index.js, bench, docs)

16 findings: 13 FIXED, 1 FIXED in part (F13), 2 not fixed (F15 DEFERRED, F16 DEFERRED). Tests: `test-pgstore.js` (new, 19 checks), `test-pg.js`, `bench/fuzz.js`.

| ID | Status | What / test |
|---|---|---|
| F1 | FIXED | One async mutex per copy around write and refresh; a refresh never applies an older snapshot (version down or new epoch means full reload); readers wait for an uncommitted write. Test "F1 refresh gated..." holds a refresh answer back while a write arrives (mutating both guards makes it fail). Fuzz: 30 seeds x 120 steps, 6 concurrent, 3 copies, LAT_MS=4, VERIFY on: 0 divergence, 0 HTTP 5xx (the review's seeds 2 and 3 diverged before) |
| F2 | FIXED | `error` listener on every pool client; API entry point catches request failures. "F2 killing idle and checked-out connections..."; before: `10-crash-dirty.js` exits with Unhandled 'error' event |
| F3 | FIXED (see note) | `market.book`, `.paid` and `.hist` live in per-market `mkt` rows (accessors in pgstore, core.js untouched). 100 resolved markets x 3,000 holders: main row 21.7 MB to 104 KB; small write 1.8 s to 13 ms. Old rows with inline data move on the first read ("F3 a main row written by the previous version..."). Note: the main row still holds about 1 KB of question/source text per market, so 100 KB, not under it; `feedback`/`audit` also remain (cap about 1 MB) |
| F4 | FIXED | Write is 2 round trips (was about 9), test "F4 ... two round trips"; separate read path; busy 503 after 150 queued; LAT_MS in all benches; honest table in docs/scaling.md. Before at 10 ms: 60 req/s buy p95 891 ms, 100 req/s collapse (p95 17 s). After: 100 req/s buy p95 115 ms; ceilings 150/100/60 req/s at 3/10/20 ms |
| F5 | FIXED | Prune after each copy: newest 48 + last per day for 30 days. "F5/F6 rollback copy..." |
| F6 | FIXED | Copy made by one SQL statement after the commit, not in the request; interval grows with its cost (10 min to 1 h). 10k: write 179 ms (was 312), copy 2.4 s in the database |
| F7 | FIXED | Cache is swapped, never nulled. "F7 TTL reloads..." (25 ms TTL, 6 workers, 2.5 s, zero 5xx) |
| F8 | FIXED | Epoch in main row, tombstones in the migration, reload when version goes down. "F8 an instance idle through a restore..." |
| F9 | FIXED | Database errors: 503/500, logged without secrets, never 400; NUL and lone surrogates removed instead of failing; failed write rolls back in memory without a full reload. "F2..." and "F9 a NUL character..." |
| F10 | FIXED | "F10 readers never see a write that is not committed yet" (kills the writer's backend) |
| F11 | FIXED | Catalog check first; DDL only if missing, under an advisory lock. "F11" x2 (SELECT blocked 2.5 s before, now under 400 ms) |
| F12 | FIXED | Store runs `Core.migrate` once per full load inside a write (no-op writes do not bump the version). "F12 an older sharded database..." |
| F13 | FIXED, streaming not done | 503 in production without CRON_SECRET, timing-safe compare, checks Blob for today's file before reading the database, client error listener. "F13 /api/backup..." The state is still stringified in memory once a day (5 MB at 10k) |
| F14 | FIXED | TTL jitter 75-125%, single flight, memory numbers in docs (12 MB per 10k light players, cold start 0.2 s). "F7..." and "F14 default TTL..." Delta-load on cold start not built |
| F15 | DEFERRED | CPU in core/handler (rank caching, async scrypt); not store work |
| F16 | DEFERRED | `EVENTS_KEEP` is in core.js; needs daily counters |

## Commands run
- `npm test` pass. `PGPORT_TEST=54351 node test-pg.js` pass. `node test-pgstore.js` pass (3 runs; one flaky test fixed).
- `LAT_MS=4 node bench/fuzz.js 120 <seed> 6 3` for seeds 1 to 30: all `diverged:0, err500:0`.
- `LAT_MS=3|10|20 node bench/soak.js 10000 <rate> 25 3`: 0 server errors, caches equal the database at the end of every run (table in docs/scaling.md). No latency, 200 req/s: slowest p95 145 ms.
- `bench/mem.js 10000`, `bench/snapshot.js 10000`.

## For the coordinator
- SHARDED now has seen, otpcodes, otpsends (attempts stays). Merge hunks: handler.js only the final catch (`app` test, `e.http`), pgstore.js and backup.js are whole-file.
- Deploy: replace all instances at once (old code does not know the `mkt` rows). Set `CRON_SECRET` in production or the backup refuses to run. First read after deploy moves book/paid/hist out of the main row.
- Not re-run after the merge of fixes 01-09 (not rebased by instruction).
- test-pg.js: port now overridable with PGPORT_TEST; the buy test allows the market's own `mkt` row.
- Fold into README: `npm run test:pg` now runs test-pg.js and test-pgstore.js; benches take LAT_MS.
