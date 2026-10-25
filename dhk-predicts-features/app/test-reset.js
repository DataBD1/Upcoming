// Regression tests for the admin password reset (review 08): admin accounts are not resettable,
// redemption is audited, codes are revoked, the limiters cannot be used to lock someone out,
// and the attempts map stays bounded. Run: node test-reset.js
'use strict';
process.env.ADMIN_PHONES = '01711000000,+12125550123';
const assert = require('assert'), os = require('os'), path = require('path'), fs = require('fs');
const Core = require('./core.js'), { handleApi } = require('./lib/handler.js'), { createFileStore } = require('./lib/filestore.js');
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 't08-')), 'data.json');
const store = createFileStore({ file, seed: () => Core.seed(Date.now(), { set: 'dhaka' }) });
const call = (name, body = {}, token, ip = '1.1.1.1', method = 'POST') => handleApi(store, { method, name, body, token, ua: 't', country: 'GB', ip });
const signup = async (phone, name, pin, ip) => (await call('auth', { mode: 'signup', phone, pin, name, adult: true, consent: true }, undefined, ip))[1].token;
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
const login = (phone, pin, ip) => call('auth', { mode: 'login', phone, pin }, undefined, ip);

(async () => {
  const adminA = await signup('01711000000', 'AdminA', 'adminApass1');
  const adminB = await signup('+12125550123', 'AdminB', 'adminBpass1');
  const riya = await signup('+442079460001', 'Riya', 'riyapass1');
  let st, r;

  // F1: admin accounts can not be reset in-app, no matter who asks; no code, no audit row
  [st, r] = await call('resetpw', { phone: '+12125550123' }, adminA);
  assert.equal(st, 403); assert.equal(r.error, 'admin_reset_denied'); assert.ok(!r.code);
  [st, r] = await call('resetpw', { phone: '01711000000' }, adminA);
  assert.equal(r.error, 'admin_reset_denied', 'self reset denied too');
  assert.equal((await login('+12125550123', 'adminBpass1'))[0], 200, 'admin B still logs in with own password');
  // a code that was issued before someone became admin is void as well
  const dana = await signup('+442079460010', 'Dana', 'danapass11');
  [st, r] = await call('resetpw', { phone: '+442079460010' }, adminA); const codeDana = r.code;
  await store.transact(s => { Object.values(s.users).find(u => u.name === 'Dana').admin = true; });
  [st, r] = await call('usereset', { phone: '+442079460010', code: codeDana, pin: 'hijack1234' });
  assert.equal(r.error, 'admin_reset_denied');
  await store.transact(s => { delete Object.values(s.users).find(u => u.name === 'Dana').admin; });

  // normal player still works; F2: redemption is audited, no secrets in the audit
  [st, r] = await call('resetpw', { phone: '+442079460001' }, adminA); const code1 = r.code;
  [st, r] = await call('usereset', { phone: '+442079460001', code: code1, pin: 'newriya123' });
  assert.equal(st, 200); assert.ok(r.token);
  assert.equal((await login('+442079460001', 'riyapass1'))[1].error, 'wrong_login');
  [st, r] = await call('usereset', { phone: '+442079460001', code: code1, pin: 'again12345' });
  assert.equal(r.error, 'bad_reset', 'one-time');
  [st, r] = await call('auditall', {}, adminA, '1.1.1.1', 'GET');
  const acts = r.audit.filter(x => /^resetpw/.test(x.action));
  assert.equal(acts.filter(x => x.action === 'resetpw').length, 2); assert.equal(acts.filter(x => x.action === 'resetpw_used').length, 1);
  assert.ok(!JSON.stringify(r.audit).includes(code1), 'code never in audit');
  const used = acts.find(x => x.action === 'resetpw_used'); assert.ok(used.args.user && used.args.by);

  // F5: revocation
  const bob = await signup('+442079460002', 'Bob', 'bobpass111');
  [st, r] = await call('resetpw', { phone: '+442079460002' }, adminA); const codeBob = r.code;
  await login('+442079460002', 'bobpass111');
  [st, r] = await call('usereset', { phone: '+442079460002', code: codeBob, pin: 'stolen1234' });
  assert.equal(r.error, 'bad_reset', 'revoked by successful login');
  const eve = await signup('+442079460003', 'Eve', 'evepass111');
  [st, r] = await call('resetpw', { phone: '+442079460003' }, adminA); const codeEve = r.code;
  await store.transact(s => { Object.values(s.users).find(u => u.name === 'AdminA').admin = false; });
  [st, r] = await call('usereset', { phone: '+442079460003', code: codeEve, pin: 'afterdemote1' });
  assert.equal(r.error, 'bad_reset', 'issuer lost admin');
  await store.transact(s => { Object.values(s.users).find(u => u.name === 'AdminA').admin = true; });
  const carl = await signup('+442079460004', 'Carl', 'carlpass111');
  await call('resetpw', { phone: '+442079460004' }, adminA);
  const carlUid = Object.values((await store.read()).users).find(u => u.name === 'Carl').id;
  await call('delete', { pin: 'carlpass111' }, carl);
  assert.equal(Object.values((await store.read()).resets || {}).filter(x => x.uid === carlUid).length, 0, 'delete revokes codes');
  const fay = await signup('+442079460005', 'Fay', 'faypass111');
  [st, r] = await call('resetpw', { phone: '+442079460005' }, adminA); const codeFay = r.code;
  await call('chphone', { phone: '+442079460099', pin: 'faypass111' }, fay);
  [st, r] = await call('usereset', { phone: '+442079460099', code: codeFay, pin: 'afterphone1' });
  assert.equal(r.error, 'bad_reset', 'chphone revokes');

  // expiry still enforced
  const gus = await signup('+442079460006', 'Gus', 'guspass111');
  [st, r] = await call('resetpw', { phone: '+442079460006' }, adminA); const codeGus = r.code;
  skew += 61 * 60e3;
  assert.equal((await call('usereset', { phone: '+442079460006', code: codeGus, pin: 'toolate123' }))[1].error, 'bad_reset');

  // F3: lockout. Anonymous garbage resets from another IP do not block login or the real reset
  const vic = await signup('+442079460007', 'Vic', 'vicpass111', '9.9.9.9');
  for (let i = 0; i < 12; i++) await call('usereset', { phone: '+442079460007', code: 'AAAAAAAAAAAA', pin: 'whatever1' }, undefined, '6.6.6.6');
  assert.equal((await call('usereset', { phone: '+442079460007', code: 'AAAAAAAAAAAA', pin: 'whatever1' }, undefined, '6.6.6.6'))[1].error, 'slow_down', 'attacker is limited');
  assert.equal((await login('+442079460007', 'vicpass111', '6.6.6.6'))[0], 200, 'reset spam does not block login even from the attacker ip');
  [st, r] = await call('resetpw', { phone: '+442079460007' }, adminA);
  assert.equal((await call('usereset', { phone: '+442079460007', code: r.code, pin: 'newvic1234' }, undefined, '9.9.9.9'))[0], 200, 'victim redeems valid code');
  // wrong-password spam on login: per (ip, phone) cap, owner from another IP unaffected
  for (let i = 0; i < 8; i++) await login('+442079460007', 'wrongwrong', '6.6.6.6');
  assert.equal((await login('+442079460007', 'wrongwrong', '6.6.6.6'))[1].error, 'slow_down');
  assert.equal((await login('+442079460007', 'newvic1234', '9.9.9.9'))[0], 200, 'owner on own ip is fine');
  // a botnet of 20 ips x 6 failures pushes the phone past its ceiling: owner still gets in
  for (let ip = 1; ip <= 20; ip++) for (let i = 0; i < 6; i++) await login('+442079460007', 'guessguess', '7.7.7.' + ip);
  assert.equal((await login('+442079460007', 'newvic1234', '8.8.8.8'))[0], 200, 'owner gets in during distributed attack');
  assert.equal((await login('+442079460007', 'wrongwrong', '8.8.4.4'))[1].error, 'wrong_login');
  assert.equal((await login('+442079460007', 'wrongwrong', '8.8.4.4'))[1].error, 'wrong_login');
  assert.equal((await login('+442079460007', 'wrongwrong', '8.8.4.4'))[1].error, 'slow_down', 'hot phone: 2 tries per fresh ip');
  skew += 16 * 60e3;

  // F4: attempts map is bounded
  for (let i = 0; i < 3000; i++) await call('usereset', { phone: '+1202555' + String(1000 + i).padStart(4, '0'), code: 'x', pin: 'whatever1' }, undefined, '5.5.5.5');
  let n = Object.keys((await store.read()).attempts).length;
  assert.ok(n <= 20, 'one ip creates few entries, got ' + n);
  for (let i = 0; i < 3000; i++) await call('usereset', { phone: '+1202556' + String(1000 + i).padStart(4, '0'), code: 'x', pin: 'whatever1' }, undefined, '4.4.' + (i >> 8) + '.' + (i & 255));
  n = Object.keys((await store.read()).attempts).length;
  assert.ok(n <= 2000, 'rotating ips are capped, got ' + n);
  console.log('reset regression (file store): passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
