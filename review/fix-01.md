# fix-01 streak

| ID | Result | Note | Test |
|---|---|---|---|
| S1 | FIXED | migrate4 clamps users' `lastBonus`/`streakDay` that are ahead of the UTC day (uses `Date.now()`) to today; liveStreak counts `streakDay >= today`. Streak kept, no second bonus. | test-streak.js (migration block, clamp block) |
| S2 | FIXED | social read returns `bonusReady`; card shows new `streak_wait` ("come back tomorrow", bn+en) when false. | test-streak.js (S2) |
| S3 | DEFERRED to fix-05 | `dp-c:*` cache survives logout/delete; not touched. | - |
| S4 | WON'T FIX | Admin-only city change mid-streak; rare, needs per-user re-base. Document: change the site offset only at a day boundary. | - |
| S5 | FIXED | Group member rows no longer carry `streak`, nor `id` for others. League rows keep `id` (existing contract, tests and UI use it) but drop `streak` for others. | test-streak.js (S5/S6) |
| S6 | FIXED | `row()` takes `now`. | same |
| S7 | WON'T FIX | Design gap (streak only on Groups). | - |

Commands: before the fix, `node test-streak.js` failed (stashed core/social: assertion error); after, `test-streak OK`. `npm test` (now includes test-streak.js, i18n parity, size budget): PASS.

Coordinator notes: migrate4 hunk is inside the `if` of migrate4 only. Size budget for core.js/social.js/app.js is near its limit (14.4/15, 2.7/3, 25.3/26 KB); other fixes may need budget raised on merge. Fold into README: social read now has `bonusReady`; group member rows hide others' streak/id.
