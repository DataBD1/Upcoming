# Business plan: accountant and GTM, worked in tandem

| File | Owner | What it is |
|---|---|---|
| `assumptions.md` | coordinator | Shared inputs both agents had to use. Every number is FACT, ASSUMED or UNKNOWN. |
| `finance.md` | accountant agent | Monthly costs at about 500 / 3,000 / 10,000 players, break-even sponsor price, 6-month cash plan, bookkeeping setup. Section 7 is the cross-check with GTM. |
| `gtm.md` | GTM agent | Positioning, four stages (20 / 500 / 3,000 / 10,000 players) with gates, sponsor pipeline, risks. Section 4c is the cross-check with the accountant. |

They worked in two passes: each wrote its file from the shared assumptions, then each read the other's file, answered its questions and revised its own numbers.

## Where they ended up (base case: passwords, OTP off)
- Monthly cost, USD: about 1 at 500 players, 54 at 3,000, 74 at 10,000. With OTP on for every sign-up and login: 32, 172, 328.
- Break-even sponsor price per 4 weeks: USD 49.5 at 3,000 players and 68.5 at 10,000 (OTP off); 159 and 303 (OTP on).
- Founder funding for 6 months with no sponsor: about USD 6 (OTP off) or 362 (OTP on). Both agents book no sponsor revenue, because "2 to 3 sponsors" is a guess.
- GTM's growth is slower than the accountant first assumed: 3,000 registered players at month 6, sponsor outreach from week 9, flat sponsor fees from USD 50 to 450 per 4 weeks, OTP only at UK/US sign-up and only after a paid sponsor.

## Open decisions (the agents could not settle these; they are the owner's)
1. **OTP at launch.** GTM keeps passwords; `docs/architecture.md` says OTP before public launch. Biggest cost lever: it moves 10,000-player cost from about USD 74 to 328 a month. A weekly sign-up cap does not exist in the product yet.
2. **Daily-active share.** GTM 20%, accountant 30%. Neither is measured; take it from stage 1 data (D1/D3/D7/D14).
3. **First sponsor payment.** GTM: week 19 to 23, and it may never happen. Accountant: month 4. Sets when Vercel Pro and Supabase Pro must start.
4. **Calendar date of week 0**, sign-up mix by country, and which "active" measure to cost against (monthly 60% vs weekly 35% or more).

## What a qualified human must check (both agents say so)
Legal position of the product, entity and tax treatment of sponsor income including VAT or sales tax, advertising rules for a sponsored line in UK, US and UAE, data protection for diaspora players, and a hard spend cap on the SMS account before OTP goes on.

## Weak spots in the sources
CPM benchmarks and the UK SMS price come from search summaries and secondary pages, not full reads. No data was found on WhatsApp or Facebook use in these communities. Gate thresholds in `gtm.md` are the agent's own and should be reset after the first 20 players. Both files are about twice the length first asked for.
