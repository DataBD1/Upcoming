'use strict';
// Audit log: coverage, truncation marker, and account-deletion scrub (review 05).
const assert = require('assert');
const Core = require('./core.js'), { handleApi } = require('./lib/handler.js');
process.env.ADMIN_PHONES = '01711000000';
(async () => {
  const s = Core.seed(Date.now(), { set: 'dhaka' });
  const store = { read: async () => s, transact: async (f) => { const r = await f(s); return r; } };
  const call = async (name, body, token) => (await handleApi(store, { method: 'POST', name, body: body || {}, token, ua: 't' }));
  const su = async (phone, name) => (await call('auth', { mode: 'signup', phone, pin: 'secret12', name, adult: true, consent: true }))[1].token;
  const adm = await su('01711000000', 'Admin1'), pl = await su('01811111111', 'Rahim');
  const act = (a) => s.audit.filter((x) => x.action === a);
  assert.strictEqual(act('login').length, 1, 'admin sign-up is audited');
  await call('auth', { mode: 'login', phone: '01711000000', pin: 'secret12' });
  assert.strictEqual(act('login').length, 2, 'admin login is audited');
  await call('auth', { mode: 'login', phone: '01811111111', pin: 'secret12' });
  assert.strictEqual(act('login').length, 2, 'player login is not');
  await call('rename', { name: 'Admin One' }, adm); assert.strictEqual(act('rename').length, 1, 'admin rename audited');
  await call('rename', { name: 'Rahim R' }, pl); assert.strictEqual(act('rename').length, 1, 'player rename not audited');
  const pid = Object.keys(s.users).find((u) => s.users[u].name === 'Rahim R');
  await call('adjust', { user: pid, amount: 5, reason: 'Rahim Uddin 01822222222 emailed' }, adm);
  assert.ok(JSON.stringify(s.audit).includes('01822222222'));
  // deletion scrub: reason about the deleted user is redacted; ids and action names stay
  assert.strictEqual((await call('delete', { pin: 'secret12' }, pl))[0], 200);
  const ad = act('adjust')[0];
  assert.ok(!JSON.stringify(s.audit).includes('01822222222'), 'PII removed from audit');
  assert.strictEqual(ad.args.user, pid); assert.strictEqual(ad.args.amount, 5); assert.strictEqual(ad.args.reason, '[redacted]');
  // admin changes phone to a non-admin number: audited as demoted
  await call('chphone', { pin: 'secret12', phone: '01933333333' }, adm);
  const ch = act('chphone')[0]; assert.ok(ch && ch.args.demoted === true && ch.by, 'chphone audited');
  // cap and truncation marker
  const a2 = Object.keys(s.users).find((u) => s.users[u].admin) || ch.by;
  s.audit = []; s.auditDropped = 0;
  for (let i = 0; i < 5003; i++) Core.audit(s, ch.by, 'x', { i }, 1);
  assert.strictEqual(s.audit.length, 5000); assert.strictEqual(s.auditDropped, 3);
  s.users[ch.by].admin = true;
  const out = Core.act(s, ch.by, 'auditall', {}, 2);
  assert.strictEqual(out.truncated, true); assert.strictEqual(out.dropped, 3); assert.strictEqual(out.audit.length, 5000);
  console.log('audit tests: passed');
})().catch((e) => { console.error(e); process.exit(1); });
