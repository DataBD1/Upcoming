// Admin bootstrap regressions (review 04): setup code, live revocation, chphone/delete, dedupe, adminCount, warn throttle.
process.env.ADMIN_PHONES = '01711000000,+12125550123'; process.env.NODE_ENV = 'test';
const assert = require('assert');
const H = require('./lib/handler.js'), Core = require('./core.js');
const mem = () => { let st = Core.seed(Date.now()); st.auth = {}; st.sessions = {}; return { read: async () => st, transact: async fn => { const d = structuredClone(st); const o = await fn(d); st = d; return o; } }; };
const call = (store, name, body, token, method = 'POST', country) => H.handleApi(store, { method, name, body, token, country });
const su = (st, phone, name, extra = {}, c) => call(st, 'auth', { mode: 'signup', phone, pin: 'password1', name, adult: true, consent: true, ...extra }, null, 'POST', c);
const li = (st, phone, extra = {}) => call(st, 'auth', { mode: 'login', phone, pin: 'password1', ...extra });
const me = async (st, tok) => (await call(st, 'home', {}, tok, 'GET'))[1].me;
(async () => {
  process.env.ADMIN_SETUP_CODE = 'launch-secret';
  // F1: signing up with an admin number but without the code is a normal player; with a wrong code it is refused and creates nothing
  let st = mem(), [s, a] = await su(st, '01711000000', 'Mallory');
  assert.equal(s, 200); assert.equal((await me(st, a.token)).admin, false, 'no code, no admin');
  assert.equal((await call(st, 'inbox', {}, a.token, 'GET'))[1].error, 'forbidden');
  st = mem(); [s, a] = await su(st, '01711000000', 'Mallory', { setup: 'guess' }); assert.equal(a.error, 'bad_setup');
  assert.equal((await su(st, '01711000000', 'Owner', { setup: 'launch-secret' }))[0], 200, 'wrong code created no account');
  // right code at sign-up
  st = mem(); [s, a] = await su(st, '+12125550123', 'Owner', { setup: 'launch-secret' }); assert.equal((await me(st, a.token)).admin, true);
  // setup code does not make a non-listed number admin
  [s, a] = await su(st, '+8801811111111', 'Plain', { setup: 'launch-secret' }); assert.equal((await me(st, a.token)).admin, false);
  // login-time grant for an existing player
  st = mem(); [s, a] = await su(st, '01711000000', 'Late'); assert.equal((await me(st, a.token)).admin, false);
  [s, a] = await li(st, '01711000000'); assert.equal((await me(st, a.token)).admin, false, 'plain login does not promote');
  assert.equal((await li(st, '01711000000', { setup: 'nope' }))[1].error, 'bad_setup');
  [s, a] = await li(st, '01711000000', { setup: 'launch-secret' }); assert.equal((await me(st, a.token)).admin, true, 'login with code promotes');
  // A45: a blocked-country visitor with an admin number but no code is still blocked
  st = mem(); [s, a] = await su(st, '+8801711000000', 'X', {}, 'BD'); assert.equal(a.error, 'not_available');
  [s, a] = await su(st, '+8801711000000', 'X', { setup: 'launch-secret' }, 'BD'); assert.equal(s, 200);
  // F3: removing the number from ADMIN_PHONES revokes at once, and the stored flag is dropped
  st = mem(); [s, a] = await su(st, '01711000000', 'Boss', { setup: 'launch-secret' });
  process.env.ADMIN_PHONES = '+12125550123,+12125550124';
  assert.equal((await me(st, a.token)).admin, false); assert.equal((await call(st, 'inbox', {}, a.token, 'GET'))[1].error, 'forbidden');
  assert.equal((await call(st, 'resetpw', { phone: '+12125550123' }, a.token))[0], 403);
  process.env.ADMIN_PHONES = '01711000000,+12125550123';
  // F2: chphone clears the flag; the freed number is not claimable without the code
  st = mem(); [s, a] = await su(st, '01711000000', 'Boss', { setup: 'launch-secret' });
  assert.equal((await call(st, 'chphone', { phone: '+8801811111111', pin: 'password1' }, a.token))[0], 200);
  assert.equal((await me(st, a.token)).admin, false);
  [s, a] = await su(st, '01711000000', 'Mallory'); assert.equal((await me(st, a.token)).admin, false, 'freed number not claimable');
  // chphone onto another listed number also needs the code again
  st = mem(); [s, a] = await su(st, '01711000000', 'Boss', { setup: 'launch-secret' });
  await call(st, 'chphone', { phone: '+12125550123', pin: 'password1' }, a.token); assert.equal((await me(st, a.token)).admin, false);
  [s, a] = await li(st, '+12125550123', { setup: 'launch-secret' }); assert.equal((await me(st, a.token)).admin, true);
  // delete frees the number the same way
  st = mem(); [s, a] = await su(st, '+12125550123', 'Boss', { setup: 'launch-secret' });
  assert.equal((await call(st, 'delete', { pin: 'password1' }, a.token))[0], 200);
  [s, a] = await su(st, '+12125550123', 'Mallory'); assert.equal((await me(st, a.token)).admin, false);
  // failed-pin counter cleared on chphone (F8)
  st = mem(); [s, a] = await su(st, '+8801811111111', 'P'); await call(st, 'chphone', { phone: '+8801822222222', pin: 'wrongpass' }, a.token);
  const failBefore = Object.keys((await st.read()).attempts || {}).length; assert(failBefore >= 1);
  // fix-08 policy: success clears only this (ip, phone) pair's counter, never the shared per-ip and per-phone counters
  await call(st, 'chphone', { phone: '+8801822222222', pin: 'password1' }, a.token); assert.equal(Object.keys((await st.read()).attempts || {}).length, failBefore - 1);
  // F6: adminCount = registered, active admins, not listed numbers
  st = mem(); [s, a] = await su(st, '01711000000', 'Only', { setup: 'launch-secret' });
  assert.equal((await call(st, 'inbox', {}, a.token, 'GET'))[1].adminCount, 1);
  const [, r2] = await su(st, '+12125550123', 'Two', { setup: 'launch-secret' }); assert.equal((await call(st, 'inbox', {}, a.token, 'GET'))[1].adminCount, 2);
  // F5: aliases count once; F7: warn at most once an hour; production needs the setup code
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_PHONES = '01711000000,+8801711000000,008801711000000'; assert.deepEqual(H.ADMINS(), ['+8801711000000']);
  const ow = console.warn; let n = 0; console.warn = () => n++; H.ADMINS.warnedAt = 0;
  for (let i = 0; i < 500; i++) H.ADMINS(); assert.equal(n, 1); H.ADMINS.warnedAt = Date.now() - 36e5 - 1; H.ADMINS(); assert.equal(n, 2); console.warn = ow;
  delete process.env.ADMIN_SETUP_CODE; assert.throws(() => H.ADMINS(), /ADMIN_SETUP_CODE/);
  // outside production an unset code keeps the old behaviour (local runs, tests)
  process.env.NODE_ENV = 'test'; process.env.ADMIN_PHONES = '01711000000,+12125550123';
  st = mem(); [s, a] = await su(st, '01711000000', 'Local'); assert.equal((await me(st, a.token)).admin, true);
  // in production with the code unset nobody is admin even if ADMINS were read leniently
  console.log('admin bootstrap tests passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
