// 100 concurrent writers on ONE server copy (pool max 5), no simulated latency, and a reader sampling latency at the same time.
// node 10-pool.js <key> [writers=100] [latency ms]
const APP = '/home/user/upcoming/dhk-predicts-features/app', KEY = process.argv[2] || 'n10000', W = +process.argv[3] || 100;
if (+process.argv[4]) require('./10-lib.js').addLatency(+process.argv[4]);
const { createStore } = require(APP + '/lib/pgstore.js'), H = require(APP + '/lib/handler.js');
(async () => {
  process.env.ADMIN_PHONES = '01711000000';
  const s = createStore({ url: 'postgres://t:t@localhost:54410/postgres', key: KEY, seed: () => ({}) });
  const call = (name, body, token, method = 'POST') => H.handleApi(s, { method, name, body: body || {}, token, ua: 'x', country: 'GB', ip: '1.1.1.1' });
  const toks = []; for (let i = 0; i < 20; i++) toks.push((await call('auth', { mode: 'signup', phone: '+4479' + process.pid + String(i).padStart(2, '0'), pin: 'secret12', name: 'W' + i, adult: true, consent: true }))[1].token);
  const open = (await call('home', {}, null, 'GET'))[1].markets.find(m => m.status === 'open').id;
  const rl = []; let stop = false;
  const reader = (async () => { while (!stop) { const t = process.hrtime.bigint(); await call('home', {}, toks[0], 'GET'); rl.push(Number(process.hrtime.bigint() - t) / 1e6); await new Promise(r => setTimeout(r, 20)); } })();
  const t0 = Date.now(); const wl = [];
  const res = await Promise.all(Array.from({ length: W }, async (_, i) => { const t = process.hrtime.bigint(); const r = await call('buy', { id: open, side: i % 2 ? 'y' : 'n', amount: 1 }, toks[i % 20]); wl.push(Number(process.hrtime.bigint() - t) / 1e6); return r[0]; }));
  stop = true; await reader; const el = Date.now() - t0; rl.sort((a, b) => a - b); wl.sort((a, b) => a - b);
  console.log(`${W} concurrent buys on one copy: all done in ${el} ms (${(W / el * 1000).toFixed(0)} writes/s), statuses ${JSON.stringify(res.reduce((o, x) => (o[x] = (o[x] || 0) + 1, o), {}))}, write p50 ${wl[W >> 1].toFixed(0)} max ${wl[W - 1].toFixed(0)} ms | reads during: n=${rl.length} p50 ${rl[rl.length >> 1].toFixed(0)} max ${rl[rl.length - 1].toFixed(0)} ms (idle read ~1 ms)`);
  await s.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
