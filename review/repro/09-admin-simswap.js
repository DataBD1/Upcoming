// SIM-swap / OTP-bypasses-password proof: an admin account can be logged into via OTP alone,
// with no password check at all, and OTP login works even though the account's own PIN auth
// is independently rate-limited. Run: node 09-admin-simswap.js
'use strict';
const { freshApp } = require('./09-common.js');
(async () => {
  Object.assign(process.env, { OTP_ENABLED: '1', SMS_PROVIDER: 'console', ADMIN_PHONES: '+447700900111' });
  const realLog = console.log; console.log = () => {};
  const { call, store } = freshApp('admin');
  const admin = '+447700900111';
  const su = await call('auth', { mode: 'signup', phone: admin, pin: 'correct-horse-pin', name: 'Admin', adult: true, consent: true });
  realLog('admin signup ->', JSON.stringify(su));
  await call('otpsend', { phone: admin });
  const state = await store.read();
  const crypto = require('crypto');
  const pk = crypto.createHash('sha256').update('otp:' + admin).digest('hex').slice(0, 24);
  // read the real code back out of state the way the SMS would have delivered it (we silenced the
  // console log; recover identically to what the attacker's phone would show)
  const rec = state.otp.codes[pk];
  let code = null;
  for (let c = 0; c < 1e6 && !code; c++) { const cs = String(c).padStart(6, '0'); if (crypto.createHash('sha256').update('otpcode:' + admin + ':' + cs).digest('hex') === rec.h) code = cs; }
  const v = await call('otpverify', { phone: admin, code });
  realLog('otpverify with code only (NO password/pin given at all) ->', JSON.stringify(v));
  const home = await call('home', {}, { token: v[1].token });
  realLog('resulting session me.admin =', JSON.stringify(home[1].me && home[1].me.admin));
  realLog('CONCLUSION: whoever controls the admin phone number (e.g. via SIM swap, carrier-store'
    + ' social engineering, or SS7/porting attacks) gets a full admin session with zero knowledge'
    + ' of the admin PIN. OTP login is a complete password bypass for every account, admin included.');
  process.exit(0);
})();
