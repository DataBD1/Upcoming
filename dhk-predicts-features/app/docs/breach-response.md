# Breach response (Tech lead, 15 Oct 2026)

What happens if personal data may have leaked. Referenced by the privacy notice (risk/privacy-and-terms-draft.md, "Security"). Legal deadlines and the authority depend on the first market (A38) and the lawyer: marked **[market]**.

## What we hold, and what a leak would expose
| Data | Stored as | If leaked |
|---|---|---|
| Name, phone (E.164), optional email | Plain text in the state row | Identifies the person: reportable |
| Password | scrypt hash with per-user salt | Slow to crack; tell users to change reused passwords |
| Session tokens | sha256 only | Not usable from a leak |
| Trades, points | Plain text | Low harm; points have no cash value |
| Backups | Same data in `app_state_history` and private Vercel Blob | Same as above |

## Who can reach it
SK (owner of GitHub, Vercel, Supabase). Agents: code only, no database or dashboard access during the beta. Admins in the app: user names and feedback, not phone numbers in bulk.

## Steps
1. **Spot it** (feedback, a leaked file, a provider's alert, odd admin actions in the audit log). Whoever sees it tells SK in the project at once and writes down the time.
2. **Contain** within the hour: SK rotates the Supabase database password in Vercel → Storage (this resets `POSTGRES_URL`), removes any unknown Vercel/GitHub members, and redeploys. If an admin account is involved, remove that number from `ADMIN_PHONES` and redeploy. Agents can clear all sessions with one admin action or a new deploy that empties `sessions`.
3. **Assess** the same day: what data, how many users, since when, still exposed or not. The Tech lead writes this up from logs and the audit log.
4. **Report**: SK decides, with the lawyer, whether to notify the data authority **[market: authority, deadline e.g. 72 h]** and affected users **[market]**. Agents draft both messages (plain language: what happened, what data, what we did, what the user should do).
5. **Fix and record**: root cause, fix shipped through the normal release flow (operations.md), and an entry in risk/risk-register.md.

## Prevention already in place
Hashed passwords and tokens, login rate limit, no NID collected (A31), account deletion removes name/phone/email, no `.env` or data files in the repo, the site is unlisted during the beta, every admin action is in the audit log, and the backups are private.
