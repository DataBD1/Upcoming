# Finance model (Accountant agent, v2 after reading gtm.md, 25 Oct 2026)

Labels as in assumptions.md: FACT = cited page or repo, ASSUMED = my planning number, UNKNOWN = must be found out. I am not the accountant of record (see last section).

## 0. Inputs (change these, re-run everything)

| Input | Value | Label | Note |
|---|---|---|---|
| BDT per USD | 120 | ASSUMED | Use the rate the bank gives on payment day. |
| Card FX fee on USD bills | 3% | ASSUMED | Check with the bank. |
| Active player (monthly) as share of registered | 60% | ASSUMED | GTM gives weekly active >= 35% as a gate, a different measure. |
| DAU ratio / sessions per DAU per day | 30% / 1.5 | ASSUMED (GTM uses the same) | Unmeasured; drives every sponsor figure. |
| SMS per sign-up / OTP logins per active player per month | 1.3 / 0.3 | ASSUMED | Sessions last 30 days (architecture.md). |
| SMS audience mix | UK 40%, US 30%, UAE 20%, other 10% | ASSUMED | GTM gives no mix. "Other" priced as UAE. |
| Sponsor payment terms | Net 30 | ASSUMED | |
| Founder-hour value | USD 10 (BDT 1,200) | ASSUMED | Placeholder opportunity cost, not a salary. Real value UNKNOWN. |
| Founder cash available | USD 1,000 | UNKNOWN | Placeholder so runway can be shown; replace. |

## 1. Prices (checked 25 Oct 2026)
- Vercel Pro USD 20/month per Developer seat, USD 20 usage credit, 1 TB transfer. FACT. [vercel.com/pricing](https://vercel.com/pricing). Hobby is non-commercial only (assumptions.md, FACT).
- Supabase Pro from USD 25/month, 8 GB disk, USD 10 compute credit, daily backups kept 7 days. FACT. [supabase.com/pricing](https://supabase.com/pricing). Free tier: 500 MB, pauses when idle, no downloadable backups (FACT, assumptions.md).
- Twilio SMS, one segment, as listed (carrier fees and a USD 0.001 failed-message fee can add; FACT as listed): US 0.0083 ([page](https://static0.twilio.com/en-us/sms/pricing/us)), UK 0.056 on one page and 0.0463 on another, I use 0.056 ([en-us](https://www.twilio.com/en-us/sms/pricing/gb), [twilio.com](https://twilio.com/sms/pricing/gb)), UAE 0.1176 ([page](https://www.twilio.com/en-us/sms/pricing/ae)); a third-party table dated 4 Sep 2026 agrees on UK/UAE ([textbee.dev](https://textbee.dev/sms-pricing/twilio)). Twilio is only a price reference; the provider is UNKNOWN. US carrier fees UNKNOWN, I add USD 0.004 (ASSUMED) so US = 0.012.
- Blended rate 0.4x0.056 + 0.3x0.012 + 0.3x0.1176 = USD 0.061 (ASSUMED mix); with a 20% buffer **USD 0.074 per SMS** (ASSUMED). Per sign-up of 1.3 SMS: UK 0.073, US 0.016, UAE 0.153 (before buffer).
- Other lines (ASSUMED): Blob backups USD 1, domain USD 1 (about USD 12/year), monitoring/email USD 0 / 5 / 10 by stage, Supabase compute-upgrade contingency USD 15 at 10,000 (untested against real latency, scaling.md).

## 2. Monthly cost on GTM's stages

GTM stage sizes and weeks are used as given (ASSUMED by GTM). Sign-ups per month are derived from them: stage 1 is 20 in 4 weeks; stage 2 about 240/month (480 over weeks 5-12); stage 3 about 830/month (2,500 over weeks 13-26); stage 4 about 1,170/month (7,000 over weeks 27-52). ASSUMED (derived).

Base case follows GTM: **passwords, OTP off**. Stress case: **OTP on** for every sign-up and login. Pro plans start only with the first paid sponsor, so stages 1-2 run on free tiers.

| USD / month (incl. 3% FX) | Stage 1: 20 | Stage 2: 500 | Stage 3: 3,000 | Stage 4: 10,000 |
|---|---|---|---|---|
| Plan | free tiers | free tiers | Pro + Pro (sponsor live) | Pro + Pro |
| Fixed: Vercel + Supabase + Blob + domain + monitoring | 1.03 | 1.03 | 53.6 (20+25+1+1+5) | 74.2 (…+10 +15) |
| **Total, OTP off (base)** | **1.03** | **1.03** | **53.6** | **74.2** |
| SMS sent, OTP on | 26 | 402 | 1,554 | 3,321 |
| SMS cost at 0.074 (x1.03) | 2.0 | 30.6 | 118.5 | 253.3 |
| **Total, OTP on (stress)** | **3.0** | **31.6** | **172** | **328** |
| Total BDT at 120, OTP off / on | 124 / 360 | 124 / 3,790 | 6,430 / 20,640 | 8,900 / 39,360 |
| Founder time | separate, section 4 | | | |

If a sponsor ever forced Pro at stage 2: USD 48.4 (OTP off) or 79 (OTP on). All VAT/sales tax excluded (UNKNOWN). SMS pumping fraud is UNKNOWN but real; it needs rate limits plus a hard provider cap. If every SMS went to the UAE, the stage 4 OTP-on SMS bill would be USD 402 instead of 253.

## 3. Break-even sponsor revenue

Views are GTM's: 6,750 / 40,500 / 135,000 per 30 days (stages 2-4), matching my 45 views per DAU per month. Per 4 weeks = 28/30 of that. Price per 4 weeks = monthly cost x 12/13 (13 four-week periods a year).

| | Stage 3 (3,000) | Stage 4 (10,000) |
|---|---|---|
| Break-even per 30 days, OTP off / on | USD 53.6 / 172 | USD 74.2 / 328 |
| **Sponsor price per 4 weeks, OTP off** | **USD 49.5 (BDT 5,940)** | **USD 68.5 (BDT 8,220)** |
| **Sponsor price per 4 weeks, OTP on** | **USD 159 (BDT 19,060)** | **USD 303 (BDT 36,320)** |
| **Per 1,000 line views, OTP off / on** | **USD 1.32 / 4.25** | **USD 0.55 / 2.43** |

Benchmark CPMs: about USD 7.19 US and 4.62 UK display, mobile interstitial about 8.50, from a search summary of [businessofapps.com/ads/cpm](https://businessofapps.com/ads/cpm) (page not read in full: ASSUMED, low confidence). Bangladesh/diaspora text-line CPM: UNKNOWN. So with OTP off, break-even is well under the benchmark; with OTP on at stage 3 it is near it. Views are not guaranteed impressions (GTM says so too). Add tax on invoices if applicable (UNKNOWN).

## 4. GTM's six questions

**Q1. Cost per active player per month** (active = 60% of registered, ASSUMED; rate USD 1 = BDT 120):

| Players | Active | OTP off USD (BDT) | OTP on USD (BDT) |
|---|---|---|---|
| 20 | 12 | 0.086 (10.3) | 0.25 (30) |
| 500 | 300 | 0.0034 (0.41) | 0.105 (12.6) |
| 3,000 | 1,800 | 0.030 (3.6) | 0.096 (11.5) |
| 10,000 | 6,000 | 0.012 (1.5) | 0.055 (6.6) |

Labels: price inputs FACT, volumes and ratios ASSUMED. Stages 1-2 are on free tiers; stage 3-4 include Pro.

**Q2. Maximum SMS spend per sign-up** (sign-up codes only; login codes need extra budget). The cap is my proposal, ASSUMED, founder to confirm: monthly SMS cap USD 10 / 30 / 100 / 150 at stages 1-4, divided by sign-ups per month (20 / 240 / 830 / 1,170):

| Stage | Max SMS spend per sign-up | Max SMS at blended 0.074 | Check |
|---|---|---|---|
| 1 | USD 0.50 | 6.8 | fine in any country |
| 2 | USD 0.12 | 1.6 | UK 1.3 codes = 0.073 ok; UAE = 0.153 over |
| 3 | USD 0.12 | 1.6 | same |
| 4 | USD 0.13 | 1.7 | same |

Rule: at most one resend; for UAE numbers one code only, or accept going over the cap, or use OTP for suspect cases only.

**Q3. Break-even sponsor price:** see section 3 (FACT prices, ASSUMED volumes).

**Q4. Runway** with USD 1,000 cash (UNKNOWN, input). Monthly path on GTM's timeline in section 5.
- No sponsor, OTP off: cost about USD 1/month on free tiers, runway effectively unlimited (over 80 months) as long as the free tiers hold (500 MB database limit; when it passes about 400 MB, move to Supabase Pro regardless, then USD 25 more).
- No sponsor, OTP on: cumulative spend reaches USD 1,000 in month 10, so runway about 9.6 months (ASSUMED).
- One sponsor at the break-even price: cash trough about USD 625 (OTP on) or USD 110 (OTP off), then flat, because the sponsor pays each period's cost; runway is open-ended only while that sponsor renews. A cheaper sponsor shortens it.

**Q5. Pro start.** Vercel Pro (Hobby is non-commercial) starts the day a **paid** sponsored line goes live, not when a pilot is merely discussed. On GTM's plan outreach asks begin around week 14 (at 1,000 registered) and the first paid pilot is a guess for stage 3, latest week 26, so earliest Pro start is about month 4-6, ASSUMED. Supabase Pro starts the same day, or earlier if the database passes 400 MB or you need real backups. Pro is billed up front but net-30 sponsor cash arrives about a month later, so hold USD 50 (OTP off) or about USD 210 (OTP on) before the line goes live.

**Q6. One founder-hour:** USD 10 = BDT 1,200 (ASSUMED placeholder, UNKNOWN real value), outside all totals above. Outreach effort, using GTM's funnel and my times (0.5 h per contact, 0.5 h per reply, 1.5 h per meeting, 2 h per signed deal, ASSUMED): stage 3 about 30 hours (40 contacts, 6 replies, 3 meetings, 1 deal) = USD 300; stage 4 about 44 hours = USD 440. That is more than the first break-even sponsor period at stage 3 (OTP off), so the sponsor's value is mostly the infrastructure it unlocks, not profit.

## 5. Six-month cash plan on GTM's timeline

Month = about 4.3 weeks. M1 stage 1; M2-M3 stage 2; M4-M6 stage 3. Registered at month end: 20, 260, 500, 1,333, 2,167, 3,000. USD, incl. FX. Downside = no sponsor, free tiers. Base = first paid sponsor line goes live at the start of M6 (GTM's latest guess), Pro from M6, first cash in M7.

| Month | M1 | M2 | M3 | M4 | M5 | M6 | Total (BDT) |
|---|---|---|---|---|---|---|---|
| Downside, OTP off | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | **6 (740)** |
| SMS sent, OTP on | 26 | 316 | 359 | 1,173 | 1,323 | 1,473 | |
| Downside, OTP on | 3.0 | 25.1 | 28.4 | 90.4 | 101.9 | 113.3 | **362 (43,500)** |
| Base, OTP on: spend | 3.0 | 25.1 | 28.4 | 90.4 | 101.9 | 165.8 | **415 (49,800)** |
| Base, sponsor cash | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Nothing is received in the first six months; sponsor money (at best one pilot) arrives from M7. Months 7-12 add about USD 1,190 of spend in the OTP-on downside (stage 4 growth), so the 12-month OTP-on downside is about USD 1,550 (BDT 186,000). Base-case sponsor revenue is UNKNOWN until a deal exists; I do not enter any.

## 6. Bookkeeping setup (proportionate)

**Chart of accounts:** 1000 Bank/wallet (BDT); 1010 USD card or provider balance; 1100 Sponsor receivable; 1200 SMS prepaid; 2000 Owed to founder (expenses paid personally); 2100 Sales tax/VAT payable (if applicable, UNKNOWN); 3000 Founder capital; 4000 Sponsor revenue; 5000 SMS; 5100 Hosting; 5200 Database; 5300 Domain/monitoring/email; 5900 FX and bank fees; 6000 Other.

**From day one:** every hosting/domain invoice; every SMS top-up and provider statement; every sponsor invoice and payment; founder-paid expenses with the BDT amount and rate; founder hours as a memo. Open a separate bank account or wallet before the first sponsor invoice.

**Receipts:** a PDF per invoice in a folder per month, named `date_vendor_amount`, one row per transaction in a sheet; never delete; retention period UNKNOWN. Screenshot card statements when no invoice exists.

**Monthly close (30 minutes):** invoices filed; bank and SMS balances match the sheet; sponsor invoices issued and chased; actual SMS count and rate vs. this file; DB size and usage vs. free/included limits; founder hours noted; one-line summary to GTM.

## 7. Cross-check with GTM

**Figures I changed**
1. Stage labels and sizes: my "beta ~500 / 3,000 / 10,000" now map to GTM stages 2 / 3 / 4, plus stage 1 (20 players) added.
2. Sign-ups per month: was 500 / 1,000 / 2,000 (my guess); now about 240 / 830 / 1,170 derived from GTM's stage sizes and weeks.
3. OTP: was on in every number; now off in the base case (GTM's plan) and on as a stress case.
4. Plans: Pro was assumed at every stage; now free tiers until the first paid sponsor (GTM, assumptions.md).
5. Break-even: was USD 98 / 194 / 410 per month; now USD 1.0 / 53.6 / 74.2 (OTP off) and 3.0 / 172 / 328 (OTP on), because of items 2 to 4.
6. Six-month plan re-based on GTM's weeks: downside OTP-on USD 362 (was 855); base net no longer includes a sponsor in M3 (was a USD 150 guess).
7. Prices per 4 weeks added; the old per-month and per-30-day figures remain as the basis.

**Unchanged because they agree:** 30% DAU, 1.5 sessions per DAU, views (6,750 / 40,500 / 135,000 per 30 days vs. GTM 6,800 / 40,500 / 135,000), Pro tied to first paid sponsor, no paid ads.

**Still disagree or unanswered**
- OTP: GTM keeps passwords default and OTP for abuse only; architecture.md lists "B9 SMS OTP before public launch" for the same risk. I cost both. The decision is not mine (coordinator/human).
- Country mix of sign-ups: GTM gives none; I keep UK 40 / US 30 / UAE 20 / other 10. UAE-heavy mix doubles SMS cost.
- Active-player definition: I use 60% monthly active; GTM uses weekly active >= 35% as a gate. Unreconciled.
- GTM expects 2-3 sponsors in total, a guess; I model at most one pilot before month 7 and no revenue is booked. Willingness to pay my break-even prices (OTP on USD 159 / 303 per 4 weeks) is UNKNOWN.
- Calendar dates: GTM gives only "week 0"; my months are relative.
- Pilot timing: GTM puts the first paid pilot anywhere in weeks 14-26; I use the latest (week 26) for cash.

## 8. Needs from GTM (still open)
1. Sign-ups per month by country (UK / US / UAE / other), to replace my derived 240 / 830 / 1,170 and the 40/30/20/10 mix.
2. Whether OTP is on at launch, for sign-up only or also login (decision with coordinator), and any weekly sign-up cap.
3. Which "active" ratio to cost against (monthly vs. weekly) and the DAU/views measured at stage 1.
4. Sponsor price range you will quote and payment terms, plus the earliest realistic go-live week of a paid line.
5. Calendar date of week 0.
6. Hours you expect to spend per outreach step, to replace my 0.5 / 0.5 / 1.5 / 2 hours.

## 9. Human professional must check
- Entity: where registered, who owns the Vercel/Supabase/SMS accounts, whether the founder may receive sponsor money.
- Tax: income tax on sponsor revenue; VAT/GST/sales tax on sponsor invoices (which country bills, reverse charge for overseas sponsors); withholding on foreign payments.
- Legal position of the product (lawyer's answer still unrecorded; nothing here assumes it) and sponsored-content labelling rules (GTM lists ASA/FTC/UAE).
- SMS: provider, sender registration (US/UAE), a hard monthly spend cap, fraud limits, consent wording, stored phone numbers.
- Foreign-exchange rules for paying USD bills and receiving USD in Bangladesh.
- Record retention and the final chart of accounts.

## Disputed assumptions
Only the OTP default (section 7); and a mild note that Supabase free has no downloadable backups, so I add a 400 MB database trigger for Pro independent of sponsors.
