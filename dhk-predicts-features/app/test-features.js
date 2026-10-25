// Admin password reset, OTP scaffold, sponsor line, audit read, due-soon flag, threshold tool. Run: node test-features.js
const assert = require('assert'), os = require('os'), path = require('path'), fs = require('fs');
process.env.ADMIN_PHONES = '01711000000, +1 (202) 555-0123';
const Core = require('./core.js'), { handleApi } = require('./lib/handler.js'), { createFileStore } = require('./lib/filestore.js');
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dpf-')), 'data.json');
const store = createFileStore({ file, seed: () => Core.seed(Date.now(), { set: 'dhaka' }) });
const call = (name, body = {}, token, method = 'POST', ip = '1.1.1.1') => handleApi(store, { method, name, body, token, ua: 'test', country: 'GB', ip });
const signup = async (phone, name, pin) => (await call('auth', { mode: 'signup', phone, pin, name, adult: true, consent: true, device: 'dev-' + phone }))[1].token;

(async () => {
  const admin = await signup('+44 7700 900111', 'x', 'adminpass1'), adminB = await signup('01711000000', 'Admin', 'adminpass1');
  const riya = await signup('+44 7700 900123', 'Riya', 'secret12');
  assert.equal((await call('home', {}, adminB, 'GET'))[1].me.admin, true);

  // ---- admin inbox: admin count and due-soon flag
  let [st, r] = await call('inbox', {}, adminB, 'GET'); assert.equal(st, 200); assert.equal(r.adminCount, 2);
  const mk = (await call('home', {}, null, 'GET'))[1].markets.find(m => m.status === 'open');
  // propose a result: the dispute window is 24h or 48h, so it is not "soon" yet
  await call('propose', { id: mk.id, outcome: 'y', hours: 24, note: 'x' }, adminB);
  [st, r] = await call('inbox', {}, adminB, 'GET');
  assert.equal(r.proposed.length, 1); assert.equal(r.proposed[0].soon, false, 'a fresh 24h window is not due soon');
  await store.transact(s => { const m = s.markets.find(x => x.id === mk.id); if (m.proposal) m.proposal.until = Date.now() + 3600e3; });
  [st, r] = await call('inbox', {}, adminB, 'GET');
  assert.equal(r.proposed[0].soon, true, 'one hour left is due soon');

  // ---- full audit log is admin only
  assert.equal((await call('auditall', {}, riya, 'GET'))[1].error, 'forbidden');
  [st, r] = await call('auditall', {}, adminB, 'GET'); assert.equal(st, 200); assert(Array.isArray(r.audit));

  // ---- sponsor line
  assert.equal((await call('sponsor', { en: 'Acme', url: 'https://acme.example' }, riya))[1].error, 'forbidden');
  assert.equal((await call('sponsor', { en: 'Acme', url: 'javascript:alert(1)' }, adminB))[1].error, 'bad_link');
  assert.equal((await call('sponsor', { en: 'Acme', url: 'http://acme.example' }, adminB))[1].error, 'bad_link', 'https only');
  [st, r] = await call('sponsor', { en: 'Acme Tea', bn: 'অ্যাকমি চা', url: 'https://acme.example/?a=1' }, adminB);
  assert.deepEqual(r.site.sponsor, { en: 'Acme Tea', bn: 'অ্যাকমি চা', url: 'https://acme.example/?a=1' });
  assert.equal((await call('home', {}, null, 'GET'))[1].site.sponsor.en, 'Acme Tea');
  [st, r] = await call('sponsor', { en: '' }, adminB); assert.equal(r.site.sponsor, undefined, 'empty text clears it');
  assert(r.site.sponsor === undefined);

  // ---- admin password reset
  assert.equal((await call('resetpw', { phone: '+44 7700 900123' }, riya))[0], 403, 'players cannot make reset codes');
  assert.equal((await call('resetpw', { phone: '+44 7700 900123' }))[0], 403, 'nor can guests');
  assert.equal((await call('resetpw', { phone: '+44 7700 999999' }, adminB))[1].error, 'no_account');
  assert.equal((await call('resetpw', { phone: '+44 7700 900123' }, adminB, 'GET'))[1].error, 'use_post');
  [st, r] = await call('resetpw', { phone: '+44 7700 900123' }, adminB); assert.equal(st, 200); const rc = r.code; assert(rc.length >= 12);
  assert(!JSON.stringify(await store.read()).includes(rc), 'only a hash of the code is stored');
  assert(((await call('auditall', {}, adminB, 'GET'))[1].audit.some(x => x.action === 'resetpw')), 'resets are audited');
  assert.equal((await call('usereset', { phone: '+44 7700 900123', code: 'wrongcode0000', pin: 'newpass12' }))[1].error, 'bad_reset');
  assert.equal((await call('usereset', { phone: '+44 7700 900111', code: rc, pin: 'newpass12' }))[1].error, 'bad_reset', 'code only works for its own player');
  assert.equal((await call('usereset', { phone: '+44 7700 900123', code: rc, pin: 'short' }))[1].error, 'bad_pin');
  [st, r] = await call('usereset', { phone: '+44 7700 900123', code: rc, pin: 'newpass12' }); assert.equal(st, 200); assert(r.token);
  assert.equal((await call('usereset', { phone: '+44 7700 900123', code: rc, pin: 'another12' }))[1].error, 'bad_reset', 'one use only');
  assert.equal((await call('home', {}, riya, 'GET'))[1].me, null, 'old sessions end');
  assert.equal((await call('home', {}, r.token, 'GET'))[1].me.name, 'Riya', 'new session works');
  assert.equal((await call('auth', { mode: 'login', phone: '+44 7700 900123', pin: 'secret12' }))[1].error, 'wrong_login', 'old password is gone');
  assert.equal((await call('auth', { mode: 'login', phone: '+44 7700 900123', pin: 'newpass12' }))[0], 200);
  [st, r] = await call('resetpw', { phone: '+44 7700 900123' }, adminB); const old = r.code;
  [st, r] = await call('resetpw', { phone: '+44 7700 900123' }, adminB);
  assert.equal((await call('usereset', { phone: '+44 7700 900123', code: old, pin: 'newpass13' }))[1].error, 'bad_reset', 'a new code replaces the old one');
  await store.transact(s => { for (const k of Object.keys(s.resets)) s.resets[k].exp = Date.now() - 1; });
  assert.equal((await call('usereset', { phone: '+44 7700 900123', code: r.code, pin: 'newpass13' }))[1].error, 'bad_reset', 'expired');

  // ---- OTP scaffold
  const idle = require('./lib/handler.js').otpIdle;
  assert.equal((await call('otpsend', { phone: '+44 7700 900123' }))[1].error, 'otp_unavailable', 'off by default');
  assert.equal((await call('home', {}, null, 'GET'))[1].otp, false);
  process.env.OTP_ENABLED = '1'; process.env.SMS_PROVIDER = 'console'; process.env.OTP_DAILY_CAP = '5';
  const sent = [], log = console.log; console.log = (...a) => { const m = String(a[0]); if (m.startsWith('[sms:console]')) sent.push(m); else log(...a); };
  try {
    assert.equal((await call('home', {}, null, 'GET'))[1].otp, true);
    assert.deepEqual(await call('otpsend', { phone: '+44 7700 900123' }), [200, { ok: true }]); await idle();
    const code = sent[0].match(/code is (\d{6})/)[1];
    assert.deepEqual(await call('otpsend', { phone: '+44 7700 888888' }), [200, { ok: true }], 'unknown number gets the same reply'); await idle();
    assert.equal(sent.length, 1, 'nothing is sent to an unknown number');
    assert(!JSON.stringify(await store.read()).includes('"' + code + '"'), 'the code is stored hashed');
    assert.equal((await call('otpverify', { phone: '+44 7700 900123', code: code === '000000' ? '000001' : '000000' }))[1].error, 'bad_otp');
    [st, r] = await call('otpverify', { phone: '+44 7700 900123', code }); assert.equal(st, 200);
    assert.equal((await call('home', {}, r.token, 'GET'))[1].me.name, 'Riya');
    assert.equal((await call('otpverify', { phone: '+44 7700 900123', code }))[1].error, 'bad_otp', 'a code works once');
    // 5 tries, then the code is dead even if the next guess is right
    await call('otpsend', { phone: '+44 7700 900123' }); await idle(); const c2 = sent[1].match(/code is (\d{6})/)[1], wrong = c2 === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await call('otpverify', { phone: '+44 7700 900123', code: wrong });
    assert.equal((await call('otpverify', { phone: '+44 7700 900123', code: c2 }))[1].error, 'bad_otp', 'locked after 5 tries');
    // 3 sends per number per hour
    assert.equal((await call('otpsend', { phone: '+44 7700 900123' }))[0], 200); await idle();
    const n3 = sent.length;
    assert.deepEqual(await call('otpsend', { phone: '+44 7700 900123' }), [200, { ok: true }], '4th send in an hour: same reply'); await idle();
    assert.equal(sent.length, n3, '4th send in an hour sends nothing');
    // daily cap across numbers (cap 5; 3 used above)
    const p2 = await signup('+44 7700 900200', 'B', 'secret12'), p3 = await signup('+44 7700 900201', 'C', 'secret12');
    assert.equal((await call('otpsend', { phone: '+44 7700 900200' }, null, 'POST', '2.2.2.2'))[0], 200);
    assert.equal((await call('otpsend', { phone: '+44 7700 900201' }, null, 'POST', '3.3.3.3'))[0], 200); await idle();
    assert.equal((await call('otpsend', { phone: '+44 7700 900202' }, null, 'POST', '4.4.4.4'))[0], 200, 'unknown numbers use no budget');
    const before = sent.length;
    assert.deepEqual(await call('otpsend', { phone: '+44 7700 900111' }, null, 'POST', '5.5.5.5'), [200, { ok: true }], 'daily cap reached: same reply'); await idle();
    assert.equal(sent.length, before, 'daily cap reached: nothing sent');
    // production refuses the console provider
    process.env.NODE_ENV = 'production';
    assert.equal(require('./lib/sms.js').available(), false); process.env.NODE_ENV = 'test';
  } finally { console.log = log; delete process.env.OTP_ENABLED; delete process.env.SMS_PROVIDER; delete process.env.OTP_DAILY_CAP; process.env.NODE_ENV = ''; }

  // ---- streak is served to the groups page
  [st, r] = await call('social', {}, adminB, 'GET'); assert.equal(st, 200); assert(r.streak >= 0 && r.best >= 0);

  console.log('feature tests passed');
})().catch(e => { console.error(e); process.exit(1); });
