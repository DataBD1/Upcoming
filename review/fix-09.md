# fix-09 (OTP)

| ID | Result | Note | Test (test-otp.js unless noted) |
|---|---|---|---|
| F1 admin bypass | FIXED | OTP never for admins (env list or user flag), same generic reply, no session | admin accounts cannot log in...; a user flagged admin... ; test-pg-otp.js |
| F2 XFF spoof | FIXED | Vercel header / socket; XFF only with TRUST_PROXY=1, right-most | client IP: socket by default... |
| F3 pumping | FIXED | per-country + global daily caps, per-number, OTP_COUNTRIES, prod needs OTP_DAILY_CAP and OTP_SECRET. Residual: sign-up is still unverified, so an attacker can still spend the (capped) budget; the cap bounds cost, not DoS of the budget | only OTP_COUNTRIES...; production refuses... |
| F4 enumeration | FIXED | identical status/body, immediate reply, send after (waitUntil / detached promise); limits counted for unknown numbers too | unknown, admin, rate-limited and provider-failure replies are identical, and instant |
| F5 hash | FIXED | HMAC with OTP_SECRET, keys HMACed too | codes are HMACed... |
| F6 failed send | FIXED | failed send deletes the code and refunds daily/country budget (per-number send count stays) | a failed send leaves no usable code |
| F7 | n/a (already good) | | |
| F8 log/app name | FIXED | app name + do-not-share text, masked number in logs (code still printed by the dev-only console provider) | normal user logs in...; log phone masking |
| F9 double submit | FIXED | button disabled during request (browser not driven; code-level) | none (UI) |
| brute force on resend (coordinator item 5) | FIXED | tries carry over; 10/h/number, 30/h/IP verify cap | tries do not reset...; verify attempts are capped per IP |
| PG concurrency / hot row | FIXED (state shape) | otpcodes, otpsends top-level maps + otp {day,n}; fix-10 must add both to SHARDED | test-pg-otp.js |

Commands: `npm test` PASS (includes test-otp.js, updated OTP block in test-features.js, i18n, size: app.js 25.3/26 KB). `PG_PORT=54409 PG_DIR=/tmp/pgrun/fix09-otp run node test-pg-otp.js` PASS (two instances). Before the fix test-otp.js fails (12 of 12; H.otpIdle did not exist and behaviour differed).

Coordinator notes:
- fix-10: add `otpcodes` and `otpsends` to SHARDED in lib/pgstore.js. Per-country daily counters live in `otpsends` under `c:<code>` keys (rolling 24h), so `otp` stays `{day, n}`.
- Merge: lib/handler.js hunks are the OTP block, the otpsend/otpverify routes, new `clientIp()` above serveApi and the `ip:` line, and exports (`clientIp`, `otpIdle`). test-features.js OTP block changed (async sends, new message text, generic replies instead of slow_down). package.json: test-otp.js added to `test`, test-pg-otp.js to `test:pg`.
- New docs/otp.md should be folded into the app README "Phone OTP" section (I did not edit README). docs/architecture.md line 65 untouched.
- Ops: set OTP_SECRET, OTP_DAILY_CAP (and a matching cap at the SMS provider) before OTP_ENABLED=1 in production. Behind Vercel nothing else is needed; elsewhere with a proxy set TRUST_PROXY=1.
- Decision left: sign-up is unverified, so OTP remains a convenience login, not proof of number ownership.
