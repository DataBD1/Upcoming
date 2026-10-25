// API tests through lib/handler.js with a throwaway file store. Run: node test-api.js
const assert = require('assert'), os = require('os'), path = require('path'), fs = require('fs');
process.env.ADMIN_PHONES = '01711000000, +1 (202) 555-0123';
const Core = require('./core.js'), { handleApi } = require('./lib/handler.js'), { createFileStore } = require('./lib/filestore.js');
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dpa-')), 'data.json');
const store = createFileStore({ file, seed: () => Core.seed(Date.now(), { set: 'dhaka' }) });
const call = (name, body = {}, token, method = 'POST', country = 'GB') => handleApi(store, { method, name, body, token, ua: 'test', country });
(async () => {
  let [st, r] = await call('auth', { mode: 'signup', phone: '+880 1711-000000', pin: 'dhaka123', name: 'Admin', adult: true, consent: true, device: 'd1' });
  assert.equal(st, 200); const admin = r.token; // BD number, but team numbers in ADMIN_PHONES are exempt
  // A45: Bangladesh sign-ups blocked by IP country and by +880 number
  assert.deepEqual(await call('auth', { mode: 'signup', phone: '+44 7700 900123', pin: 'secret12', adult: true, consent: true }, null, 'POST', 'BD'), [400, { error: 'not_available' }]);
  assert.deepEqual(await call('auth', { mode: 'signup', phone: '+44 7700 900123', pin: 'secret12', adult: true, consent: true }, null, 'POST', 'bd'), [400, { error: 'not_available' }]);
  assert.equal((await call('home', {}, null, 'GET', 'BD'))[1].signupOpen, false);
  assert.equal((await call('home', {}, null, 'GET', 'AE'))[1].signupOpen, true);
  assert.equal((await call('signup', { blockedIp: [] }, admin))[0], 200, 'admin can lift the block');
  assert.equal((await call('home', {}, null, 'GET', 'BD'))[1].signupOpen, true);
  await call('signup', { blockedIp: ['BD'] }, admin);
  [st, r] = await call('auth', { mode: 'signup', phone: '০১৮১২৩৪৫৬৭৮', pin: 'secret12', name: 'রিয়া', adult: true, consent: true, device: 'd1' });
  let riya = r.token;
  assert.deepEqual(await call('auth', { mode: 'signup', phone: '01812345678', pin: 'secret12', adult: true, consent: true }), [400, { error: 'phone_taken' }]);
  assert.deepEqual(await call('auth', { mode: 'signup', phone: '01912345670', pin: 'secret12', consent: true }), [400, { error: 'need_adult' }]);
  assert.deepEqual(await call('auth', { mode: 'signup', phone: '01912345670', pin: 'secret12', adult: true, consent: 'on' }), [400, { error: 'need_consent' }]);
  assert.deepEqual(await call('auth', { mode: 'signup', phone: '01212345678', pin: 'secret12' }), [400, { error: 'bad_phone' }]);
  assert.deepEqual(await call('auth', { mode: 'signup', phone: '01912345678', pin: '1234' }), [400, { error: 'bad_pin' }]);
  for (let i = 0; i < 5; i++) assert.equal((await call('auth', { mode: 'login', phone: '01812345678', pin: 'wrongpw' }))[1].error, 'wrong_login');
  assert.equal((await call('auth', { mode: 'login', phone: '01812345678', pin: 'secret12' }))[1].error, 'slow_down', 'failed logins are counted');
  [st, r] = await call('home', {}, riya, 'GET'); assert(r.me.name === 'রিয়া' && !r.me.admin && r.me.pts === 1000);
  [st, r] = await call('home', {}, admin, 'GET'); assert(r.me.admin, 'admin from ADMIN_PHONES');
  assert.equal((await call('buy', { id: 'mrt1', side: 'y', amount: 10 }, riya, 'GET'))[1].error, 'use_post');
  assert.equal((await call('buy', { id: 'mrt1', side: 'y', amount: 10 }))[0], 401);
  [st, r] = await call('buy', { id: 'mrt1', side: 'y', amount: 100 }, riya); assert(st === 200 && r.pts === 900);
  assert.equal((await call('buy', { id: 'mrt1', side: 'y', amount: 99999 }, riya))[1].error, 'no_points');
  assert.equal((await call('resolve', { id: 'mrt1', outcome: 'y' }, riya))[1].error, 'forbidden');
  [st, r] = await call('resolve', { id: 'mrt1', outcome: 'na' }, admin); assert.equal(st, 200);
  [st, r] = await call('me', {}, riya, 'GET'); assert.equal(r.me.pts, 1000, 'N/A refund through the API');
  // A43: E.164, SK's US admin number, country list
  const { normPhone } = require('./lib/handler.js');
  assert.equal(normPhone('01711000000'), '+8801711000000'); assert.equal(normPhone('+880 1711-000000'), '+8801711000000');
  assert.equal(normPhone('008801711000000'), '+8801711000000'); assert.equal(normPhone('+1 (202) 555-0123'), '+12025550123');
  assert.equal(normPhone('2025550123'), null, 'non-BD numbers need +'); assert.equal(normPhone('+1 555 0123'), null); assert.equal(normPhone('+88017'), null);
  assert.equal(normPhone('+44 7700 900123', ['880', '1']), null); assert.equal(normPhone('+44 7700 900123'), '+447700900123');
  [st, r] = await call('auth', { mode: 'signup', phone: '+1 202 555 0123', pin: 'skpass99', name: 'SK', adult: true, consent: true });
  [st, r] = await call('home', {}, r.token, 'GET'); assert(r.me.admin, 'US admin number from ADMIN_PHONES');
  // Security: prototype names must not reach Object.prototype (found by Rival B's review)
  for (const n of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty', '__defineGetter__', 'isPrototypeOf', 'Constructor', 'auth/../constructor'])
    for (const m of ['GET', 'POST']) for (const tok of [null, riya]) {
      const [code, out] = await call(n, {}, tok, m);
      assert(code === 400 && out.error === 'unknown', `${m} ${n} -> ${code} ${JSON.stringify(out).slice(0, 60)}`);
    }
  for (const n of ['constructor', 'toString', '__proto__']) assert.throws(() => Core.act(Core.seed(Date.now(), { set: 'dhaka' }), null, n, {}), /unknown/, 'engine itself rejects ' + n);
  assert.equal((await call('resolve', { id: 'usd-125', outcome: 'constructor' }, admin))[1].error, 'bad_outcome');
  // fail closed in production
  const { ADMINS } = require('./lib/handler.js'), keep = process.env.ADMIN_PHONES;
  process.env.VERCEL_ENV = 'production';
  process.env.ADMIN_PHONES = ''; assert.throws(() => ADMINS(), /ADMIN_PHONES/);
  process.env.ADMIN_PHONES = '+12025550123, not-a-phone'; assert.throws(() => ADMINS(), /ADMIN_PHONES/);
  process.env.ADMIN_PHONES = keep; assert.throws(() => ADMINS(), /ADMIN_SETUP_CODE/, 'production needs the setup code');
  process.env.ADMIN_SETUP_CODE = 'launch-code'; assert.equal(ADMINS().length, 2); delete process.env.ADMIN_SETUP_CODE; delete process.env.VERCEL_ENV;
  (await store.read()).attempts = {}; // clear the login limit tripped above
  // A31: see, correct, delete
  [st, r] = await call('account', {}, riya, 'GET');
  assert(r.profile.phone === '+8801812345678' && r.profile.consentVer === 'draft-1' && r.profile.adultAt && r.history.length === 1 && r.history[0].kind === 'buy');
  assert.equal((await call('rename', { name: 'Riya K' }, riya))[0], 200);
  assert.equal((await call('chphone', { phone: '01812345679', pin: 'nope123' }, riya))[1].error, 'wrong_pin');
  assert.equal((await call('chphone', { phone: '01711000000', pin: 'secret12' }, riya))[1].error, 'phone_taken');
  assert.equal((await call('chphone', { phone: '01812345679', pin: 'secret12' }, riya))[0], 200);
  [st, r] = await call('account', {}, riya, 'GET'); assert(r.profile.phone === '+8801812345679' && r.profile.name === 'Riya K');
  // A27: admins can't trade markets they created
  [st, r] = await call('create', { en: 'Will it rain at Agargaon tomorrow?', bn: 'কাল কি আগারগাঁওয়ে বৃষ্টি হবে?', srcEn: 'BMD', closes: '2027-01-01', p: 50, cat: 'weather' }, admin);
  assert.equal((await call('buy', { id: r.id, side: 'y', amount: 10 }, admin))[1].error, 'own_market');
  assert.equal((await call('buy', { id: r.id, side: 'y', amount: 10 }, riya))[0], 200);
  await call('feedback', { text: 'please add Sylhet' }, riya);
  [st, r] = await call('metrics', {}, admin, 'GET');
  assert(r.events.signup === 3 && r.events.prediction === 2 && r.events.feedback_sent === 1, JSON.stringify(r.events));
  assert.equal((await call('delete', { pin: 'wrong12' }, riya))[1].error, 'wrong_pin');
  assert.equal((await call('delete', { pin: 'secret12' }, riya))[0], 200);
  assert.equal((await call('me', {}, riya, 'GET'))[0], 401, 'deleted account is signed out');
  [st, r] = await call('leaders', {}, admin, 'GET'); assert(!r.top.some(x => x.name === 'Riya K'), 'gone from leaderboard');
  [st, r] = await call('inbox', {}, admin, 'GET'); assert(!r.feedback.length, 'feedback deleted');
  [st, r] = await call('auth', { mode: 'login', phone: '01812345679', pin: 'secret12' }); assert.equal(r.error, 'wrong_login');
  // phone can sign up again as a new person
  assert.equal((await call('auth', { mode: 'signup', phone: '01812345679', pin: 'secret12', name: 'New', adult: true, consent: true }))[0], 200);
  [st, r] = await call('auth', { mode: 'signup', phone: '01612345678', pin: 'secret12', name: 'Third', adult: true, consent: true, device: 'd1' });
  [st, r] = await call('metrics', {}, admin, 'GET'); assert.equal(r.deviceFlags.length, 0, 'deleted user left the device list');
  [st, r] = await call('auth', { mode: 'signup', phone: '01612345679', pin: 'secret12', name: 'Fourth', adult: true, consent: true, device: 'd1' });
  [st, r] = await call('metrics', {}, admin, 'GET'); assert.equal(r.deviceFlags[0].length, 3, '3 accounts on one device flagged');
  const saved0 = JSON.stringify(await store.read());
  assert(!saved0.includes('Riya') && !saved0.includes('1812345678') && !saved0.includes('please add Sylhet'), 'no trace of the deleted player');
  riya = null;
  await call('logout', {}, admin);
  assert.equal((await call('me', {}, admin, 'GET'))[0], 401, 'logged out');
  await new Promise(r => setTimeout(r, 400));
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(saved.auth['+8801711000000'] && !JSON.stringify(saved).includes('secret12'), 'saved, password not stored in plain text');
  // Login doesn't reveal which numbers have accounts, and failed tries keep no plain number.
  assert.equal((await call('auth', { mode: 'login', phone: '+44 7700 900999', pin: 'secret12' }))[1].error, 'wrong_login');
  assert(!JSON.stringify(await store.read()).includes('447700900999'), 'unknown number not stored');
  // Sessions expire 30 days after sign-in.
  [st, r] = await call('auth', { mode: 'login', phone: '01711000000', pin: 'dhaka123' }); const old = r.token;
  assert.equal((await call('me', {}, old, 'GET'))[0], 200);
  await store.transact(s => { for (const k of Object.keys(s.sessions)) if (Array.isArray(s.sessions[k])) s.sessions[k][1] -= 31 * 864e5; });
  assert.equal((await call('me', {}, old, 'GET'))[0], 401, 'expired session');
  console.log('API tests passed');
})().catch(e => { console.error(e); process.exit(1); });
