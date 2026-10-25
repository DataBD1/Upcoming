# Scaling to 10,000 players

How the Postgres store was taken from "fine for hundreds" to 10,000+ players, one measured round at a time.
Tools: `bench/load.js` (timed operations under concurrency), `bench/ops.js` (one operation at a time, rows written),
`bench/prof.js` (where a request's time goes), `bench/soak.js` (steady traffic at a fixed rate). Run as a non-root user after
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

## Steady traffic (`bench/soak.js`, mix: 55% home, 15% market, 8% leaderboard, 14% buy, 3% top-up, 2% feedback, 1% login, 2% session check)

| Players | Rate | Server copies | Slowest p95 | Server errors |
|---|---|---|---|---|
| 10,000 | 60 req/s | 3 | 89 ms (login) | 0 |
| 10,000 | 200 req/s | 3 | 182 ms (login); buy p95 177 ms | 0 |
| 25,000 | 100 req/s | 3 | 297 ms (login); buy p95 149 ms | 0 |

For scale: 10,000 registered players is roughly 3,000 daily and a peak of about 10 to 20 requests a second.

## Known limits (not fixed, in the order they will bite)

- **Test conditions are kind.** Postgres ran on the same machine, so network time to Supabase is not in these numbers. A write makes about 8 round trips (begin, lock, rollback-copy check, shard upserts, main row, commit); at 2 to 20 ms each that adds 15 to 160 ms per write. Reads cost one tiny version check.
- **One write lock.** Writes queue behind each other, about 150 a second here. Far above what 10,000 players generate; past tens of thousands of players the next step is locking per market.
- **Login and sign-up hash passwords on the main thread** (`scryptSync`, about 60 ms). Rare at 10,000 players (a session lasts 30 days) but a launch-day sign-up burst stalls that server copy for 60 ms each. Make it async before a big launch.
- **Leaderboards rank everyone on every request**: 22 ms at 10,000, 46 ms at 25,000. Cache the ranking for a few seconds if they become popular.
- **`feedback`, `audit` and `markets` stay in the main row** (feedback is capped at 2,000 entries, audit at 5,000). Each can add a few hundred KB, rewritten on every write. Shard or table them when the main row passes about 1 MB (`select length(data::text) from app_state`).
- **Memory.** Each server copy holds the whole state (players, positions, sessions). Not measured here; expect tens of MB at 10,000 players. A cold start reloads everything once (about 150 ms to 1 s).
- **Out-of-band edits.** Server copies notice changes by version number and reload everything every 10 minutes. Manual SQL on `app_state` must bump `version` (the documented restore does).
