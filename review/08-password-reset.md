# 08 Admin password reset

**Verdict: FIX FIRST (5/10).** Crypto and mechanics are sound (72-bit code, hashed, one-time, 1 h, sessions killed on file and Postgres). The authorization model and the shared rate limiter are not.

## What I ran
- `node /home/user/upcoming/review/repro/08-reset-file.js` (handleApi + file store, fake clock via Date.now skew). Output lines are CONFIRMED/NOT-REPRODUCED per id below.
- `08-reset-pg.js` (two serverless-style instances on embedded Postgres port 54408, run as uid 65534).
- Code read of handler.js 103-134, 187-197, app.js api()/resetForm/rstmake, pgstore SHARDED, sw.js.

## Findings
| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| F1 | High | Any admin can take over any other admin (or any player) with one request pair: `resetpw` then `usereset` with the admin's own chosen password. The result is a live session as the victim; victim's old password and tokens stop working. No second-admin approval, no notice to the victim. CONFIRMED on file store and Postgres. | R1, R1b (file); PG line "admin->admin takeover: status 200, admin=true, B old token alive=false" | handler.js issueReset: refuse when target `users[uid].admin` (admin passwords reset only via ops/env); or require a second admin's confirmation. Never return the code to the issuer to redeem themselves: also block `usereset` when the code's `by` equals the caller's session uid. |
| F2 | High | Audit trail is blind to the takeover. Only `resetpw {user}` is logged. Redemption (who, when, ip, which sessions died) is not logged, and everything done afterwards is logged under the victim's name. CONFIRMED | R2: audit rows = one `resetpw` by AdminA, nothing else | In useReset call `Core.audit`-style entry `resetused` (uid, ip, time) and store `by` (issuer uid) in the s.resets record; show on `auditall`. |
| F3 | High | Unauthenticated lockout DoS. `useReset` and `auth` share `limited()` keyed by phone only. 6 anonymous calls with a garbage code lock that number's login for the rest of the 15 min window; real password refused. Works on admin phones too, and on a victim holding a valid reset code (the recovery path is blocked by the attack). Window is fixed, not rolling, so 7 requests per 15 min keeps it locked forever (~28 req/h). No per-IP limit. Across instances on PG too. CONFIRMED | R6, R6b, R6c, R6d; PG "victim login ... 400 slow_down" | Separate buckets: failed login keyed phone+IP, usereset keyed by (phone) with a small cap but NOT blocking login; add per-IP limit (handler already receives `ip`); count only failures; do not count a request whose credentials are valid. |
| F4 | Medium | Unbounded state growth: every anonymous request with a syntactically valid new phone creates a `state.attempts` entry (a Postgres shard row each) and every call scans and rehashes all entries. 3000 calls gave 3001 entries, 7.1 s total on the file store. No per-IP cap. CONFIRMED | R7 | Per-IP counter first; cap size of `attempts`; skip entries for numbers that have no account (still return the same error). |
| F5 | Medium | Code is not revoked when it should be: still redeemable after the player logs in with their own password (R3), and after the issuing admin lost admin rights (R4). Combined with F1 the issuer keeps a 1 h backdoor even if the player recovered. After delete an orphan `resets` row stays until the next issueReset sweep (R5, harmless: uid mismatch on re-signup). CONFIRMED | R3, R4, R5 | `auth` success (and chphone) delete `resets` for that uid; useReset re-checks `users[r.by].admin`; Core.deleteUser deletes resets. |
| F6 | Low | Enumeration: `usereset` gives identical `bad_reset`/`slow_down` sequences for known and unknown numbers and no scrypt on either path (230 us vs 147 us, noise). Not enumerable here. But `auth` signup still returns `phone_taken` for any registered number, so account existence leaks anyway (R8b). CONFIRMED | R8, R8b, R8c | Out of this item: signup oracle needs OTP or a generic reply. |
| F7 | Low | Race on the FILE store only: `transact` clones state, runs fn, assigns later, so 4 concurrent `usereset` with one code all returned 200 (lost update). Not reachable by sequential HTTP requests (each request is its own macrotask), so dev-only. Postgres: 6 concurrent over 2 instances gave exactly 1 winner. CONFIRMED (file, in-process only) | R9 (4x 200); PG "winners=1" | filestore.js: serialize transact with a promise chain. |
| F8 | Low | `chphone`/`delete` clear attempts with `delete s.attempts[phone]` but the key is a hash, so the clear is a no-op; every call there also counts toward the limit. Policy: min 6 only (no check against the phone number or common passwords). SUSPECTED from code, not run | handler.js 232, 242 | use clearAttempts(s, phone). |
| F9 | Low | A second `resetpw` for the same player silently kills the first admin's code (R10), so two admins can grief each other. CONFIRMED | R10 | Acceptable; note in UI. |

## What holds up (tested)
- Code: 9 random bytes base64url = 72 bits; stored as sha256; 6 guesses per 15 min per phone makes brute force infeasible (R9b expiry at 61 min enforced; one-time use).
- Non-admin and anonymous `resetpw` return 403; GET returns use_post (R9c-e).
- On Postgres all 10 prior sessions across both instances were dead after reset (0 of 10 alive); concurrent redemption yields one winner.
- Code is not in audit args, not in logs, `Cache-Control: no-store`, POST body (no URL/history), `resetpw`/`usereset` are in app.js `write` so not written to localStorage cache; sw.js skips /api. The admin UI keeps the code in `V._rst` in memory only; I did not verify when it is cleared (SUSPECTED lingering across admin tab re-renders).

## Does this item matter?
Yes for 10,000 players: forgotten passwords are the main support case and there is no SMS/email fallback (OTP is off by default). A manual admin reset is the cheap answer, but today it doubles as a full account-takeover tool with no trace, and the shared limiter lets a stranger lock out anyone, including the admins who must run the reset. Fix F1 to F3 and F5 before launch; the rest is polish.

REPORT COMPLETE
