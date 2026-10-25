// Regression tests for the phone-OTP review (fix-09). Run: node test-otp.js
'use strict';
const assert = require('assert'), os = require('os'), path = require('path');
const Core = require('./core.js'), H = require('./lib/handler.js'), Sms = require('./lib/sms.js');
const { createFileStore } = require('./lib/filestore.js');
const ADMIN = '+447700900111', USER = '+447700900222';
Object.assign(process.env, { OTP_ENABLED: '1', SMS_PROVIDER: 'console', ADMIN_PHONES: ADMIN });
delete process.env.NODE_ENV; delete process.env.VERCEL_ENV; delete process.env.VERCEL;

let n = 0;
const sent = [];
Sms.send = async (to, text) => { sent.push({ to, text }); if (Sms.fail) throw Object.assign(new Error('x'), { code: 'otp_send_failed' }); if (Sms.delay) await new Promise(r => setTimeout(r, Sms.delay)); };
const realErr = console.error; console.error = () => {};
function fresh() {
  const store = createFileStore({ file: path.join(os.tmpdir(), 'otp-test-' + process.pid + '-' + (n++) + '.json'), seed: () => Core.seed(Date.now()) });
  const call = (name, body, o = {}) => H.handleApi(store, { method: 'POST', name, body, token: o.token, ip: o.ip || '1.1.1.1', country: null });
  return { store, call };
}
const signup = (call, phone) => call('auth', { mode: 'signup', phone, pin: 'secret12', name: 'P', adult: true, consent: true });
const codeOf = () => /your code is (\d{6})/.exec(sent[sent.length - 1].text)[1];
const GENERIC = JSON.stringify([200, { ok: true }]);
const t = [];
const test = (name, fn) => t.push([name, fn]);

test('admin accounts cannot log in with OTP (SIM swap), no code is sent', async () => {
  const { call } = fresh(); sent.length = 0;
  const su = await signup(call, ADMIN); assert.equal(su[0], 200);
  assert.equal(JSON.stringify(await call('otpsend', { phone: ADMIN })), GENERIC);
  await H.otpIdle(); assert.equal(sent.length, 0, 'no SMS to an admin');
  const v = await call('otpverify', { phone: ADMIN, code: '000000' });
  assert.deepStrictEqual(v, [400, { error: 'bad_otp' }]);
});
test('a user flagged admin in state is also refused, even with a valid code', async () => {
  const { call, store } = fresh(); sent.length = 0;
  await signup(call, USER);
  await call('otpsend', { phone: USER }); await H.otpIdle(); const c = codeOf();
  await store.transact(s => { for (const u of Object.values(s.users)) u.admin = true; });
  const v = await call('otpverify', { phone: USER, code: c });
  assert.equal(v[0], 400); assert(!v[1].token);
});
test('normal user logs in; code is single-use; message names the app and says do not share', async () => {
  const { call } = fresh(); sent.length = 0;
  await signup(call, USER);
  assert.equal(JSON.stringify(await call('otpsend', { phone: USER })), GENERIC); await H.otpIdle();
  assert(/DHK Predicts/.test(sent[0].text) && /not share/i.test(sent[0].text) && /5 minutes/.test(sent[0].text), sent[0].text);
  const c = codeOf(), v = await call('otpverify', { phone: USER, code: c });
  assert.equal(v[0], 200); assert(v[1].token);
  assert.equal((await call('otpverify', { phone: USER, code: c }))[0], 400);
});
test('unknown, admin, rate-limited and provider-failure replies are identical, and instant', async () => {
  const { call } = fresh(); sent.length = 0;
  await signup(call, USER); await signup(call, ADMIN);
  Sms.delay = 400; Sms.fail = true;
  const out = [], ms = [];
  for (const [ph, ip] of [[USER, '2.0.0.1'], ['+447700900999', '2.0.0.2'], [ADMIN, '2.0.0.3']]) {
    const t0 = Date.now(); out.push(JSON.stringify(await call('otpsend', { phone: ph }, { ip }))); ms.push(Date.now() - t0);
  }
  for (let i = 0; i < 6; i++) { // rate limited by number (known and unknown)
    out.push(JSON.stringify(await call('otpsend', { phone: USER }, { ip: '3.0.0.' + i })));
    out.push(JSON.stringify(await call('otpsend', { phone: '+447700900998' }, { ip: '3.1.0.' + i })));
  }
  Sms.delay = 0; Sms.fail = false; await H.otpIdle();
  assert(out.every(x => x === GENERIC), out.join('\n'));
  assert(Math.max(...ms) < 200, 'reply must not wait for the provider: ' + ms);
});
test('a failed send leaves no usable code', async () => {
  const { call, store } = fresh(); await signup(call, USER);
  Sms.fail = true; await call('otpsend', { phone: USER }); await H.otpIdle(); Sms.fail = false;
  const s = await store.read(); assert.deepStrictEqual(s.otpcodes, {}); assert.equal(s.otp.n, 0);
});
test('tries do not reset on re-send; hourly verify cap per number', async () => {
  const { call } = fresh(); sent.length = 0; await signup(call, USER);
  const wrong = c => c === '000000' ? '000001' : '000000';
  await call('otpsend', { phone: USER }); await H.otpIdle(); let c = codeOf();
  for (let i = 0; i < 5; i++) assert.equal((await call('otpverify', { phone: USER, code: wrong(c) }, { ip: '4.0.0.' + i }))[1].error, 'bad_otp');
  await call('otpsend', { phone: USER }); await H.otpIdle(); c = codeOf(); // resend: new code, but tries stay used up
  assert.equal((await call('otpverify', { phone: USER, code: c }, { ip: '4.0.1.1' }))[1].error, 'bad_otp', 'correct new code refused: tries were reset');
  let slow = false;
  for (let i = 0; i < 12; i++) if ((await call('otpverify', { phone: USER, code: '123456' }, { ip: '4.1.0.' + i }))[1].error === 'slow_down') slow = true;
  assert(slow, '10/hour/number cap');
});
test('verify attempts are capped per IP (30/hour) across numbers', async () => {
  const { call } = fresh(); let slow = 0;
  for (let i = 0; i < 40; i++) if ((await call('otpverify', { phone: '+4477009' + String(10000 + i).slice(1), code: '1' }, { ip: '5.5.5.5' }))[1].error === 'slow_down') slow++;
  assert(slow >= 8, 'ip cap engaged: ' + slow);
});
test('codes are HMACed with a server secret, not bare sha256; state uses top-level maps', async () => {
  const { call, store } = fresh(); sent.length = 0; await signup(call, USER);
  await call('otpsend', { phone: USER }); await H.otpIdle(); const c = codeOf(), s = await store.read();
  const sha = require('crypto').createHash('sha256').update('otpcode:' + USER + ':' + c).digest('hex');
  const rec = Object.values(s.otpcodes)[0];
  assert(rec && rec.h !== sha && Object.keys(s.otp).sort().join() === 'day,n' && !s.otp.codes);
  assert(!JSON.stringify(s.otpcodes).includes(USER) && !JSON.stringify(s.otpsends).includes(USER), 'no plain phone in otp state');
  process.env.OTP_SECRET = 'another-secret'; // different secret: the old code no longer verifies
  assert.equal((await call('otpverify', { phone: USER, code: c }))[0], 400); delete process.env.OTP_SECRET;
});
test('only OTP_COUNTRIES get codes; per-country and global daily caps hold', async () => {
  const { call } = fresh(); sent.length = 0;
  await signup(call, '+14155550123'); await signup(call, '+442071838750');
  await call('otpsend', { phone: '+14155550123' }, { ip: '6.0.0.1' }); await H.otpIdle(); assert.equal(sent.length, 1);
  process.env.OTP_COUNTRIES = '44'; await call('otpsend', { phone: '+14155550123' }, { ip: '6.0.0.2' }); await H.otpIdle(); assert.equal(sent.length, 1, 'US not allowed');
  process.env.OTP_COUNTRY_CAPS = '44:1'; process.env.OTP_COUNTRIES = '44,1';
  await call('otpsend', { phone: '+442071838750' }, { ip: '6.0.0.3' }); await H.otpIdle(); assert.equal(sent.length, 2);
  await signup(call, '+442071838751');
  await call('otpsend', { phone: '+442071838751' }, { ip: '6.0.0.4' }); await H.otpIdle(); assert.equal(sent.length, 2, 'UK budget of 1 spent');
  delete process.env.OTP_COUNTRY_CAPS; process.env.OTP_DAILY_CAP = '2';
  await call('otpsend', { phone: '+14155550123' }, { ip: '6.0.0.5' }); await H.otpIdle(); assert.equal(sent.length, 2, 'global cap');
  delete process.env.OTP_COUNTRIES; delete process.env.OTP_DAILY_CAP;
});
test('production refuses OTP without an explicit OTP_DAILY_CAP and OTP_SECRET', async () => {
  const keep = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'production', SMS_PROVIDER: 'webhook', SMS_WEBHOOK_URL: 'https://sms.example/x', ADMIN_PHONES: ADMIN + ',+447700900112' });
  const { call } = fresh(); await signup(call, USER);
  const r1 = await call('otpsend', { phone: USER }); assert.equal(r1[1].error, 'otp_unavailable');
  process.env.OTP_DAILY_CAP = '50'; assert.equal((await call('otpsend', { phone: USER }))[1].error, 'otp_unavailable', 'secret missing');
  process.env.OTP_SECRET = 's3cret'; assert.equal(JSON.stringify(await call('otpsend', { phone: USER })), GENERIC);
  await H.otpIdle();
  for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k]; Object.assign(process.env, keep);
});
test('client IP: socket by default, XFF ignored unless TRUST_PROXY=1 (right-most), Vercel header on Vercel', () => {
  const req = (h, a) => ({ headers: h, socket: { remoteAddress: a } });
  assert.equal(H.clientIp(req({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8' }, '10.0.0.5')), '10.0.0.5');
  assert.equal(H.clientIp(req({}, '::ffff:10.0.0.6')), '10.0.0.6');
  process.env.TRUST_PROXY = '1';
  assert.equal(H.clientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }, '10.0.0.5')), '203.0.113.9');
  assert.equal(H.clientIp(req({ 'x-forwarded-for': 'junk' }, '10.0.0.5')), '');
  delete process.env.TRUST_PROXY; process.env.VERCEL = '1';
  assert.equal(H.clientIp(req({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '1.2.3.4' }, '10.0.0.5')), '198.51.100.7');
  assert.equal(H.clientIp(req({ 'x-vercel-forwarded-for': '198.51.100.8' }, '10.0.0.5')), '198.51.100.8');
  delete process.env.VERCEL;
});
test('log phone masking', () => assert.equal(Sms.mask('+447700900111'), '+44*******111'));

(async () => {
  let bad = 0;
  for (const [name, fn] of t) { try { await fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + '\n  ' + (e.stack || e).split('\n').slice(0, 4).join('\n  ')); } }
  console.error = realErr;
  if (bad) process.exit(1);
  console.log('otp regression: passed'); process.exit(0);
})();
