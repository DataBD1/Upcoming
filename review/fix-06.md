# fix-06 dispute window / due-soon

| ID | Status | Note | Test |
|---|---|---|---|
| F1 no auto-settle | FIXED | `sweep()` runs first in every write (BEFORE hook), settles expired proposals with no open dispute via the same `finalize()` as admin resolve, audit entry by `system`. Reads (`home`, `market`) show the settled result without mutating state. Daily cron `/api/sweep` (CRON_SECRET, like backup). | `test-window.js` time travel, reads, sweep |
| F2 expired shown as "Due soon" | FIXED | inbox rows have `overdue`, `soon` (only with time left, <6h), `needs` (review/approval/settle). Overdue tag in danger style. | inbox test |
| F3 no alert | PARTLY | Self-settling removes the harm for undisputed proposals; disputed ones show Overdue + Needs review, sorted first. No badge/push added (new feature). DEFERRED: nav badge. | - |
| F4 hours:0 self-resolve | FIXED | windows <1h (incl. 0) are `short`: never auto-settled, proposer cannot resolve (`same_admin`), a second admin can. Early settle also needs a different admin. | short-window test |
| F5 disputes on proposed unreviewable | FIXED | `review`/`confirm` work on proposed markets (a change edits the proposal only); `resolve` refuses with `has_disputes`; `retract` archives to `m.disputeLog` (shown in inbox as retracted, scrubbed on account delete, audit `retract_disputes` with count). | disputes test |
| F6 Settle now button | FIXED | sends `early:true` after a confirm, hidden for the proposer during the window / short windows / open disputes. | UI only, not browser-tested |
| F7 blank/absurd hours | FIXED | blank, whitespace, text, bool, object, <15 min (but >0), >72 all `bad_window`. | hours test |
| F8 sort | FIXED | overdue first, then soonest deadline. | inbox test |
| F9 6h threshold | WON'T FIX | kept at 6h per coordinator decision; auto-settle makes it low value. | - |
| F10 timezone | FIXED | deadline shows a short tz name (`tzl()`, Intl). Browser-untested. | - |
| F11 grace | WON'T FIX | boundary is consistent; sweep uses strict `now > until`, same as dispute. | - |

Also: added missing `e_` strings in both languages (has_disputes, bad_city, bad_json, bad_outcome, dup_action, login, no_dispute, no_market, no_shares, not_resolved, too_large, try_again, use_post); new keys overdue, need_review, need_approval, need_settle, early_confirm; `e_bad_window` text updated.

Commands: `npm test` in app folder PASS (includes new `test-window.js`, 7 tests; before the fix the first one fails with `'proposed' == 'resolved'`). `node --check api/sweep.js` OK. Postgres test (`test-pg.js`) NOT run; browser NOT run.

For the coordinator:
- `size-budget.json`: raised core.js 15->16 KB and total 46->47 KB (real logic added). Expect merge conflicts if other fixes also touch it.
- `test.js` line 158: propose `hours:0` + same-admin resolve is now illegal; changed to `hours:1`, resolve after the window.
- Behavior change: a write by anyone can settle first, so an admin's own `resolve`/`retract` on an expired proposal may return `closed`/`no_proposal`.
- Reads show the virtual settled state (`settling:true`, holders 0, totalPaid 0) until the next write or cron; points on `me` update only after the real settle. A handler-level sweep-then-read would be cleaner but handler.js is outside my scope.
- Cron is daily (Vercel Hobby limit). `vercel.json` rewrite now excludes `sweep` as well as `backup`.
- `audit()` tolerates a non-user id ('system').
- README: document `/api/sweep`, auto-settle rule, short-window rule, `needs`/`overdue` fields.
