# Fix 05: audit CSV + client cache

| ID | Status | What / test |
|---|---|---|
| F1 | FIXED | `api()` caches only `home`, `market`, `leaders`, and only while logged out. `clearCaches()` removes every `dp-c:*` key on logout, delete, 401 and token change (login/signup/OTP/reset). sw.js does not cache /api. Test: `test-browser-cache.js` (before: `dp-c:metrics`, `dp-c:inbox` cached; after: none, and stale keys vanish at logout and on 401). |
| F2 | FIXED | Client: same clear on delete. Server: `deleteUser` redacts every non-id string arg (reason, note, name...) in entries where `args.user === uid` or `by === uid`; ids, amounts, action names kept. Test: `test-audit.js` (phone number in a reason is gone). UI hint "no PII in reasons" NOT added (needs new i18n strings; trivial follow-up). |
| F3 | FIXED | CSV starts with a UTF-8 BOM, Blob type `text/csv;charset=utf-8`. Test: `test-browser-cache.js` checks bytes EF BB BF. |
| F4 | FIXED | Columns now `time_utc,admin_uid,admin,action,target_user,market,details`. `auditall` returns `truncated`, `dropped`, `cap`; core keeps `state.auditDropped`; the CSV gets a trailer row `#,,,truncated,,,"...N older entries were dropped"`. Test: `test-audit.js` (5003 entries -> dropped 3). Not done: archiving trimmed entries. |
| F5 | FIXED (partly) | Now audited: admin sign-in and sign-up (`login`), admin `rename`, admin `chphone` (with `demoted`), admin own `delete`. `docs/breach-response.md` corrected. DEFERRED: denied/forbidden attempts and `usereset`/`resetpw` failures (writes roll back inside transact; resetpw is fix-08's region). |
| F6 | PARTLY FIXED | `audit()` caps each string arg at 500 chars and the whole args at 2000 (else `{truncated:true}`). DEFERRED: gzip of API responses, sharding the audit log (fix-10 owns pgstore). The 1.5 MB response is no longer cached in the browser. |
| F7 | WON'T FIX | Leading apostrophe kept as the brief says (formula defence passed review); documented trade-off. |
| F8 | WON'T FIX | No leak found; 400 vs 403 left unchanged (client maps `e_forbidden`). |
| F9 | WON'T FIX | Optional local-time column; not worth the strings. |

## Commands
- `npm test`: PASS (includes new `test-audit.js`, i18n parity, size budget; app.js 25.6/26 KB, total 45.5/46 KB, nearly full).
- `NODE_PATH=$(npm root -g) npm run test:browser` (optional, Playwright, port 8205): PASS. Before the fix it failed with "admin/per-user reads must not be cached: dp-c:metrics,dp-c:inbox".
- `test-audit.js` before the fix: TypeError (no audit entries for admin login).
- `node test-pg.js`: FAILS intermittently, on an untouched baseline copy too ("pgstore verify: log/u... changed without being touched", or `migrate` forEach TypeError). Pre-existing, in fix-10's area; not caused by this change.

## For the coordinator
- Merge care: app.js lines where `token = r.token` are touched (added `clearCaches();`) next to fix-09's OTP/reset UI; handler.js hunks are in `auth()` (end of both branches), and the chphone/delete block, which fix-04 may also touch (the admin-demotion line).
- State gains `auditDropped` (number, top-level); fix-10 should keep it in the main row.
- Offline reading for logged-in users is gone by design; only logged-out home/market/leaders remain cached, so no per-user key is needed.
- README note: audit log covers ADMIN_ACTIONS + admin login/rename/chphone/delete; CSV is UTF-8 BOM with truncation trailer.
