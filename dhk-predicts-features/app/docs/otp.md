# Phone OTP (SMS-code login)

Off by default. It signs in an EXISTING account with a 6-digit code; sign-up still uses a password. Fold this into the "Phone OTP" section of the app README.

## Turning it on
| Env | Meaning |
|---|---|
| `OTP_ENABLED=1` | master switch |
| `SMS_PROVIDER=webhook`, `SMS_WEBHOOK_URL` (https), `SMS_WEBHOOK_TOKEN` | real sending. `console` prints to the log (masked number) and is refused in production |
| `OTP_DAILY_CAP` | hard cap on SMS per day. In production OTP stays OFF until this is set explicitly (also set the same cap on the SMS provider account) |
| `OTP_SECRET` | HMAC key for stored codes and rate-limit keys. Required in production; any long random string. Changing it invalidates pending codes |
| `OTP_COUNTRIES` | calling codes that may receive a code, default `44,1,971,880` (UK, US, UAE, BD) |
| `OTP_COUNTRY_CAPS` | sends per country per rolling 24h, e.g. `44:40,1:60`. Defaults: BD 150, US 60, UK 40, UAE 20 |
| `TRUST_PROXY=1` | see Client IP |

## Rules
- Never for admin accounts (ADMIN_PHONES or a user flagged admin): no code is sent, `otpverify` never signs in. A SIM swap must not give admin access.
- Code valid 5 minutes, 5 tries. Sending a new code replaces the old one but keeps the failed tries.
- Per hour: 3 sends and 10 verify attempts per number; 10 sends and 30 verify attempts per IP. Plus the global and per-country daily budgets above.
- `otpsend` always answers `200 {ok:true}` at once (unknown number, admin, rate-limited, country not allowed, provider down) and sends the SMS after replying (`waitUntil` on Vercel). Provider errors are logged server-side with the number masked. A failed send deletes its code and refunds the daily budget.
- SMS text: "DHK Predicts: your code is NNNNNN. It expires in 5 minutes. Do not share it with anyone." (plain ASCII, one segment).
- State: top-level maps `otpcodes` and `otpsends` (HMAC-hashed keys, no plain numbers) and `otp {day, n}`; expired entries pruned on each use; more than 20,000 keys stops new sends.

## Client IP (rate limits)
On Vercel: `x-real-ip` (or `x-vercel-forwarded-for`). Anywhere else: the socket address; `X-Forwarded-For` is IGNORED because the client controls it. Behind exactly one trusted reverse proxy set `TRUST_PROXY=1` and the right-most hop is used.
