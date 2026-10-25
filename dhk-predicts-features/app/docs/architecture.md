# Architecture (Tech lead, 15 Oct 2026)

The product being shipped is **Rival A** (picked 15 Oct). Code lives in `rival-a/` until the GitHub repo exists, then in the repo. The Rival A thread owns app code; the Tech lead owns hosting, data, CI and deploys.

## 1. The system on one page

```
 Phone browser (Android Chrome, PWA)                     Vercel (region bom1, Mumbai)
 ┌──────────────────────────────┐   HTTPS   ┌────────────────────────────────────────────┐
 │ index.html, app.css, app.js  │ ────────▶ │ Static files from public/ (CDN, cached)    │
 │ core.js (same engine as      │           │                                            │
 │   the server: instant quotes)│  /api/*   │ api/index.js  (one Node serverless func)   │
 │ sw.js: offline shell + last  │ ────────▶ │   lib/handler.js  auth + JSON API          │
 │   market data on the phone   │           │   core.js         rules: LMSR, settle, N/A,│
 │ Session token in localStorage│           │                   disputes, audit, events  │
 └──────────────────────────────┘           │   lib/pgstore.js  read() / transact(fn)    │
                                            └──────────────────┬─────────────────────────┘
                                                               │ TLS, connection pooler
                                            ┌──────────────────▼─────────────────────────┐
                                            │ Supabase Postgres (ap-south-1, Mumbai)     │
                                            │  app_state          one jsonb row = the    │
                                            │                     whole game state       │
                                            │  app_state_history  rollback copy ≤10 min  │
                                            │  app_secrets        generated keys         │
                                            └────────────────────────────────────────────┘
```

## 2. Pieces

| Piece | What it does | Why this way |
|---|---|---|
| `public/` front end | Plain JS, no framework, about 20 KB brotli in total. Bangla first, Bangla digits, the phone's own Bangla font. | Cheap Android phones on slow connections are the main audience. |
| `core.js` | All game rules as pure functions over one state object: users, markets, positions, LMSR pricing (b = 800), daily top-up, settlement, N/A refunds, disputes, clawback (A15), feedback, audit log, analytics events. Runs in both browser and server. | One copy of the rules, so the price the phone shows is the price the server charges. |
| `lib/handler.js` | The JSON API: `POST /api/auth` (phone + password, scrypt, rate limit), `POST /api/<write>` for trades and admin actions, `GET /api/<read>` for screens. Admins are E.164 phone numbers in `ADMIN_PHONES`. | Store-agnostic: the same handler runs on the local file store and on Postgres. |
| `lib/pgstore.js` | Loads the state row, locks it (`SELECT … FOR UPDATE`), runs the change on a copy, saves it. A change that throws saves nothing. | Every trade is one transaction, so two server copies can't both spend the same points. Tested with two instances and 100 concurrent trades. |
| `api/index.js` | The Vercel function entry. `vercel.json` rewrites `/api/*` to it. | Vercel scales copies up and down; the lock in the database keeps them consistent. |
| Postgres | Three tables, created by the app on first request. No migrations to run by hand. | Nobody has to open an SQL console. |

## 3. Data model (inside the `app_state` row)

- `site`: name, home city, home timezone (A41: one app-wide timezone, `Asia/Dhaka` until A38 picks the first market; the daily top-up resets at midnight there).
- `users`: id, name, points, shortfall (A15), admin flag, join date, consent records (A21, A31).
- `auth`: phone in E.164 form, e.g. +8801712345678 (A43; Bangladeshi 01XXXXXXXXX input converts to +880; allowed countries are one app-wide list) → salt + scrypt hash + user id. `sessions`: sha256(token) → user id. `attempts`: login rate limits.
- `markets`: question (bn/en), city, timezone, settlement source (A34), LMSR quantities, status (open, closed, settled, N/A, disputed), result evidence.
- `pos`: positions per user per market. Audit log and feedback inbox. Analytics events (A8).

Points are a number in this row and nothing else: there is no code path to buy, transfer or cash them out (decisions A2, risk).

## 4. Security and privacy

- Passwords: scrypt with per-user salt. Session tokens: 24 random bytes, only their sha256 is stored, so a database leak doesn't give working sessions. No SESSION_SECRET is needed.
- Login: 6 failed tries per phone per 15 minutes, counted in the database so it holds across server copies. Phones are not verified in the beta (A9): the admin claims their account right after deploy (setup.md step 4).
- Personal data held: name, phone, password hash, optional email. No NID (A31). Deleting an account removes name, phone and email and keeps past trades anonymous.
- Secrets: the database URL is set by Vercel's Supabase integration; the only other setting is `ADMIN_PHONES`. No `.env` file or `data.json` goes in the repo (.gitignore).
- Unlisted until the lawyer replies: `X-Robots-Tag: noindex` on every response and a disallow-all `robots.txt`.

## 5. Limits and when to change the design

| Limit | Where it bites | Next step |
|---|---|---|
| One state row, rewritten on every trade | **Done** (`lib/pgstore.js`, measured in `docs/scaling.md`): big maps are one row per key, each server copy caches the state and fetches only changed rows, and a write saves only what it touched. At 10,000 players: reads 1 ms, buys 8 ms, 200 requests/s with a slowest p95 of 182 ms. | See the known limits in `docs/scaling.md` (password hashing on the main thread, leaderboard ranking, feedback and audit in the main row). |
| One row lock | Every write queues behind the last one, about 6 ms each, so roughly 150 writes a second. | Lock per market if it ever matters. |
| Supabase free tier | Pauses after 7 days with no traffic; 500 MB. No downloadable backups. | Daily traffic keeps it awake. Nightly export (operations.md) covers backups. Pro ($25/mo) when revenue starts. |
| Vercel Hobby | Non-commercial use only. | Pro ($20/mo) when the first sponsor deal is signed. |
| No SMS OTP | Anyone can sign up with any number. | B9 before public launch (rival-a/README.md has the design). |

## 6. Repository layout (once GitHub is connected)

```
dhaka-predicts/
  core.js  server.js  api/index.js  lib/{handler,pgstore,filestore}.js
  public/  test.js  test-api.js  test-pg.js
  vercel.json  package.json  .gitignore
  .github/workflows/ci.yml        tests on every push and PR
  docs/  architecture.md  operations.md  (copies of these files)
```
