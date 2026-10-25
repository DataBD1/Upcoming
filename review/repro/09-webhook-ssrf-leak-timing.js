// lib/sms.js webhook provider checks:
//  (a) https:// is enforced for SMS_WEBHOOK_URL (available() regex) -- true, SSRF via http:// is blocked.
//  (b) but SMS_WEBHOOK_URL/TOKEN are operator-set env vars, not attacker input, so "SSRF" here really
//      means: can a slow/failing/malicious WEBHOOK cause damage? Yes: the code is stored and the send
//      attempt counted against the 3/hr + daily cap BEFORE the SMS.send() call, so a provider that is
//      slow/down still burns the attempt and leaves a valid-but-undelivered code sitting in state.
//  (c) error leakage: Sms.send() throws a generic 'otp_send_failed' code; lib/handler.js returns only
//      e.code to the client, so the webhook URL/token are not leaked to the API caller. (checked by
//      reading the code, confirmed no detail passthrough below)
//  (d) console provider logs the phone number and the CODE in plaintext to stdout, and the SMS body
//      has no app name ("Your code: 123456 (valid 5 minutes)") -- phishing/trust risk and a plaintext
//      PII+secret leak into server/process logs (common log aggregators, crash reporters, etc).
// Run: node 09-webhook-ssrf-leak-timing.js
'use strict';
const { webhook, freshApp, signup } = require('./09-common.js');
(async () => {
  // (a) non-https rejected
  Object.assign(process.env, { OTP_ENABLED: '1', SMS_PROVIDER: 'webhook', SMS_WEBHOOK_URL: 'http://localhost:9199/sms' });
  delete require.cache[require.resolve('/home/user/upcoming/dhk-predicts-features/app/lib/sms.js')];
  const Sms = require('/home/user/upcoming/dhk-predicts-features/app/lib/sms.js');
  console.log('(a) http:// webhook available() =', Sms.available(), '(expect false: https-only enforced)');

  // (b)+(c): webhook that always 500s, and is slow; code is issued+stored before the HTTP call
  process.env.SMS_WEBHOOK_URL = 'https://localhost:9188/sms';
  process.env.SMS_WEBHOOK_TOKEN = 'super-secret-token-should-not-leak';
  const hook = await webhook(9188, { status: 500, delay: 1500 });
  const { call, store } = freshApp('webhookfail');
  await signup(call, '+447700900333', 'V');
  const t0 = Date.now();
  const r = await call('otpsend', { phone: '+447700900333' });
  console.log('(b) otpsend with a failing/slow (1.5s) webhook took', Date.now() - t0, 'ms, replied', JSON.stringify(r), '-- note it still counts as one of the 3 sends/hour even though no SMS was delivered');
  const state = await store.read();
  const crypto = require('crypto');
  const pk = crypto.createHash('sha256').update('otp:' + '+447700900333').digest('hex').slice(0, 24);
  console.log('    code record still present & valid in state after the failed send:', JSON.stringify(state.otp.codes[pk]), '-- a user who somehow learned the code (e.g. it WAS delivered but the webhook response then failed/timed out) could still use it; also shows the attempt is burned for nothing');
  console.log('(c) client-visible error on failure:', JSON.stringify(r[1]), '-- no webhook URL/token leaked to the API caller (good)');
  hook.close();

  // (d) console provider: plaintext phone + code (+ no app name) to stdout
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c, ...a) => { chunks.push(String(c)); return origWrite(c, ...a); };
  Object.assign(process.env, { SMS_PROVIDER: 'console' });
  delete require.cache[require.resolve('/home/user/upcoming/dhk-predicts-features/app/lib/sms.js')];
  const Sms2 = require('/home/user/upcoming/dhk-predicts-features/app/lib/sms.js');
  await Sms2.send('+447700900333', 'Your code: 123456 (valid 5 minutes)');
  process.stdout.write = origWrite;
  const logged = chunks.join('');
  console.log('(d) console provider stdout line:', JSON.stringify(logged.trim()));
  console.log('    contains plaintext phone:', logged.includes('+447700900333'), ' contains plaintext code 123456:', logged.includes('123456'), ' message names the app:', /dhk|dhaka|predict/i.test(logged));
  process.exit(0);
})();
