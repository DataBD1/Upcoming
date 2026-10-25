// How the "small" main row grows with resolved markets (m.book + m.paid keep one entry per holder, markets are never removed) and what it costs
// per write. A resolved market is built by the real code path (Core resolve) at H holders, then replicated to simulate 10/30/100 settled markets.
const APP = '/home/user/upcoming/dhk-predicts-features/app';
const { createStore } = require(APP + '/lib/pgstore.js'), Core = require(APP + '/core.js'), H = require(APP + '/lib/handler.js');
const { Client } = require('module').createRequire(APP + '/x.js')('pg');
const HOLD = +process.argv[2] || 3000;
(async () => {
  process.env.ADMIN_PHONES = '01711000000';
  const key = 'mr' + HOLD; const url = 'postgres://t:t@localhost:54410/postgres';
  const store = createStore({ url, key, seed: () => Core.seed(Date.now()) }); const c = new Client({ connectionString: url }); await c.connect();
  const call = (name, body, token, method = 'POST') => H.handleApi(store, { method, name, body: body || {}, token, ua: 'x', country: 'GB', ip: '1.1.1.1' });
  const tok = (await call('auth', { mode: 'signup', phone: '01711000000', pin: 'adminpin1', name: 'Admin', adult: true, consent: true }))[1].token;
  const mid = (await call('home', {}, tok, 'GET'))[1].markets.find(m => m.status === 'open').id;
  await store.transact(s => { for (let i = 0; i < HOLD; i++) { const u = 'u' + i.toString(36).padStart(8, '0'); s.users[u] = { id: u, name: 'P' + i, pts: 1000, lastBonus: 'x' }; s.pos[u] = { [mid]: { y: 10 + i % 7, n: 0, spent: 10, sy: 10, sn: 0, net: 10, counted: 1 } }; } });
  await call('resolve', { id: mid, outcome: 'y' }, tok);
  const m = (await store.read()).markets.find(x => x.id === mid); const one = JSON.stringify(m).length;
  console.log(HOLD, 'holders: one resolved market =', (one / 1024).toFixed(0), 'KB in the main row =', (one / HOLD).toFixed(0), 'bytes per holder');
  for (const copies of [1, 10, 30, 100]) {
    await store.transact(s => { s.markets = s.markets.filter(x => !x.id.startsWith('copy')); for (let i = 0; i < copies; i++) s.markets.push({ ...JSON.parse(JSON.stringify(m)), id: 'copy' + i, status: 'resolved' }); });
    const kb = ((await c.query('select length(data::text) n from app_state where key=$1', [key])).rows[0].n / 1024).toFixed(0);
    const t = []; for (let i = 0; i < 5; i++) { const t0 = process.hrtime.bigint(); await call('bonus', {}, tok); await call('feedback', { text: 'x' + i }, tok); t.push(Number(process.hrtime.bigint() - t0) / 2e6); }
    const t1 = process.hrtime.bigint(); await call('home', {}, null, 'GET'); const rd = Number(process.hrtime.bigint() - t1) / 1e6;
    console.log(String(copies).padStart(3), 'resolved markets: main row', kb.padStart(6), 'KB | avg small write', (t.reduce((a, b) => a + b) / t.length).toFixed(0), 'ms | home read', rd.toFixed(1), 'ms | per-write bytes to DB ~', kb, 'KB');
  }
  await store.end(); await c.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
