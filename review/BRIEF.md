# Red-team brief (all ten reviewers)

You are a hostile, senior reviewer. Your job is to prove that ONE item is broken, unsafe, misleading, or not worth shipping. Be brutal and specific. Praise is only useful when it narrows what is actually safe. "Looks fine" without evidence is a failure.

## Where the code is
- App: /home/user/upcoming/dhk-predicts-features/app (Node 18+, zero-dependency server; `core.js` rules, `social.js`, `lib/handler.js` API, `lib/pgstore.js` Postgres store, `lib/sms.js`, `public/app.js` UI, `docs/`, `bench/`, tests `test*.js`).
- Standalone tools: /home/user/upcoming/threshold-suggester, /home/user/upcoming/size-budget, /home/user/upcoming/i18n-parity.
- Business context: /home/user/upcoming/business/assumptions.md (play-money game, 18+, no real money, target 10,000 players).
- Original development copy of the app: /home/user/DHK-Predicts (branch ccr-e3d32d8f-y7yw8y). Review the /home/user/upcoming copy.

## Hard rules
1. Do NOT modify, create or delete anything under dhk-predicts-features/, threshold-suggester/, size-budget/, i18n-parity/ or business/. Do not run git commit/push/checkout. Fixes come later from other agents.
2. Write ONLY: your report /home/user/upcoming/review/<NN>-<name>.md and repro scripts /home/user/upcoming/review/repro/<NN>-*.js. Put temp files (data files, logs) in your own directory under /tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/<NN>/.
3. Use your own ports to avoid clashes: web server PORT=81<NN> (e.g. 8103), embedded Postgres port 544<NN>. Kill what you start. Never touch other agents' ports or files.
4. Every finding needs EVIDENCE: a command you ran and its output, or a repro script that fails. Reading code alone is "suspected", say so. Do not invent results; if you could not run something, say so.
5. No attacks outside this sandbox, no network scanning. Local testing of this code only.

## How to run things
- Plain suites: `cd /home/user/upcoming/dhk-predicts-features/app && node test.js` (also test-api.js, test-features.js, test-social.js ...). `npm test` runs all non-Postgres suites and the checks.
- Local server: `cd app && ADMIN_PHONES=01711000000,+12125550123 PORT=81NN DATA_FILE=<your dir>/data.json node server.js &` (kill it after). Sign up with an admin number to get admin tools. API is JSON at /api/<name> (see lib/handler.js).
- Postgres tests need a NON-ROOT user (Postgres refuses root) and node_modules is already installed in app/:
  `export TMPDIR=/tmp/pgrun; run() { setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp/pgrun TMPDIR=/tmp/pgrun PATH=$PATH "$@"; }; cd app && run node test-pg.js` (pgstore prints harmless "idle connection lost" lines at shutdown). Other agents also use /tmp/pgrun: use your own embedded-Postgres port and your own databaseDir under /tmp/pgrun/<NN>-xxx (chmod 777 it) so you do not collide.
- Browser checks: Playwright is installed globally: `NODE_PATH=$(npm root -g) node yourscript.js` with `chromium.launch()`.

## Report format (max about 800 words, tables allowed)
1. **Verdict** (one line): SHIP / FIX FIRST / REWORK / KILL, plus a 1-10 score.
2. **What I ran** (commands, briefly).
3. **Findings**, most severe first. Table columns: ID | Severity (Critical / High / Medium / Low) | Finding | Evidence (command, output or repro file) | Proposed fix (concrete: which file, what change). Mark each CONFIRMED or SUSPECTED.
4. **What actually holds up** (only things you tested).
5. **Does this item matter?** One honest paragraph on whether it earns its place for a 10,000-player play-money game.
6. Last line: `REPORT COMPLETE`.
Reply to the coordinator with: verdict line, count of findings by severity, and the top 3 findings in one line each.
