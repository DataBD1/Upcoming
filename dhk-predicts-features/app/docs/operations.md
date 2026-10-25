# Deploy and operations (Tech lead, 15 Oct 2026)

How the app gets from code to users, and what to do when something breaks. Agents run all of this; SK's part is marked **SK**.

## 1. Environments

| | Where | Data | Who uses it |
|---|---|---|---|
| Local | `node server.js` | `data.json` file | Agents while building |
| Preview | Vercel's own URL for each pull request | Same database as production for the beta (one project, one row key) | Agents check a change before merging |
| Production | `dhaka-predicts.vercel.app`, a domain later | Supabase Postgres, Mumbai | Beta users |

Previews share the production database during the beta because the free plan allows one Supabase project. Rule until that changes: previews are for looking, not for trading or admin actions. When Pro starts, give previews their own database.

## 2. Release flow

1. The Rival A thread (app code) or the Tech lead (infra) pushes a branch and opens a pull request.
2. CI runs `npm test`: engine tests, API tests, and the Postgres test (two server copies, concurrent trades, restore drill).
3. Vercel builds a preview of the branch. An agent opens it and checks the changed screens on a phone-sized browser.
4. Merge to `main`. Vercel deploys production on its own; no deploy token exists anywhere.
5. The agent that merged opens production and checks the home screen, a trade and the admin page load.

Rules: never merge on red CI; never skip a test to get green; one change per pull request so a rollback is one click.

## 3. Rollback

- **Bad code**: in Vercel → Deployments, pick the last good one → Promote to Production. Takes seconds and doesn't touch data. Then revert the pull request in GitHub. (Needs the Vercel dashboard, so **SK** clicks it until agents can reach Vercel; the agent says exactly which deployment.)
- **Bad data** (wrong settlement, corrupted state): restore from `app_state_history`, which keeps a copy at most every 10 minutes (the database takes it itself, after the trade that made it due, never inside a request; if copies get slow the gap grows, up to an hour). Copies hold the whole state (main row and shards together) in the old single-blob shape; after a restore the next write re-shards it, so the steps below are unchanged:
  ```sql
  update app_state s set data = h.data, version = s.version + 1, updated_at = now()
  from (select data from app_state_history where key = 'rival-a'
        and saved_at <= '<time before the problem>' order by saved_at desc limit 1) h
  where s.key = 'rival-a';
  ```
  The `version = s.version + 1` matters: server copies keep the state in memory and notice a change by its version (and reload fully about every 10 minutes regardless), so a manual edit that leaves the version alone can take up to 10 minutes to show. Because the restored row is a single blob, the first write after it re-creates every shard row under a new epoch; server copies that were idle through the restore see the new epoch (or a version that went down) and reload everything, so they do not keep removed players. Do the restore, then make one harmless write (any feedback or an admin note) and check `/api/home` before announcing it. Tested against Postgres 18 (`test-pgstore.js`, "F8"). Trades after that copy are lost, so prefer a correcting admin action (re-settle, clawback) when the problem is one market.

## 4. Backups

- In the database: rollback copies as above. They are pruned automatically after each new copy: the newest 48 are kept, plus the last copy of each day for 30 days (about 80 copies at most; each is the whole state, 0.7 MB at 10,000 light players, so about 60 MB).
- Outside the database: `api/backup.js`, a Vercel cron at 21:30 UTC (03:30 Dhaka), writes the whole state (main row plus `app_shards`, read in one snapshot) to a private Vercel Blob as `backups/YYYY-MM-DD.json` and keeps 30 days. It looks for today's file in Blob first, so a repeat call does not read the database. **In production it refuses to run (503) unless `CRON_SECRET` is set** (Vercel sends it on cron calls; set any long random string in the project's environment variables). Restore = load that file's `data` into `app_state` for key `rival-a` with `version = version + 1`, as in section 3.
- Restore drill: once before the beta (Risk condition for A18), then monthly.

## 5. Monitoring

| What | How | Who looks |
|---|---|---|
| Is it up | A scheduled agent loads `/` and `/api/home` | Ops routine; posts in the project only on failure |
| Errors | Vercel function logs (server errors are logged by `handler.js`) | Agent reads them when a user reports a problem |
| Usage | A8 analytics events in the state, summarised weekly | Growth report |
| Database size | `select pg_column_size(data) from app_state` and `select count(*) from app_shards` | Monthly; the main row should stay small (about 1 KB per market, no matter how many holders; `feedback` and `audit` add up to about 1 MB at their caps). Shard `audit`/`feedback` when it passes about 1 MB |
| Database errors | Vercel function logs: `api error in <action>: <SQLSTATE> <message>` (no secrets). The API answers 503 when a retry may work (lost connection, timeout, too many writes queued) and 500 otherwise, never 400 | Agent reads them when users report "setting up, back soon" |

Until agents can reach Vercel and Supabase from the cloud (network allowlist, S5), uptime checks run from the user side only. Add `*.vercel.app` and the Supabase host to the allowlist at S5 so checks and restores need no help from SK.

## 6. Incidents

1. Someone reports a problem (feedback inbox, WhatsApp group, or a check fails).
2. The agent on ops posts one line in the project: what is broken and since when.
3. Fix forward if it's small; otherwise roll back code (section 3) and fix after.
4. Wrong points or settlements: pause the market (admin close), fix with re-settle or clawback, post a notice to affected players (A15 does this automatically).
5. Personal-data leak: follow the breach note in risk/ (A31): tell SK at once; SK decides on notifying users and the regulator.

## 7. Accounts and access

| Account | Owner | Agents' access |
|---|---|---|
| GitHub repo `dhaka-predicts` (private) | **SK** | Push via the Claude GitHub connection |
| Vercel project | **SK** | None (deploys happen through GitHub) |
| Supabase project | **SK**, created through Vercel | None until the S5 allowlist |
| `ADMIN_PHONES` | **SK** sets on Vercel | Read by the app only |
| `ADMIN_SETUP_CODE` | **SK** sets on Vercel (required in production when `ADMIN_PHONES` is set) | Long random secret. A team member enters it in the "Admin setup code" box at sign-up or login to get admin rights; without it a listed number is a normal player |

Every account stays in SK's name. Agents never hold passwords. Losing the GitHub connection stops deploys but not the running site.
