# Run the six features on their own

This folder is a complete, runnable copy of the DHK-Predicts app with the six features built in. It is the only copy of that code in this repo; the three tools next to it are used by its checks, not duplicated.

    git clone <this repo> && cd upcoming/dhk-predicts-features/app
    ADMIN_PHONES=01711000000,+12125550123 npm start     # http://localhost:8080, no npm install needed
    npm test                                            # all suites + the sibling i18n-parity and size-budget checks

Sign up with an admin number to get the admin tools. `npm install` is only needed for `npm run test:pg` (the Postgres test) or the Vercel deploy. State is a local `data.json` (`DATA_FILE` changes it).

| Feature | Try it | Files |
|---|---|---|
| Streak | Groups page, top card ("come back tomorrow" on sign-up day) | `public/app.js`, `social.js` |
| Admin password reset | Admin, "Reset a player's password"; the player uses "Forgot your password?". Admin accounts can NOT be reset in-app (recovery is a server-config job). Redemption is audited. | `lib/handler.js`, `public/app.js` |
| SMS-code login (OTP) | Off by default, never for admin accounts. See "Deploy settings" and `docs/otp.md`. | `lib/handler.js`, `lib/sms.js`, `public/app.js` |
| Sponsor line | Admin, "Sponsor line"; shows under the question list, labelled "Sponsored" | `core.js`, `public/app.js` |
| Audit log CSV | Admin, Audit log, "Download audit log CSV" (Excel-safe, admin id column, note when old entries were dropped) | `core.js`, `public/app.js` |
| Dispute windows | Proposed results settle automatically when the window ends with no open disputes (every write sweeps, plus a daily `/api/sweep`). Disputed ones show Overdue / Needs review. Windows under 1 hour need a second admin. | `core.js`, `api/sweep.js`, `public/app.js` |
| Admin setup | Admin status needs `ADMIN_SETUP_CODE` at sign-up or login; it is re-checked against `ADMIN_PHONES` on every request | `lib/handler.js` |

## Deploy settings (production)

| Setting | Why |
|---|---|
| `ADMIN_PHONES` | Two or more numbers. Removing a number revokes that admin immediately. |
| `ADMIN_SETUP_CODE` | Required in production (the server refuses to start without it). Long random string; enter it in "Admin setup code" when an admin signs up or logs in. |
| `CRON_SECRET` | Protects `/api/backup` and `/api/sweep`. |
| `OTP_ENABLED=1`, `OTP_SECRET`, `OTP_DAILY_CAP`, `SMS_PROVIDER` (+ `SMS_WEBHOOK_URL`, `SMS_WEBHOOK_TOKEN`), optional `OTP_COUNTRIES`, `OTP_COUNTRY_CAPS` | SMS login. Without `OTP_SECRET` and `OTP_DAILY_CAP` it stays off in production. Also set a spending cap at the SMS provider. |
| `TRUST_PROXY=1` | Only when exactly one non-Vercel proxy sits in front: use the right-most `x-forwarded-for` hop. On Vercel the platform IP header is used automatically. |

Login limits (15-minute windows): 6 failures per IP and phone, 30 per IP; a per-phone ceiling of 60 failures from all IPs only tightens other IPs to 2 tries, so the real owner is never locked out. Password-reset redemption: 5 failures per IP and phone, 10 per IP.

Tests for all of these: `test-features.js`, `test-admin.js`, `test-reset.js`, `test-otp.js`, `test-audit.js`, `test-window.js`, `test-streak.js`; Postgres ones via `npm run test:pg`; `npm run test:browser` checks the browser cache is cleared at logout. Scaling: `docs/scaling.md` has the 10,000-player results (`bench/soak.js`, `bench/load.js`). Review history: the ten red-team reports and what was fixed are in the repo's `review/` folder.

---

