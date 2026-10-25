// Adapted copy of bench/soak.js: runs against the shared embedded Postgres on 54410 (10-pghold.js), optional simulated DB latency (LAT ms per round trip),
// optional TTL expiry every 30 s (SKEWTTL=1), counts HTTP 5xx AND pg error codes returned as 4xx, and at the END compares every server copy's cache to the DB.
//   node 10-soak.js <players> <req/s> <seconds> <copies>      env: LAT=10 SKEWTTL=1 WRITEHEAVY=1
'use strict';
const APP = '/home/user/upcoming/dhk-predicts-features/app';
const [N, RATE, SECS, INST] = [10000, 60, 40, 3].map((d, i) => +process.argv[2 + i] || d);
const { performance, monitorEventLoopDelay } = require('perf_hooks');
if (+process.env.LAT) require('./10-lib.js').addLatency(+process.env.LAT);
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
const url = 'postgres://t:t@localhost:54410/postgres', KEY = 'soak' + N + '_' + process.pid;
const Core = require(APP + '/core.js'), { createStore, loadFull, SHARDED } = require(APP + '/lib/pgstore.js'), { handleApi } = require(APP + '/lib/handler.js');
const { Pool } = require('module').createRequire(APP + '/x.js')('pg');
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
(async () => {
  process.env.ADMIN_PHONES = '01711000000';
  const stores = Array.from({ length: INST }, () => createStore({ url, key: KEY, seed: () => Core.seed(Date.now()) }));
  const quietErr = {}; const ce = console.error; console.error = (...a) => { const k = String(a[0] && a[0].message || a[0]).slice(0, 90); quietErr[k] = (quietErr[k] || 0) + 1; };
  const st = require(APP + '/bench/seed.js')(N); await stores[0].transact(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, st); });
  let rr = 0; const call = (name, body, token, method = 'POST') => handleApi(stores[rr++ % INST], { method, name, body: body || {}, token, ua: 'b', country: 'GB', ip: '9.9.9.9' });
  const A = 40, tokens = [];
  for (let i = 0; i < A; i++) tokens.push((await call('auth', { mode: 'signup', phone: '+4478' + String(i).padStart(8, '0'), pin: 'secret12', name: 'A' + i, adult: true, consent: true, device: 'b' + i }))[1].token);
  const open = (await call('home', {}, null, 'GET'))[1].markets.filter(m => m.status === 'open').map(m => m.id);
  const MIX = process.env.WRITEHEAVY ? [['home', 20], ['market', 5], ['leaders', 5], ['buy', 55], ['bonus', 5], ['feedback', 5], ['login', 2], ['me', 3]] : [['home', 55], ['market', 15], ['leaders', 8], ['buy', 14], ['bonus', 3], ['feedback', 2], ['login', 1], ['me', 2]];
  const pick = () => { let r = Math.random() * 100; for (const [n, w] of MIX) if ((r -= w) < 0) return n; return 'home'; };
  const stats = {}; let sent = 0, inflight = 0, peak = 0; const codes = {};
  const run = async n => {
    const i = sent++, tk = tokens[i % A], t = process.hrtime.bigint(); let res;
    inflight++; peak = Math.max(peak, inflight);
    try {
      if (n === 'home') res = await call('home', {}, Math.random() < .7 ? tk : null, 'GET');
      else if (n === 'market') res = await call('market', { id: open[i % open.length] }, tk, 'GET');
      else if (n === 'leaders') res = await call('leaders', {}, tk, 'GET');
      else if (n === 'buy') res = await call('buy', { id: open[i % open.length], side: (i >> 3) % 2 ? 'y' : 'n', amount: 3 }, tk);
      else if (n === 'bonus') res = await call('bonus', {}, tk);
      else if (n === 'feedback') res = await call('feedback', { text: 'soak ' + i }, tk);
      else if (n === 'login') res = await call('auth', { mode: 'login', phone: '+4478' + String(i % A).padStart(8, '0'), pin: 'secret12' });
      else res = await call('me', {}, tk, 'GET');
    } catch (e) { res = [599, { error: String(e.message) }]; }
    inflight--;
    const s = stats[n] ||= { ms: [], bad: 0, refused: 0 };
    s.ms.push(Number(process.hrtime.bigint() - t) / 1e6);
    if (res[0] >= 500) { s.bad++; const k = res[0] + ' ' + JSON.stringify(res[1]).slice(0, 60); codes[k] = (codes[k] || 0) + 1; }
    else if (res[0] >= 400) { s.refused++; const e = res[1] && res[1].error; if (/^[0-9A-Z]{5}$/.test(e) || /ECONN/.test(e)) { codes['4xx-DB:' + e] = (codes['4xx-DB:' + e] || 0) + 1; } }
  };
  const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
  const t0 = realNow(), jobs = []; let lastSkew = realNow();
  await new Promise(done => { const tick = setInterval(() => {
    if (realNow() - t0 > SECS * 1000) { clearInterval(tick); done(); return; }
    if (process.env.SKEWTTL && realNow() - lastSkew > 30000) { skew += 11 * 60e3; lastSkew = realNow(); }
    const due = Math.floor((realNow() - t0) / 1000 * RATE) - jobs.length; for (let k = 0; k < due; k++) jobs.push(run(pick())); }, 5); });
  await Promise.all(jobs); loop.disable();
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  console.log(`${N} players, ${INST} copies, ${RATE} req/s target for ${SECS}s${process.env.LAT ? ', LAT ' + process.env.LAT + ' ms/round trip' : ''}${process.env.SKEWTTL ? ', TTL expiry every 30 s' : ''} => ${jobs.length} requests in ${((realNow() - t0) / 1000).toFixed(0)} s (achieved ${(jobs.length / ((realNow() - t0) / 1000)).toFixed(0)}/s), peak in flight ${peak}, event-loop max delay ${(loop.max / 1e6).toFixed(0)} ms`);
  let worst = 0, bad = 0;
  for (const [n] of MIX) { const s = stats[n]; if (!s) continue; s.ms.sort((a, b) => a - b); worst = Math.max(worst, q(s.ms, .95)); bad += s.bad;
    console.log(n.padEnd(9), String(s.ms.length).padStart(6), 'req p50', q(s.ms, .5).toFixed(0).padStart(6), 'p95', q(s.ms, .95).toFixed(0).padStart(6), 'p99', q(s.ms, .99).toFixed(0).padStart(6), 'max', s.ms[s.ms.length - 1].toFixed(0).padStart(6), 'ms | 5xx', s.bad, '4xx', s.refused); }
  console.log('slowest p95', worst.toFixed(0), 'ms | 5xx total', bad, JSON.stringify(codes), '| logged:', JSON.stringify(quietErr));
  // end-of-run consistency: every server copy vs the database
  console.error = ce; const pool = new Pool({ connectionString: url, max: 1 }); pool.on('error', () => {});
  const c = await pool.connect(); await c.query('begin isolation level repeatable read read only'); const db = await loadFull(c, KEY, false); await c.query('commit'); c.release();
  let div = 0; const detail = [];
  for (let i = 0; i < INST; i++) { const s = await stores[i].read();
    for (const cl of SHARDED) { const A_ = s[cl], B_ = db.state[cl]; const ks = new Set([...Object.keys(A_), ...Object.keys(B_)]); for (const k of ks) if (canon(A_[k]) !== canon(B_[k])) { div++; if (detail.length < 3) detail.push(`copy ${i} ${cl}/${k}`); } } }
  console.log('CONSISTENCY after run: cache keys differing from the database across all copies =', div, detail.join('; '));
  await pool.end(); for (const s of stores) await s.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
