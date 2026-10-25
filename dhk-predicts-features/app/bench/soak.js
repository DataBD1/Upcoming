// Steady traffic at a fixed arrival rate (open loop, so queueing shows up) against N players and several server copies.
//   node bench/soak.js <players> <requests/s> <seconds> <server copies>     e.g. node bench/soak.js 10000 60 40 3
// Mix: 55% home, 15% market page, 8% leaders, 14% buy, 3% daily top-up, 2% feedback, 1% login, 2% session check (me).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const [N, RATE, SECS, INST] = [10000, 60, 40, 3].map((d, i) => +process.argv[2 + i] || d);
const EmbeddedPostgres = require('embedded-postgres').default;
(async () => {
  const pg = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sk-')), user: 't', password: 't', port: 54335, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = 'postgres://t:t@localhost:54335/postgres'; process.env.POSTGRES_URL = url; process.env.ADMIN_PHONES = '01711000000';
  const Core = require('../core.js'), { createStore } = require('../lib/pgstore.js'), { handleApi } = require('../lib/handler.js');
  const stores = Array.from({ length: INST }, () => createStore({ url, key: 'rival-a', seed: () => Core.seed(Date.now()) }));
  try {
    const st = require('./seed.js')(N); await stores[0].transact(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, st); });
    let rr = 0; const call = (name, body, token, method = 'POST') => handleApi(stores[rr++ % INST], { method, name, body: body || {}, token, ua: 'b', country: 'GB', ip: '9.9.9.9' });
    const A = 40, tokens = [];
    for (let i = 0; i < A; i++) tokens.push((await call('auth', { mode: 'signup', phone: '+4478' + String(i).padStart(8, '0'), pin: 'secret12', name: 'A' + i, adult: true, consent: true, device: 'b' + i }))[1].token);
    const open = (await call('home', {}, null, 'GET'))[1].markets.filter(m => m.status === 'open').map(m => m.id);
    const MIX = [['home', 55], ['market', 15], ['leaders', 8], ['buy', 14], ['bonus', 3], ['feedback', 2], ['login', 1], ['me', 2]];
    const pick = () => { let r = Math.random() * 100; for (const [n, w] of MIX) if ((r -= w) < 0) return n; return 'home'; };
    const stats = {}; let sent = 0, inflight = 0, peak = 0;
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
      } catch (e) { res = [500, { error: String(e.message) }]; }
      inflight--;
      const s = stats[n] ||= { ms: [], bad: 0, refused: 0, err: {} };
      s.ms.push(Number(process.hrtime.bigint() - t) / 1e6);
      if (res[0] >= 500) { s.bad++; s.err[JSON.stringify(res[1]).slice(0, 80)] = 1; } else if (res[0] >= 400) s.refused++; // 4xx = a normal "no" (bonus_taken, too_big, ...)
    };
    const t0 = Date.now(), jobs = [];
    await new Promise(done => { const tick = setInterval(() => { if (Date.now() - t0 > SECS * 1000) { clearInterval(tick); done(); return; } const due = Math.floor((Date.now() - t0) / 1000 * RATE) - jobs.length; for (let k = 0; k < due; k++) jobs.push(run(pick())); }, 5); });
    await Promise.all(jobs);
    const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
    console.log(`${N} players, ${INST} server copies, ${RATE} req/s for ${SECS}s => ${jobs.length} requests, peak in flight ${peak}`);
    let worst = 0, bad = 0;
    for (const [n] of MIX) { const s = stats[n]; if (!s) continue; s.ms.sort((a, b) => a - b); worst = Math.max(worst, q(s.ms, .95)); bad += s.bad;
      console.log(n.padEnd(10), String(s.ms.length).padStart(5), 'req  p50', q(s.ms, .5).toFixed(0).padStart(5), ' p95', q(s.ms, .95).toFixed(0).padStart(5), ' p99', q(s.ms, .99).toFixed(0).padStart(5), ' ms  server errors', s.bad, ' refused', s.refused, Object.keys(s.err).join(' ')); }
    console.log(bad ? 'FAIL: server errors' : 'no server errors', '| slowest p95', worst.toFixed(0), 'ms');
    process.exitCode = bad ? 1 : 0;
  } finally { for (const x of stores) await x.end(); await pg.stop(); }
  process.exit(process.exitCode || 0);
})().catch(e => { console.error(e); process.exit(1); });
