# Fix 08: admin password reset

| ID | Status | Note | Test |
|---|---|---|---|
| F1 | FIXED | Admin accounts (users[uid].admin or phone in ADMIN_PHONES) can not be reset in-app: `admin_reset_denied` (403) on issue and again on redeem. Normal players still resettable by any admin. Redeem also needs the issuing admin to still be admin. | test-reset.js F1 block |
| F2 | FIXED | `resetpw_used` audit entry `{user, by}`, no code. Issue entry kept; records now store `by`. | test-reset.js (audit asserts) |
| F3 | FIXED | Reset has its own limiter; login limiter counts failures only. See numbers below. | test-reset.js F3 block, test-reset-pg.js |
| F4 | FIXED | Expiry prune on every call plus hard cap of 2000 entries (oldest dropped). One IP creates at most about 90 entries per window. | test-reset.js F4 block |
| F5 | FIXED | Revoked on password login, chphone, delete, issuer demotion (chphone, or flag removed: re-checked at redeem). | test-reset.js F5 block |
| F6 | WON'T FIX | Signup `phone_taken` oracle is outside this item (needs OTP at signup). Failed signups on a taken number now count toward the per-IP login cap. | - |
| F7 | WON'T FIX | File-store-only race, not reachable over HTTP; filestore.js not in my scope. Postgres has exactly one winner (tested). | test-reset-pg.js |
| F8 | FIXED | chphone/delete use the same limiter helpers; the no-op `delete s.attempts[phone]` is gone. Password policy (min 6) unchanged. | test-reset.js |
| F9 | FIXED (UI note) | Admin form shows "A new code cancels the previous one" and that admin accounts can not be reset (`reset_note`). | i18n check |

## Limiter numbers (15 min fixed window, all in state.attempts, keys are hashes)
- Login: 6 failures per (ip, phone); 30 failures per ip over all phones; per-phone ceiling 60 failures from all IPs together. Past the ceiling nobody is locked out: each (ip, phone) pair gets 2 tries instead of 6, so the owner with the right password still gets in. Success clears only that caller's (ip, phone) counter.
- Reset: 5 failures per (ip, phone), 10 per ip over all phones. Independent of login (garbage resets never block login).
- Cap 2000 entries. An attacker rotating thousands of IPs can evict old counters (weakens limits, cannot lock anyone out). A botnet needs many IPs for a password guess: 2 tries per IP once a phone is hot.

## Commands
- `npm test` in app: PASS (includes new `node test-reset.js`, i18n parity, size budget).
- Before fix, test-reset.js fails at its first assertion (`200 == 403`, admin takeover).
- `test-pg.js` and new `test-reset-pg.js` (setpriv recipe, port 54418): PASS. test-reset-pg.js is not in `npm test` (like test-pg.js).

## For the coordinator
- handler.js hunks: limiter block, `auth()` gets an `ip` argument (call site in the `auth` route), reset functions, `resetpw/usereset` route (status 403 for admin_reset_denied), chphone/delete block. OTP code untouched; `otpVerify` does NOT revoke reset codes on OTP login (fix-09 region): add `revokeResets(s, r => r.uid === rec.uid)` there if wanted.
- Depends on `ip` from handleApi; with no ip all callers share bucket '?'. If fix-09 changes IP extraction, nothing here changes. Today x-forwarded-for's first entry is spoofable, which weakens per-IP limits until fix-09 lands.
- Not done: `V._rst` (code shown in admin UI) lingering in memory across re-renders; not verified.
- README: document admin-reset policy (admin accounts recovered via server config) and the limiter numbers above.
