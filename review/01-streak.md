# 01-streak review

**Verdict: FIX FIRST, 6/10.** The counting itself is correct and race-safe. The edges around it (migration, sign-up day, stale cache, wording) are not.

## What I ran
- Read social.js (liveStreak, afterWrite 'bonus'), core.js (siteDay, bonus, addUser, migrate4, act), the pgstore refusal/rollback path, public/app.js (V.groups, api cache, logout/delete), sw.js.
- `node review/repro/01-streak-core.js` (pure Core, fake clocks).
- `review/repro/01-streak-pg-race.js` (embedded Postgres :54401, two instances, 12 concurrent bonus claims, run as uid 65534).
- `NODE_PATH=$(npm root -g) node review/repro/01-streak-browser.js` (Playwright, server :8101, Bangla UI, logout, API drop).

## Findings
| ID | Sev | Finding | Evidence | Proposed fix |
|---|---|---|---|---|
| S1 | Medium | **The v4 Dhaka-to-UTC migration wipes streaks and double-pays.** `streakDay` and `lastBonus` are stored as Dhaka dates. For players whose Dhaka date is ahead of UTC (18:00-24:00 UTC), those days are "tomorrow" after the flip. liveStreak returns 0 and `lastBonus != today`, so a second 100 pts is paid about 30 minutes after the last claim and the streak restarts at 1. CONFIRMED | `01-streak-core.js` blocks 3a/3b: "streak 4 -> 0", "bonus paid again" | In core.js migrate4, rewrite every `lastBonus`/`streakDay` later than the new UTC today to today. Also clamp in liveStreak so `streakDay > today` counts as today. |
| S2 | Medium | **The sign-up-day prompt is false.** addUser sets `lastBonus = today`, so a new player cannot claim. The Groups card still says "Take today's 100 points to start a streak". The first streak day is really day 2. CONFIRMED | Block 1: streak=0 bonusReady=false bonus->bonus_taken. The Playwright bn card shows the prompt. | Return `bonusReady` in the social read and show "come back tomorrow" when it is false, or soften the copy. |
| S3 | Medium | **The cached `dp-c:social:{}` survives logout and account deletion, and its key has no user id.** If B signs in on A's browser and the network drops before B opens Groups, B sees A's group names, members' names and worth, and A's streak. Deleted accounts leave this data in localStorage. This is generic to all cached reads, but social is the worst because it holds other people's names. CONFIRMED | Browser repro prints "Bob offline on Alice's browser sees AliceSecretGroup: true". After logout the `dp-c:*` keys remain. | In public/app.js, remove every `dp-c:` key on logout, delete and 401, and put the uid in the cache key. |
| S4 | Low | Changing the site offset (admin `city` action) mid-streak lets a player claim again and credits a streak day after 8 hours (shift east). A shift west resets streaks. Only an admin can trigger it. CONFIRMED | Block 4: streak=2 after 8 h | Re-base streakDay when utcOffset changes, or document it. |
| S5 | Low | Group member rows give co-members the internal `id`, `streak` and `bot` flag. The UI never shows streak or id. This is needless exposure of habit data. CONFIRMED | Block 6 prints the row JSON `{"id":"B",...,"streak":0,...}` | In social.js `row()`, drop `id` and `streak` when `uid !== me`. |
| S6 | Low | `row()` uses `Date.now()` while the read uses `now`, so one response runs on two clocks. Harmless in production because both are the same moment. I only saw it under test clocks. SUSPECTED | Code read | Pass `now` into `row()`. |
| S7 | Low | The streak is shown only on the Groups page, away from the claim banner on home. Players who never open Groups never see it. Design gap, not a bug. | Code read | Show it next to the banner, or drop the feature. |

## What holds up (tested)
- Day boundary: a claim at 23:59:59 followed by one at 00:00:01 the next UTC day gives 2. A refused same-day claim (`bonus_taken`) changes nothing (block 2, plus the existing test-social).
- A skipped day reads as 0 and the next claim restarts at 1; `best` is kept (test-social).
- Postgres concurrency: 12 simultaneous claims across two instances gave exactly 1 accepted and 11 `bonus_taken`. Streak went 5 to 6, pts +100, best 6 (`01-streak-pg-race.js` printed HELD).
- Bangla digits and logged-out behaviour: the bn card shows the none-state copy and the logged-out Groups page shows the login form, not the card (Playwright). The bn count digits with a live streak go through `dig()`; that path I did not render.
- Inflation: I found no way to inflate. afterWrite runs only after a successful bonus, and there is one claim per site day.
- Deletion: the user record is replaced, so the streak fields go. Group membership is removed. Other players' streaks are unaffected (code read of `onDelete` and `deleteUser`, not run).

## Pressure and dark patterns
Mild. It is a bare count with no reward, no point loss and no push, and `best` softens a reset. For an 18+ play-money game that is acceptable. The reset to zero is the only guilt lever. The copy "Take today's 100 points to start a streak" links the daily claim to the streak. Do not add "streak ends tonight" warnings or share-card nags without a responsible-play review.

## Does this item matter?
Marginally. It is about 15 lines and has no economic effect, so the risk is low and the counting is sound. But it sits on a secondary page and is wrong on sign-up day. S1 will hit active players the moment the migration ships, so it needs fixing then. Fix S1-S3 or park the feature. None of it needs to delay the beta.

REPORT COMPLETE
