# Fix 04: admin bootstrap

| ID | Result | Note | Test |
|---|---|---|---|
| F1 Critical | FIXED | Admin at sign-up needs ADMIN_SETUP_CODE (constant-time compare, sha256 then timingSafeEqual). No code: normal player. Wrong code: `bad_setup`, nothing created, failures rate limited (6 per 15 min, global bucket). Login-time grant with the code. Prod without the code fails closed in ADMINS(). Non-prod with code unset keeps old behaviour. | test-admin.js |
| F2 High | FIXED | chphone always clears the admin flag; delete wipes the user; the freed number needs the code again. | test-admin.js |
| F3 High | FIXED | `syncAdmin` runs in uidIn and the resetpw path: admin = flag AND current number in ADMINS(), every request; flag dropped when not. docs/breach-response.md updated. | test-admin.js |
| F4 Medium | FIXED | A45 exemption only when the setup code is valid (or non-prod with code unset). | test-admin.js |
| F5 Medium | FIXED | ADMINS() de-duplicates aliases. | test-admin.js |
| F6 Medium | FIXED | adminCount = distinct active admins whose number is listed. test-features.js expectation changed 2 -> 1 (only one admin registered there). | test-admin.js, test-features.js |
| F7 Low | FIXED (partly) | Warn at most once an hour per process with a clearer message. Still log-only; the inbox banner is the real signal. | test-admin.js |
| F8 Low | FIXED | chphone/delete use clearAttempts. | test-admin.js |
| F9 Low | DEFERRED | Doc note only: public preview deployments should set ADMIN_SETUP_CODE too (the code works outside production when set). | n/a |

UI: collapsed "Admin setup code" details on the sign-up and login forms (`admin_setup`, `e_bad_setup`, both languages); the client sends `body.setup`.

Commands: `npm test` PASS (incl. i18n and size, app.js 25.3/26 KB). test-admin.js fails on the old handler ("no code, no admin") and passes now. test-pg.js PASS (ports changed to avoid collisions; it logs a pre-existing migrate TypeError on both baseline and fixed code).

Coordinator notes:
- Non-admin `inbox` returns 400 `forbidden` (not 403 as the reviewer wrote); unchanged.
- test-api.js: prod fail-closed check now also sets ADMIN_SETUP_CODE; package.json test script gains `node test-admin.js`.
- Deploy: SK must set ADMIN_SETUP_CODE in Vercel before redeploy, or production boot returns 503. Existing admins already flagged keep access (their numbers are listed).
- Fold into README: env var ADMIN_SETUP_CODE; docs/operations.md already has the row.
- syncAdmin may delete a stale u.admin on a read; harmless.
