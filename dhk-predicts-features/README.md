# DHK-Predicts in-app features (one patch)

Six features for DataBD1/DHK-Predicts that only work inside that app, so they are a patch, not a tool.
Base commit: `bbcab1e` ("Sync rival-a: site clock UTC+0 ..."). Tested: applied to a clean checkout of that commit, all suites pass (except `test-pg.js`, which needs `npm i`).

    git checkout bbcab1e
    git apply dhk-predicts-features/six-features.patch
    npm test            # or run the suites one by one, test-pg.js needs `npm i` first

| Feature | Where |
|---|---|
| Streak shown on the Groups page | `public/app.js` |
| Admin password reset: one-time code (1 hour, hashed, audited), "Forgot your password?" screen | `lib/handler.js`, `core.js`, `public/app.js` |
| OTP send/verify, off unless `OTP_ENABLED=1` and an SMS provider is set; no screen yet | `lib/handler.js`, `lib/sms.js` |
| Sponsor line under the question list (https links, labelled "Sponsored") | `core.js`, `public/app.js` |
| Audit log CSV export, with spreadsheet-formula neutralizing | `core.js`, `public/app.js` |
| Due-soon tag on proposals with under 6 hours of dispute window; warning when fewer than 2 admin numbers | `core.js`, `lib/handler.js`, `public/app.js` |

Tests: `test-features.js` (added by the patch). The patch also bumps the service-worker cache to `dp-a-v4`.
Not in the patch: `preview.html` (rebuild with `node build-preview.js`) and README text.
The full version, with the three tools too, is on the `ccr-e3d32d8f-y7yw8y` branch of DHK-Predicts.
