# Red-team review and fixes

Ten reviewers (one per item) attacked the work; ten fix agents (one per item) repaired it. Reports are `NN-*.md`, reproduction scripts are in `repro/`, fix write-ups are `fix-NN.md`. Fixes were merged on one branch and tested together.

| # | Item | Review | Fixed / won't fix / deferred | Open after the fix |
|---|---|---|---|---|
| 01 | Streak | FIX FIRST 6/10 | 4 / 2 / 1 (cache part fixed by 05) | Admin city change mid-streak; streak shown only on Groups page |
| 02 | Size budget | FIX FIRST 5/10 | 7 / 1 / 0 (+2 sub-parts deferred) | File list is hand-kept, not derived from sw.js; real CDN compression level unverified |
| 03 | Translation check | FIX FIRST 4/10 | 7 / 1 / 1 | Wrong variable at a call site, English paragraph inside Bangla text, some mojibake: not caught |
| 04 | Admin setup | FIX FIRST 3/10 (Critical) | 8 / 0 / 1 | Docs note for preview deployments |
| 05 | Audit export | FIX FIRST 6/10 | 5 + 1 partly / 3 / 0 | Audit log still in the main row; denied attempts not logged |
| 06 | Dispute windows | FIX FIRST 4/10 | 8 + 1 partly / 2 / 0 | No admin notification outside the page; points update at next write or daily sweep |
| 07 | Threshold tool | REWORK 2/10 | 10 / 0 / 0 | Only about as good as "yesterday's value" on noisy or seasonal series |
| 08 | Password reset | FIX FIRST 5/10 | 7 / 2 / 0 | Sign-up reveals taken numbers (needs verified sign-up) |
| 09 | SMS login | FIX FIRST 4/10 (2 Critical) | 9 / 0 / 0 | Unverified sign-up still lets an attacker spend the capped SMS budget |
| 10 | Storage | REWORK 3/10 (Critical) | 14 / 0 / 2 | Main row about 104 KB after 100 markets; leaderboard ranks everyone per request; password hashing on the main thread |

Combined result: `npm test` passes; the four Postgres suites pass; 20 fresh fuzz seeds on the merged code show no divergence; 10,000-player soaks show no server errors.
