# 06 due-soon tag and dispute-window lifecycle

1. **Verdict: FIX FIRST, 4/10.** The tag itself is a one-line flag with a correct 6h comparison. The lifecycle it is meant to protect never settles anything on its own, and the tag shows "Due soon" on a window that expired days ago.

2. **What I ran**
   - Read `core.js` (READS.inbox, propose, retract, dispute, resolve, review, confirm) and `public/app.js` (inbox row, proposedCard, click handlers).
   - Grepped `server.js`, `lib/*` and `core.js` for timers or sweeps (the only timer is the filestore write debounce).
   - Ran `/home/user/upcoming/review/repro/06-window-lifecycle.js`, pure Core with `now` time-travelled. Output quoted below.

3. **Findings**

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| F1 | High, CONFIRMED | Nothing settles an expired proposal. No cron, no read-path or write-path sweep. The market stays `proposed`, trading stays closed and points never move until an admin presses "Settle now". Players' points stay locked indefinitely. | Repro: 30 days after expiry, after `home` reads and other writes, `status = proposed, player pts = 900 (never auto-settled)`. | Lazy-settle in `act()` (or a `setInterval` in `server.js`): if `status==='proposed' && now>until` and no open disputes, run the resolve logic. At minimum have `home`/`market` flag it. |
| F2 | High, CONFIRMED | `soon: until - now <= 6h` is true for negative values. An expired window shows the same "Due soon" tag as one with 1h left. There is no "overdue" state, so the one case that matters (nobody acted) is indistinguishable and reads as less urgent than it is. | Repro: 30 days after expiry the inbox row is `soon:true`. The 6h boundary is inclusive: false at 17h, true at 18h. | `core.js:415`: add `overdue: until < now` and `soon: !overdue && until-now <= 6h`. Add a tag key and render it in a danger style at `public/app.js:585`. |
| F3 | High, CONFIRMED (by design) | The tag only appears if an admin opens the admin page. There is no push, email, SMS or badge. SMS exists in `lib/sms.js` but is not used for this. At 10k players, an admin who does not look for 24h misses the window, and then F1 applies. | grep for notification code finds none. `READS.inbox` is the only surface. | Add a count badge on the admin nav and the home screen. Better, fix F1 so a missed window self-settles. |
| F4 | Medium, CONFIRMED | The initial settle has no two-admin rule. The proposer can resolve their own proposal. With `hours:0` one admin can propose and resolve in the same millisecond, so the dispute window and the second-admin protection are bypassed completely. The rule applies only to later corrections. | Repro: `propose hours=0` then immediate `resolve` by the same admin returns `{ok:true}`. A player has `canDispute:false` at +1s. | In `resolve`, throw `same_admin` when `m.proposal.by === uid`, or require `hours >= 1` for the first-time settle path. |
| F5 | Medium, CONFIRMED | Disputes on a `proposed` market are collected but nobody can act on them. `review` requires `resolved`. `resolve` ignores `m.disputes`, so an admin can settle past any number of disputes with no prompt. The only remedy is retract, which wipes the disputes (`m.disputes = []`). | Repro: `review` on a proposed market gives `ERR no_dispute`. Resolving after a last-second dispute succeeds, and the dispute then carries into the resolved review flow. | Make `resolve` refuse (`has_disputes`) while open disputes exist unless `a.early`/`a.ack`. Or archive the disputes on retract instead of deleting them. |
| F6 | Medium, CONFIRMED | The "Settle now" button (`data-final`, `app.js:758`) calls `resolve` without `early`. During the window it always fails with `window_open`, and the button is shown for the whole window. `a.early` is never sent by any UI. | Repro: `resolve` at T+5h gives `ERR window_open`. `grep early public/app.js` finds nothing. | Hide the button until `until` has passed (or send `early:true` after a confirm dialog). |
| F7 | Medium, CONFIRMED | `hours` is coerced with `Number()`, so `''` and `' '` give a 0h window (no dispute chance) instead of the default 24 or a rejection. `1e-9` is accepted. Only `null`/`undefined` default to 24. | Repro: `hours="" -> window 0h`, `hours=" " -> window 0h`, `hours=1e-9` accepted. 72 is OK and 72.0001 is rejected. | `core.js:511`: treat blank strings like null. Enforce a floor (>= 1h) or an explicit `no_window` flag. |
| F8 | Low, CONFIRMED | The proposed list is not sorted by urgency. It is in market array order. | Repro: `72h, 1h*, 30h`. | Sort by `until` ascending in READS.inbox, overdue first. |
| F9 | Low, CONFIRMED | The 6h threshold on a 24h window leaves 6h to notice. With no alerts (F3) and an admin in a different timezone, that is thin. It is also the same 6h for 1h and 72h windows. | Same repro. | Use max(6h, 25% of the window) and pair it with F3. |
| F10 | Low, SUSPECTED | The deadline is shown with `getHours()` in the viewer's local timezone and no timezone label. Diaspora players (UK, US) and the Dhaka admin see different clock times for the same deadline. I did not run this in a browser. | Read `app.js:233-234`. | Show a TZ abbreviation, or show "in 5h" next to the clock. |
| F11 | Low, CONFIRMED | The last-second dispute is allowed at exactly `until` (`now > until` is the check) and rejected 1ms later, with the market still `proposed`. This is consistent, but the player-facing deadline is exact to the millisecond and depends on server clock and latency. | Repro: allowed at T+24h, `ERR dispute_over` at +1ms. | Add a few seconds of grace. |

   Race note: concurrent resolve/retract are serialised by `store.transact`. I did not test this concurrently, so it is SUSPECTED safe. Not tested: Postgres path, the browser UI.

4. **What actually holds up**
   - The 6h comparison works as written. `test-features.js` covers the fresh and 1h cases.
   - Window bounds 0 to 72 are enforced, with `-1`, `72.0001` and `abc` rejected.
   - A fresh 24h window is not flagged.
   - Dispute at the deadline and rejection after it behave consistently.
   - `window_open` prevents an accidental early settle.
   - Two-admin confirm blocks same-admin approval of corrections (`same_admin`).

5. **Does this item matter?** The tag is cheap and harmless, but it papers over the real hole. The dispute window is a promise to players ("points move after 24h"), and the system only keeps it if a human opens the admin page at the right time and clicks. For a play-money game with 10,000 players that is a trust and support problem: stuck markets and angry "why haven't I been paid" feedback. Settling expired, undisputed proposals automatically (F1) and distinguishing overdue from due soon (F2) are worth far more than the tag. The tag is only worth keeping once it can say "overdue".

REPORT COMPLETE
