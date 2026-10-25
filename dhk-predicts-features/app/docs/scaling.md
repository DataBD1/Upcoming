# Scaling to 10,000 players

How the Postgres store was taken from "fine for hundreds" to 10,000+ players, one measured round at a time.
Tools: `bench/load.js` (timed operations under concurrency), `bench/ops.js` (one operation at a time, rows written),
`bench/prof.js` (where a request's time goes), `bench/soak.js` (steady traffic at a fixed rate), `bench/fuzz.js` (concurrent correctness fuzz), `bench/mem.js`, `bench/snapshot.js`. **`LAT_MS=10` in front of any of them adds that many ms to every database round trip** (`bench/latency.js`), which is how the numbers below were taken. Run as a non-root user after
`npm install` (Postgres refuses to start as root): `node bench/soak.js 10000 60 40 3` = 10,000 players, 60 requests/s, 40 s, 3 server copies.

## Rounds (10,000 players, one 4-core machine running Postgres, the app and the test)

| Round | Change | Result |
|---|---|---|
| 0. Baseline | One jsonb row for everything (then sharded sessions, positions, logs) | Reading the 400 KB main row alone: 118 ms. Home 1.1 s, buy 3.9 s, feedback 3.8 s, login 4.3 s at 10 at a time |
| 1. Smaller main row | Players and phone logins sharded; analytics events in their own append-only table, loaded only for metrics and backups | Main row 400 KB to 1 ms to read. A do-nothing write 375 ms to 195 ms. A full read still 163 ms (loads every shard) |
| 2. Memory plus delta | Each server copy keeps the state in memory; before a request it checks the version and fetches only rows changed since; writes save only the keys a request touched | Read 0.3 ms. Do-nothing write 4.3 ms. Buy 6 ms |
| 3. Fix what the tests found | Refused requests (bonus_taken, too_big...) roll back only what they touched instead of dropping the cache; weekly start scores and groups sharded; whole-map replacement saved | Refused request 150 ms to 3 ms. Weekly roll: one write of 10,000 rows, about 175 ms, once a week. Main row 18 KB |

Round 3 found a real bug: the weekly roll replaces a whole map (`s.weekstart = {}`), which the first version of the cache did not
save. It was caught by the benchmark (rows written: 3 where 10,009 were expected), not by the existing tests; `test-pg.js` now covers it.

### Round 4 (review 10): correctness first, then fewer round trips

| Change | Result |
|---|---|
| One mutex per server copy around every write and refresh; a refresh never applies an older snapshot; a version that goes down or a new epoch (restore) reloads everything; readers wait while a write is uncommitted; the cache is swapped, never nulled; a failed write is rolled back key by key; every checked-out connection has an `error` listener | The lost-update race, the process crash on a lost connection, dirty reads, 500s at every cache reload and restore "ghost" players are gone (`test-pgstore.js`, 30-seed concurrent fuzz with zero divergence) |
| Each market's holder book, payouts and price history live in their own row (`mkt` in `app_shards`) | Main row after 100 resolved markets with 3,000 holders: **21.7 MB to about 105 KB** (about 1 KB of bilingual question/source text per market, independent of holders). A small write after that: 1.8 s to 13 ms |
| A write is two round trips: `begin; lock` and one statement with every row change plus `commit` | Was about 9 |
| Rollback copy taken by the database itself after the commit, pruned (newest 48 plus one per day for 30 days) | The write that takes a copy: 312 ms to 179 ms at 10,000 players, the copy itself (2.4 s) runs in the database, off the request path; at most one copy per 10 minutes, longer if copies are slow (up to 1 hour) |

## Steady traffic (`bench/soak.js`, 10,000 players, 3 server copies, same mix as before, 25 s per row)

Database on the same machine (no injected latency, 4 shared cores): 200 req/s, slowest p95 145 ms (login), buy p95 88 ms, 0 errors.

**With database latency** (this is the number that matters; Supabase from Vercel is 3 to 20 ms away depending on region):

| ms to the database | Offered | Achieved | Buy p50 / p95 | Home p50 / p95 | Verdict |
|---|---|---|---|---|---|
| 3 | 60 | 60 | 11 / 17 ms | 4 / 9 ms | fine |
| 3 | 150 | 150 | 15 / 110 ms | 4 / 32 ms | fine |
| 3 | 300 | 248 | 3.5 s / 6.5 s | 59 ms / 4.6 s | past the ceiling |
| 10 | 60 | 60 | 28 / 54 ms | 12 / 25 ms | fine |
| 10 | 100 | 100 | 40 / 115 ms | 14 / 54 ms | fine |
| 10 | 200 | 141 | 5.4 s / 10.5 s | 46 ms / 6.4 s | past the ceiling |
| 20 | 30 | 30 | 49 / 89 ms | 24 / 49 ms | fine |
| 20 | 60 | 60 | 72 / 200 ms | 25 / 87 ms | fine, login p95 371 ms |
| 20 | 120 | 89 | 4.9 s / 9.1 s | 66 ms / 6.2 s | past the ceiling |

Zero server errors in every run, and at the end of every run each copy's whole cache equalled the database. The 10,000-player target (about 10 to 20 req/s at peak) has a wide margin even at 20 ms. For comparison, the previous store at 10 ms: 60 req/s gave buy p95 891 ms (home p95 73 ms), and 100 req/s collapsed (p50 8 s, p95 17 s). The earlier claim of "200 req/s" was measured with no network and is withdrawn.

**Rule of thumb.** The database lock is held for about one round trip plus the work, and a write needs two round trips of its own, so a server copy can do roughly 1 / (2 x RTT) writes a second (about 150 at 3 ms, 50 at 10 ms, 25 at 20 ms), shared by all copies because of the one row lock. About one request in five is a write in this mix, so the table's ceilings are about five times that. Past the ceiling requests queue; a copy answers HTTP 503 once 150 are waiting, instead of growing without limit.

## Cost of one server copy (10,000 light players)

Heap about 12 MB per 10,000 light players (about 120 MB at 100,000), cold start about 0.2 s (1.6 s at 100,000) with the database next door, plus about 5 round trips. A "heavy" state (5,000 active traders with long logs and 30 positions each) was 276 MB at 10,000 players in review: memory follows trade history, not player count. Reloads are spread out: each copy reloads everything about every 10 minutes at a random 75% to 125% of that, one at a time, and the swap does not interrupt requests.

## Known limits (not fixed, in the order they will bite)

- **Network time is real.** See the table. Keep the Vercel region next to Supabase (`bom1` and Mumbai).
- **One write lock** across all copies (see the rule of thumb). The next step is a lock per market.
- **Login and sign-up hash passwords on the main thread** (`scryptSync`, 60 to 160 ms, while holding the write queue). Rare at 10,000 players; make it async before a launch-day burst.
- **Leaderboards rank everyone on every request** (22 ms at 10,000, about 270 ms at 100,000). Cache the ranking if popular.
- **`feedback` and `audit` stay in the main row** (capped at 2,000 and 5,000 entries; up to about 1 MB together), and so does about 1 KB per market. Shard them if the main row passes about 1 MB.
- **`events`** keeps the newest 50,000, which is only a few days of data at 3,000 daily players. Weekly retention metrics need daily counters (not built).
- **Backups** (`api/backup.js`) read and stringify the whole state: 5 MB at 10,000 players, 40 MB and 440 MB of memory at 100,000. Once a day, and not at all if today's file exists.
- **Out-of-band edits.** Copies notice changes by version number, a version going down, or a new epoch. Manual SQL on `app_state` must bump `version` (the documented restore does).
- **Deploys.** Replace all server copies at once (Vercel does). An old copy running next to new ones does not know the per-market rows and would show markets without holder books.
