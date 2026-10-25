# Go-to-market plan (GTM agent)

Labels: FACT = in repo or cited page, ASSUMED = my planning number, UNKNOWN = must be found out. Week 0 = the day the first invite goes out; no calendar date is promised. Inputs from assumptions.md: 10,000 registered, 30% DAU at steady state = 3,000 DAU (ASSUMED there).

## 1. Audience and positioning
**Who.** Adults (18+) of Bangladeshi origin in the UK, US and UAE who follow home news, cricket, the taka rate and the weather back home and in their own city, and who already argue about these in family WhatsApp and Facebook groups. Secondary: friends and partners of theirs who read English only.

**Why play a free game.** Being right is the prize: a streak, a weekly league, bragging rights in a group of cousins or a university society. Questions are things they already talk about (taka rate, London/Dubai temperature, cricket) and are settled from a named public source, so arguments end fairly.

**Why Bangla/English and diaspora.** Bangla is in the product (FACT), so older relatives and Bangla-first readers can join the same group as English-first youth. Diaspora groups already exist offline and online; an invite code lets a family or society play together. Size of pool (not verified for reachability): UK about 652,000 people of Bangladeshi ethnicity per 2021 census figures as reported on [Wikipedia](https://en.wikipedia.org/wiki/British_Bangladeshis); US about 300,000 per Census estimates cited by [Pew](https://www.pewresearch.org/internet/fact-sheet/asia/); UAE about 706,000 (2020, Wikipedia, weak source) per [Wikipedia diaspora page](https://en.wikipedia.org/wiki/Bangladeshi_diaspora). Even 0.5% of the UK figure alone is above 3,000 players (ASSUMED reach), so the 10,000 target needs a tiny share, but the share is UNKNOWN until stage 1 data exists. Search found no data on WhatsApp/Facebook use in these communities (UNKNOWN); I assume heavy use from experience, not evidence.

**We will NOT claim:** any money, prizes, rewards, cash-out or "earn"; that it is a betting or investing product; that it is available in Bangladesh during the beta (FACT: refused by IP and +880); that results are advice. Everyone must be 18+. No fake counts, no bought accounts.

## 2. Staged plan
All stage numbers are ASSUMED. Gate = first-20 retention from the existing analytics (FACT it exists; thresholds are mine). D1/D3/D7/D14 = share of a cohort returning on that day.

| | Stage 1: first 20 | Stage 2: ~500 | Stage 3: ~3,000 | Stage 4: ~10,000 |
|---|---|---|---|---|
| Weeks | 0-4 | 5-12 | 13-26 | 27-52 |
| Channels | Founders' own contacts, hand-picked, one by one (not a broadcast) | 5-10 WhatsApp family/friend groups and Facebook groups of diaspora communities where a member vouches; 5 university Bangladeshi societies (UK/US) seeded by one member each; 3-5 small creators (cricket, remittance-tips, Bangla humour) asked to try it, no payment for opinions | Cricket season hooks (match-day questions), taka-rate and weather talk, society-vs-society and city-vs-city weekly league, mosque/community-centre and Eid/Pohela Boishakh events; creators with proven sign-up codes | Everything that worked in stage 3, plus Dubai/UAE work-community groups, press in diaspora media, repeat seasons |
| Feature that drives it | Share card after each settled question; feedback_sent | Invite codes and groups (family or society = one group) | Weekly league, streak, friends leaderboard | Same; plus OTP only if passwords block sign-up (see risks) |
| Gate to move on | 20 players, D1 >= 40%, D7 >= 20%, D14 >= 10%; 5 feedback messages; no data bug | 500 registered, D7 >= 20%, >= 30% of players in a group, >= 0.3 new sign-ups per active player via invites (K, ASSUMED) | 3,000 registered, D7 >= 18%, weekly active >= 35% of registered | 10,000 registered; DAU/registered near 30% |
| If missed, stop | Stop adding players; fix question quality and onboarding, re-run with a new 20 | Stop creators and cold posts; only pursue groups that produced retained players | Stop channels with D7 < 10% or no invites; do not spend on any paid channel | Stop growth, hold at current size, keep quality |

Per-stage notes. Share cards and invite codes already exist (FACT per README). I do not rely on paid ads; none are planned or budgeted here. Retention thresholds are guesses and should be reset after stage 1 gives real numbers.

## 3. Sponsor pipeline
**What a sponsor gets (one labelled line under the question list, no logo wall, no tracking):** one text line plus https link, shown with the "Sponsored" label, under today's question list.
N views per day = DAU x sessions per DAU per day. DAU at stage 2 = 150, stage 3 = 900, stage 4 = 3,000 (30% of registered, ASSUMED). Sessions per DAU = 1.5 (ASSUMED). So roughly 225 / 1,350 / 4,500 line views per day, or about 6,800 / 40,500 / 135,000 per 30 days. Clicks UNKNOWN (we may count them only in aggregate, see ethics). Do not sell these as guaranteed impressions until measured.

**Who plausibly sponsors (categories only, no company has agreed to anything):** remittance and money-transfer services; South Asian grocery and halal food; mobile and international calling/data; education (tutoring, IELTS, university societies' partners); travel to Bangladesh; community events. Check each against the ethical limits first.

**One-page pitch outline:** (1) who plays and where (country mix measured, not guessed); (2) what the line looks like, labelled "Sponsored"; (3) measured numbers: registered, weekly actives, daily line views; (4) fixed price per 4 weeks and what is not included (no personal data, no targeting); (5) our rules and your category exclusions; (6) how to pay, invoice entity and tax (UNKNOWN, human check); (7) contact.

**Outreach cadence and conversion (all ASSUMED):**

| Stage | Start | Contacts | Reply | Meeting | Paid | Result |
|---|---|---|---|---|---|---|
| Stage 2 (revised) | Week 8: build list and draft pitch; first asks week 9 at >= 300 registered, small community-type sponsors, "founding" tier only | 15 | 15% = 2 | 50% = 1 | 33% = 0.3 | ~0.4 expected |
| Stage 3 | Weeks 13-26 | 45 (15 per month) | 15% = 7 | 50% = 3 | 33% = 1 | ~1.1 expected |
| Stage 4 | Weeks 27-52 | 72 (12 per month) | 15% = 11 | 50% = 5 | 33% = 2 | ~1.8 expected |

All conversion rates are ASSUMED (15% x 50% x 33% = 2.5% contact to paid). Only one sponsor line exists, so sponsors run one after another, never in parallel. Revenue is lumpy: about 1.5 sponsors expected by week 26 means roughly a 78% chance of at least one, not a certainty. Time from first contact to signing: 6-10 weeks (ASSUMED). Rule: no ask before 300 registered and a measured D7; the Sponsored line is not shown, and Vercel Pro and Supabase Pro are not started, until the first sponsor has signed. Cadence per prospect: email day 0, follow-up day 7, a different angle day 21, then stop for 90 days. Max 2 follow-ups.

**Ethical limits:** always visible "Sponsored" label (the product has it, FACT); in the UK and US the label wording and placement may need to be "Ad" rather than "Sponsored" (see [Cambridge Network summary of CAP guidance](https://www.cambridgenetwork.co.uk/news/ad-or-spon-simple-guide-rules-influencer-marketing), a secondary source, human to verify); no targeting or segmenting by phone number, location or any personal data, and no sale of player data; no gambling, betting, loan-shark/payday-lender, crypto-speculation, or get-rich sponsors; no sponsor may buy question outcomes, edit questions or get prizes; sponsors never get player lists; admin may refuse any category.

## 4. Risks
- **Bangladesh block (FACT: on during beta).** The home-country audience is excluded, so growth depends wholly on the diaspora pool above. Family group invite codes sent to Bangladesh relatives will fail; tell users so on the invite page. If the block lifts: potentially much larger pool and BDT-priced local gateways, but also the legal position changes (UNKNOWN), moderation load grows, and local sponsors may exist. Do not plan stage 4 on it.
- **Content and moderation.** Cricket, politics and the taka rate attract heated talk. Questions are admin-controlled and groups have names only; keep a written take-down rule and a report route before stage 2. One or two admins is too few at 500 players (the app warns below 2).
- **SMS cost if OTP is turned on.** UK/US/UAE per-SMS prices are UNKNOWN (assumptions.md); international rates are much higher than the BDT 0.25-0.50 Bangladeshi gateway rate. Keep passwords as default; turn OTP on only for password-reset or abuse cases; set a per-sign-up cap from the Accountant. Fake-number pumping abuse is a known SMS risk.
- **PWA with no app store.** Installing from the browser is unfamiliar, especially on iPhone; no store ratings or search. Mitigation: a one-screen "Add to Home Screen" guide in Bangla and English, links that open straight into a group. Install rate UNKNOWN; measure it.
- **Single-channel risk:** one WhatsApp or Facebook group admin banning share links would hurt; spread over 3+ channels.

## 4b. Answers to the Accountant's six items (reply to finance.md section 5)

**1. Sign-ups per month and waves (ASSUMED; stage dates from section 2, 1 month = 4.33 weeks).** Waves: UK first (society and family groups, week 0), US university societies from week 5, UAE worker and community groups from week 13. Mix shifts from UK 50 / US 30 / UAE 10 / other 10 (months 1-3), to 40/30/20/10 (months 4-6), to 35/30/25/10 (months 7-12).

| Month | 1 | 2 | 3 | 4 | 5 | 6 | 7-12 each |
|---|---|---|---|---|---|---|---|
| New sign-ups | 20 | 230 | 250 | 700 | 850 | 950 | 1,170 |
| UK | 10 | 115 | 125 | 280 | 340 | 380 | 410 |
| US | 6 | 69 | 75 | 210 | 255 | 285 | 351 |
| UAE | 2 | 23 | 25 | 140 | 170 | 190 | 293 |
| Other | 2 | 23 | 25 | 70 | 85 | 95 | 117 |
| Registered, month end | 20 | 250 | 500 | 1,200 | 2,050 | 3,000 | 10,020 at month 12 |

This is slower than finance's sample (7,000 by month 6); mine reaches 3,000 at month 6.

**2. Ratios.** DAU / registered: shared planning figure 30% (ASSUMED, assumptions.md). My own belief is 20% (ASSUMED), because a D7 gate of 18-20% implies most registrants are not daily. I use 20% for the revenue test. Monthly active / registered: finance 60%; I believe 40% (ASSUMED). Views per DAU per day: 1.5, agree (ASSUMED; range 1.0-2.0, UNKNOWN until measured). At 20% DAU, line views per 30 days are about 13,500 (1,500 players), 27,000 (3,000) and 90,000 (10,000).

**3. Outreach.** 15 / 15 / 12 contacts per month in stages 2 / 3 / 4, 2.5% contact-to-paid, 6-10 weeks to sign (all ASSUMED; table in section 3).

**4. Pricing.** Flat fee per 4 weeks, not CPM (views are not yet measured and the CPM benchmark is low confidence). Price ladder by registered players, ASSUMED and untested with any sponsor: under 1,000 USD 50; 1,000-2,999 USD 100; 3,000-7,999 USD 200; 8,000+ USD 450. Founding sponsors keep their tier for 3 months. Terms: minimum 3 months, first month prepaid if the sponsor agrees, otherwise Net 30 (agree with finance). VAT/sales tax excluded (UNKNOWN). Implied CPM on 20% DAU views: USD 7.4 at 3,000 and USD 5.0 at 10,000 (USD 450), at or above the low-confidence benchmark of USD 4.6-7.2, so the top tiers may be hard to sell.

**5. OTP.** Not live for login at any stage. Earliest go-live for sign-up-only OTP: week 26, and only after a sponsor has paid at least one invoice. UK and US numbers only; UAE and other sign-ups stay password-only until a cheaper provider is found. Weekly cap on OTP sign-ups: 170 per week while the tier is USD 200 or less, 300 per week at USD 450; sign-ups above the cap wait for the next week. Whether a cap or waiting list exists in the product: UNKNOWN (not in the README), needs a developer.

**6. First possible sponsor payment.** Earliest week 15 (first ask week 9, signed at 6 weeks, first month prepaid); realistic week 19-23 (Net 30); planning date week 20, start of month 5. All UNKNOWN until a sponsor signs. Vercel Pro and Supabase Pro start on signing.

## 4c. Cross-check with Accountant

Cost basis: finance.md formulas (fixed items, USD 0.074 blended SMS, 3% FX), re-run with my sign-ups. OTP-off cost is fixed items only.

| Stage (registered) | Finance cost, full OTP | My plan cost | Expected sponsor fee | Covered? |
|---|---|---|---|---|
| 1-2 (to 500), months 1-3 | USD 98 | about USD 2 on free tiers; about USD 50 once Pro starts (OTP off) | none before about week 19; USD 50 once signed | Yes on free tiers; about break-even after signing |
| 3 (3,000), months 4-6 | USD 194 | about USD 54 before week 26; about USD 95 after (sign-up OTP for UK/US: about 665 sign-ups x 1.3 x USD 0.0445 = USD 38) | USD 100-200, only if a sponsor has signed | Only if signed; before then the founder pays USD 2-54 a month |
| 4 (10,000), months 7-12 | USD 410 | about USD 120 (fixed USD 74 + sign-up SMS USD 44, with FX) | USD 200-450 | Yes |

Result: with finance's full OTP (sign-up and login, all countries) a USD 200 sponsor does not cover stage 3 (USD 194 plus FX) comfortably or stage 4 (USD 410) at all, so I changed the plan to the OTP policy above. No sponsor is guaranteed; the founder funds the gap until the first signing, probably under USD 30 in total before week 19 (ASSUMED).

**Figures I changed in this file:** outreach start moved from "500 registered / week 12" to "300 registered / week 9"; expected sponsors now about 0.4 by week 12, about 1.5 by week 26, about 3.3 by week 52 (was "2-3 in total"); sponsor price ladder added; DAU for the revenue test set to 20%; OTP policy and weekly cap added; sign-up curve added (month 6 = 3,000).

**Where the two files still disagree:**
- DAU 30% (finance) vs 20% (me), monthly active 60% vs 40%.
- Finance's base case has a sponsor signing in month 3 and paying in month 4; I put the realistic first payment at week 19-23 (month 5) and say it may not happen.
- Growth: finance 7,000 registered by month 6, mine 3,000.
- OTP: finance costs sign-up and login OTP for all countries; I allow sign-up-only OTP for UK/US from week 26.
- CPM: finance uses a CPM benchmark of low confidence; I price flat and show CPM only as a sanity check.
- Founding fee USD 50 does not cover finance's USD 98 beta cost, only my OTP-off cost of about USD 50.
- Agreed, not disputed: Vercel Pro from the first signing; Supabase free until the first sponsor (with Blob export).

## 5. Needs from Accountant
1. Cost per active player per month at 20, 500, 3,000 and 10,000 players (USD and BDT, with the rate shown).
2. Maximum SMS spend per sign-up I can afford at each stage, using real UK/US/UAE per-SMS prices.
3. Sponsor price per 4 weeks needed to break even at stages 3 and 4, and the equivalent price per 1,000 line views (my views: about 40,500 and 135,000 per 30 days).
4. Runway in months with no sponsor, and with one sponsor at the break-even price.
5. Month at which Vercel Pro and Supabase Pro costs must start, tied to the first paid sponsor.
6. Cost of one founder-hour as a stated separate line, so outreach time is visible.

## Human must check
- **Legal position:** the lawyer's answer (still unrecorded) on whether this is lawful in each country, 18+ handling, terms of service, and the Bangladesh block.
- **Advertising rules:** UK (ASA/CAP), US (FTC endorsement guidance; [Osborne Clarke note](https://marketinglaw.osborneclarke.com/advertising-regulation/ftc-updates-the-faqs-to-its-endorsement-guides/) is secondary) and UAE rules for a labelled sponsored line, label wording ("Ad" vs "Sponsored"), restricted categories, and sponsor-made claims.
- **Data protection:** UK GDPR, US state laws (e.g. California) and UAE law for phone numbers, passwords and retention analytics; privacy notice, data deletion, cross-border storage on Supabase, and SMS-provider data processing.
- **Tax and billing:** invoicing entity, VAT/GST/sales tax on sponsor invoices, local tax on sponsor income.
- **Creator and society outreach:** whether creator gifts or society partnerships count as advertising that must be disclosed.

## Disputed assumptions
None. I note only that 1.5 sessions per DAU per day and 30% DAU are unmeasured and drive every sponsor figure above.
