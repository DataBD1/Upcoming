// SMS pumping / toll fraud: sign-up has no verification, so an attacker registers accounts with
// numbers THEY own (premium-rate/revenue-share), then pulls OTPs. Shows (a) what the daily cap
// protects, (b) real cost at UK/US/UAE rates from business/finance.md, (c) that x-forwarded-for
// is attacker-controlled locally / in any non-Vercel deployment, trivially defeating the 10/hr IP
// cap (and that the per-NUMBER cap of 3/hr is the only real limiter, which an attacker owns).
// Run: node 09-pumping-cost-and-ipcap.js
'use strict';
const { freshApp, signup } = require('./09-common.js');
(async () => {
  Object.assign(process.env, { OTP_ENABLED: '1', SMS_PROVIDER: 'console', OTP_DAILY_CAP: '200' });
  const realLog = console.log; console.log = () => {};
  const { call } = freshApp('pump');

  // Register N attacker-owned numbers (no verification gate on sign-up at all).
  const N = 40;
  for (let i = 0; i < N; i++) await signup(call, '+9715' + String(1000000 + i).padStart(8, '0'), 'A' + i);
  realLog('signed up', N, 'attacker-controlled UAE numbers, zero verification required at signup.');

  // Each number can pull 3 OTPs/hour = up to 72/day per number regardless of IP (the attacker owns
  // the numbers, so the per-IP cap buys nothing here); hit the global daily cap from many IPs.
  let ok = 0, blocked = 0;
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < N; i++) {
      const ip = '10.0.' + round + '.' + i; // fresh IP every round -> per-IP cap (10/hr) never engages
      const r = await call('otpsend', { phone: '+9715' + String(1000000 + i).padStart(8, '0') }, { ip });
      if (r[0] === 200) ok++; else blocked++;
    }
  }
  realLog('otpsend attempts:', N * 6, ' succeeded (SMS actually sent):', ok, ' blocked:', blocked, '(blocked once the per-NUMBER 3/hr limit bites, NOT the per-IP limit -- IPs were never reused)');

  // Real-world scale: finance.md's OTP_DAILY_CAP default is 200/day. At the per-number cap of
  // 3/hr * 24h = 72/day, as few as ceil(200/72)=3 attacker numbers exhaust the whole day's cap
  // for EVERY legitimate user, and cost money doing it.
  const perNumberPerDay = 3 * 24;
  const cap = 200;
  realLog('OTP_DAILY_CAP=200 is exhausted by just', Math.ceil(cap / perNumberPerDay), 'attacker-owned numbers alone (', perNumberPerDay, 'sends/day/number) -- this is also a trivial DoS on legitimate OTP logins.');

  // Cost at business/finance.md's quoted Twilio rates: UK 0.056, US 0.012 (incl. assumed carrier
  // fee), UAE 0.1176 USD/SMS (business/finance.md lines 22-23).
  const rates = { UK: 0.056, US: 0.012, UAE: 0.1176 };
  for (const [region, rate] of Object.entries(rates)) {
    const dailyCost = cap * rate; // attacker alone can drive the FULL daily cap to a chosen country
    realLog(region + ': attacker-driven full-cap day = $' + dailyCost.toFixed(2) + '/day, $' + (dailyCost * 30).toFixed(2) + '/30days, all to numbers the attacker owns and is paid on (revenue share) if premium-rate.');
  }
  realLog('NOTE: OTP_DAILY_CAP counts ALL sends app-wide; it does not separate sign-up vs login, nor'
    + ' per-number cost. A single attacker can monopolize it and simultaneously bill the operator at'
    + ' the most expensive region by picking UAE numbers (business/finance.md: "If every SMS went to'
    + ' the UAE, the stage 4 OTP-on SMS bill would be USD 402 instead of 253" -- same mechanism, attacker-triggered).');
  process.exit(0);
})();
