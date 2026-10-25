// In-process checks (memory store) of ADMINS() parsing, production behaviour, chphone/delete re-takeover, revocation.
process.env.ADMIN_PHONES = '01711000000,+12125550123';
const H = require('/home/user/upcoming/dhk-predicts-features/app/lib/handler.js');
const Core = require('/home/user/upcoming/dhk-predicts-features/app/core.js');
const mem = () => { let st = Core.seed(Date.now()); st.auth = {}; st.sessions = {}; return { read: async () => st, transact: async fn => { const d = structuredClone(st); const o = await fn(d); st = d; return o; } }; };
const call = (store, name, body, token, method = 'POST', country) => H.handleApi(store, { method, name, body, token, country });
const su = (st, phone, name, c) => call(st, 'auth', { mode: 'signup', phone, pin: 'password1', name, adult: true, consent: true }, null, 'POST', c);
const t = (l, v) => console.log(l.padEnd(62), v);
(async () => {
  // 1. duplicates / normalisation
  for (const v of ['01711000000,+8801711000000', '01711000000, 8801711000000 ,008801711000000', '+8801711000000,+8801711000000']) {
    process.env.ADMIN_PHONES = v; process.env.NODE_ENV = 'production';
    const origWarn = console.warn; let warned = []; console.warn = (...a) => warned.push(a.join(' ')); H.ADMINS.warned = false;
    let r; try { r = H.ADMINS(); } catch (e) { r = 'THROWS ' + e.message.slice(0, 40); }
    console.warn = origWarn; t('dupes ' + JSON.stringify(v), JSON.stringify(r) + ' length=' + (Array.isArray(r) ? r.length : '-') + ' warned=' + warned.length);
  }
  // 2. fail-closed claims
  for (const v of ['', ' ', ',', '01711000000,', '01711000000,,+12125550123', 'abc', '+12125550123;01711000000', '12125550123,01711000000', '+1212555012,+12125550123']) {
    process.env.ADMIN_PHONES = v; process.env.NODE_ENV = 'production'; H.ADMINS.warned = true;
    let r; try { r = JSON.stringify(H.ADMINS()); } catch (e) { r = 'THROWS'; }
    t('prod ADMIN_PHONES=' + JSON.stringify(v), r);
  }
  // 3. env detection: preview deploy / NODE_ENV unset
  delete process.env.NODE_ENV; process.env.VERCEL_ENV = 'preview'; process.env.ADMIN_PHONES = 'garbage';
  let r; try { r = JSON.stringify(H.ADMINS()); } catch (e) { r = 'THROWS'; } t('VERCEL_ENV=preview, ADMIN_PHONES=garbage', r);
  // 4. warn behaviour: exactly once per process, single number
  delete process.env.VERCEL_ENV; process.env.NODE_ENV = 'production'; process.env.ADMIN_PHONES = '01711000000'; H.ADMINS.warned = false;
  let n = 0; const ow = console.warn; console.warn = () => n++; for (let i = 0; i < 1000; i++) H.ADMINS(); console.warn = ow; t('1 number, 1000 ADMINS() calls -> warn count', n);
  // 5. chphone / delete free an admin number for takeover; removing from env does not revoke
  process.env.NODE_ENV = 'test'; process.env.ADMIN_PHONES = '01711000000,+12125550123';
  const st = mem();
  let [s, a] = await su(st, '01711000000', 'Boss'); let me = (await call(st, 'home', {}, a.token, 'GET'))[1].me; t('real admin signup admin=', me.admin);
  [s, r] = await call(st, 'chphone', { phone: '+8801811111111', pin: 'password1' }, a.token); t('admin chphone to personal number', s + ' ' + JSON.stringify(r));
  me = (await call(st, 'home', {}, a.token, 'GET'))[1].me; t('  after chphone admin=', me.admin);
  [s, r] = await su(st, '01711000000', 'Mallory'); me = (await call(st, 'home', {}, r.token, 'GET'))[1].me; t('  attacker signs up freed admin number admin=', me.admin);
  const st2 = mem(); [s, a] = await su(st2, '+12125550123', 'Boss2');
  [s, r] = await call(st2, 'delete', { pin: 'password1' }, a.token); t('admin deletes account', s);
  [s, r] = await su(st2, '+12125550123', 'Mallory'); me = (await call(st2, 'home', {}, r.token, 'GET'))[1].me; t('  re-signup of deleted admin number admin=', me.admin);
  // revocation: remove number from env
  const st3 = mem(); [s, a] = await su(st3, '01711000000', 'Boss3'); process.env.ADMIN_PHONES = '+12125550123,+12125550124';
  me = (await call(st3, 'home', {}, a.token, 'GET'))[1].me; t('number removed from ADMIN_PHONES, existing admin still admin=', me.admin);
  const ib = await call(st3, 'inbox', {}, a.token, 'GET'); t('  still opens inbox', ib[0]);
  // non-admin moving to an admin number gets nothing
  process.env.ADMIN_PHONES = '01711000000,+12125550123';
  const st4 = mem(); [s, a] = await su(st4, '+8801811111111', 'Plain'); [s, r] = await call(st4, 'chphone', { phone: '01711000000', pin: 'password1' }, a.token);
  me = (await call(st4, 'home', {}, a.token, 'GET'))[1].me; t('non-admin chphone to admin number: status/admin', s + '/' + me.admin);
  // 6. adminCount counts env numbers, not live admins
  const st5 = mem(); [s, a] = await su(st5, '01711000000', 'Only'); r = await call(st5, 'inbox', {}, a.token, 'GET'); t('1 registered admin, 2 env numbers -> adminCount', r[1].adminCount);
  // 7. two-admin rule with one admin
  const mk = (await call(st5, 'markets', {}, a.token, 'GET'));
  console.log('(two-admin rule: see test-disputes.js; same_admin enforced by uid, so a 2nd account on an ADMIN number is the only bypass)');
  // 8. A45 exemption: BD IP blocked by default, admin number exempt, same hole
  const st6 = mem(); [s, r] = await su(st6, '+8801812345678', 'X', 'BD'); t('A45 BD ip, normal number', s + ' ' + JSON.stringify(r));
  [s, r] = await su(st6, '+8801711000000', 'X', 'BD'); t('A45 BD ip, admin number', s);
  process.exit(0);
})();
