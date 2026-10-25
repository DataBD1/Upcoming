# fix-02 size budget

| ID | Result | Note / test |
|---|---|---|
| F1 q11 measured | FIXED | `quality` in config, default 5, q11 printed for reference. test: "quality is configurable and q11 is reported" |
| F2 social.js counted | FIXED | removed from app/size-budget.json (not served). |
| F3 total wrong / SW precache | FIXED | per-file budgets for all 8 served files; groups "critical path" (html+css+app+core, 47.0 KB) and "first visit" (adds share.js, sw.js, icon, manifest, 53.7 KB). `excludeFromTotal` removed. File list is still hand-maintained, not derived from sw.js (DEFERRED: low value). README "38 KB" not found, nothing to fix. |
| F4 headroom | FIXED | budgets = q5 size +5%, rounded up. The CI diff against main idea is DEFERRED. |
| F5 malformed config | FIXED | strict validate(); test: the `bad` table (20 cases) |
| F6 stack traces / rc | FIXED | exit 0/1/2, one-line errors. test: CLI cases |
| F7 double count | FIXED | resolved-path duplicate is a config error. test "same file twice" |
| F8 fragile paths | WON'T FIX | relative script path kept (works from app/); README documents config-relative paths. |

Tests: `node size-budget/test.js` (now also in app `npm test`, before `npm run check`). Before-fix: new test.js fails on old index.js (AssertionError); after: passes.
Optional: `size-budget/measure-wire.js` (Playwright, not in npm test). Measured on page requests with server.js (q11): html 0.77 + css 2.6 + core 15.0 + app 26.1 = 44.4 KB, /api/home 5.1 KB. CDP on the page does not see SW fetches, so share.js/icon/manifest precache is not in that figure. Server compresses at q11, so a CDN sends more (about 47 KB critical path at q5).
Coordinator: package.json "test" script gained `node ../../size-budget/test.js` before `npm run check`; merge carefully. If the app grows, budgets in app/size-budget.json must be raised on purpose.
