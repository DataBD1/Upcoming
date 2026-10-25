# Run the six features on their own

This folder is a complete, runnable copy of the DHK-Predicts app with the six features built in. It is the only copy of that code in this repo; the three tools next to it are used by its checks, not duplicated.

    git clone <this repo> && cd upcoming/dhk-predicts-features/app
    ADMIN_PHONES=01711000000,+12125550123 npm start     # http://localhost:8080, no npm install needed
    npm test                                            # all suites + the sibling i18n-parity and size-budget checks

Sign up with an admin number to get the admin tools. `npm install` is only needed for `npm run test:pg` (the Postgres test) or the Vercel deploy. State is a local `data.json` (`DATA_FILE` changes it).

| Feature | Try it | Files |
|---|---|---|
| Streak | Groups page, top card | `public/app.js` |
| Admin password reset | Admin, "Reset a player's password"; player uses "Forgot your password?" on Log in | `lib/handler.js`, `core.js`, `public/app.js` |
| SMS-code login (OTP) | Off by default. `OTP_ENABLED=1 SMS_PROVIDER=console npm start` logs codes to the server output; then "Log in with an SMS code" | `lib/handler.js`, `lib/sms.js`, `public/app.js` |
| Sponsor line | Admin, "Sponsor line"; shows under the question list | `core.js`, `public/app.js` |
| Audit log CSV | Admin, Audit log, "Download audit log CSV" | `core.js`, `public/app.js` |
| Due-soon tag and admin-count warning | Admin inbox: tag on proposals with under 6h of dispute window; warning when fewer than 2 admin numbers (production) | `core.js`, `lib/handler.js`, `public/app.js` |

Tests for all of these: `test-features.js`. Scaling: `docs/scaling.md` has the 10,000-player test results (`bench/soak.js`, `bench/load.js`). Storage: on Postgres the big maps are sharded into `app_shards` (`lib/pgstore.js`; test with `npm install` then `npm run test:pg`, which needs a non-root user because Postgres refuses to start as root). Real SMS: set `SMS_PROVIDER=webhook` and `SMS_WEBHOOK_URL`; see "Phone OTP" in the app README below. Source of truth for ongoing work: DataBD1/DHK-Predicts.

---

