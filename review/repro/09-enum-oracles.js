// Account enumeration through otpsend: (1) TIMING with a slow provider, (2) slow_down oracle, (3) send_failed oracle.
// Run: node 09-enum-oracles.js
'use strict';
const { webhook, freshApp, signup } = require('./09-common.js');
(async () => {
  const hook = await webhook(9109, { delay: 400 });
  Object.assign(process.env, { OTP_ENABLED: '1', SMS_PROVIDER: 'webhook', SMS_WEBHOOK_URL: 'https://localhost:9109/sms', SMS_WEBHOOK_TOKEN: 't0ken' });
  const { call } = freshApp('enum');
  await signup(call, '+447700900111', 'Known');
  const time = async ph => { const t = process.hrtime.bigint(); const r = await call('otpsend', { phone: ph }, { ip: '1.1.1.' + Math.floor(Math.random() * 250) }); return [Number(process.hrtime.bigint() - t) / 1e6, r]; };
  // (1) timing, 5 fresh IPs each, known number limited to 3 sends/hr so rotate: use 3 samples known, 3 unknown
  const k = [], u = [];
  for (let i = 0; i < 3; i++) { k.push((await time('+447700900111'))[0]); u.push((await time('+4477009002' + String(i).padStart(2, '0')))[0]); }
  console.log('known   ms:', k.map(x => x.toFixed(0)).join(', '));
  console.log('unknown ms:', u.map(x => x.toFixed(0)).join(', '));
  console.log('TIMING ORACLE', Math.min(...k) > Math.max(...u) * 10 ? 'CONFIRMED: known >> unknown' : 'not shown');
  console.log('SMS actually sent by gateway:', hook.got.length, '(all to the known number)');
  // (2) slow_down oracle: the 4th request inside an hour. Known => 400 slow_down. Unknown => 200 forever.
  const outK = [], outU = [];
  for (let i = 0; i < 5; i++) { outK.push(JSON.stringify(await call('otpsend', { phone: '+447700900111' }, { ip: '2.2.2.' + i }))); outU.push(JSON.stringify(await call('otpsend', { phone: '+447700900999' }, { ip: '2.2.3.' + i }))); }
  console.log('known   replies:', outK.join(' '));
  console.log('unknown replies:', outU.join(' '));
  console.log('SLOW_DOWN ORACLE', outK.some(x => x.includes('slow_down')) && outU.every(x => x.includes('"ok":true')) ? 'CONFIRMED (no timing needed)' : 'not shown');
  // (3) provider failing: known number gets otp_send_failed, unknown gets ok
  hook.close();
  const { call: c2 } = freshApp('enum2');
  await signup(c2, '+447700900111', 'Known');
  console.log('provider down, known  :', JSON.stringify(await c2('otpsend', { phone: '+447700900111' }, { ip: '9.9.9.1' })));
  console.log('provider down, unknown:', JSON.stringify(await c2('otpsend', { phone: '+447700900888' }, { ip: '9.9.9.2' })));
  process.exit(0);
})();
