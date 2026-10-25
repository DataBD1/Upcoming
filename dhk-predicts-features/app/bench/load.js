// Load test: fill the Postgres-backed API with N players, then time the real operations.
//   node bench/load.js 10000        (needs `npm install`; run as a non-root user, Postgres refuses root)
// Players are added to the state directly (cheap password hashes), so seeding 10k takes seconds; a few real
// accounts are then signed up through the API (real scrypt) and used to time reads and writes.
'use strict';
require('./latency.js'); // LAT_MS=10 adds network latency to every database round trip
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const N = +process.argv[2] || 10000, CONC = +process.argv[3] || 10, INST = +process.argv[4] || 1; // INST = server copies sharing the database
const EmbeddedPostgres = require('embedded-postgres').default;
const Core = require('../core.js');

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
async function timed(label, reps, conc, fn) {
  const ms = []; let next = 0, errs = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < reps) { const i = next++, t = process.hrtime.bigint(); try { await fn(i); } catch (e) { errs++; if (!timed.lastErr) { timed.lastErr = String(e.message).slice(0, 120); console.log('  first error:', timed.lastErr); } } ms.push(Number(process.hrtime.bigint() - t) / 1e6); }
  }));
  ms.sort((a, b) => a - b);
  const row = { op: label, n: reps, conc, p50: +pct(ms, .5).toFixed(0), p95: +pct(ms, .95).toFixed(0), max: +ms[ms.length - 1].toFixed(0), perSec: +(reps / ((Date.now() - t0) / 1000)).toFixed(1), errs };
  console.log(`${label.padEnd(22)} p50 ${String(row.p50).padStart(5)} ms  p95 ${String(row.p95).padStart(5)} ms  max ${String(row.max).padStart(5)} ms  ${String(row.perSec).padStart(6)}/s  errs ${errs}`);
  return row;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-')), port = 54332;
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 't', password: 't', port, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  process.env.POSTGRES_URL = `postgres://t:t@localhost:${port}/postgres`; process.env.ADMIN_PHONES = '01711000000';
  const { createStore } = require('../lib/pgstore.js'), { handleApi } = require('../lib/handler.js');
  const stores = Array.from({ length: INST }, () => createStore({ url: process.env.POSTGRES_URL, key: 'rival-a', seed: () => Core.seed(Date.now()) })), store = stores[0];
  let rr = 0; const pick = () => stores[rr++ % INST];
  try {
    let t = Date.now();
    const st = require('./seed.js')(N), open = st.markets.filter(m => m.status === 'open').map(m => m.id);
    await store.transact(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, st); });
    const full = await store.read();
    console.log(`${INST} server cop${INST > 1 ? 'ies' : 'y'}, concurrency ${CONC}\nseeded ${N} players in ${((Date.now() - t) / 1000).toFixed(1)} s: ${Object.keys(full.users).length} users, ${Object.keys(full.pos).length} position rows, ${Object.keys(full.sessions).length} sessions, ${((await store.read({ events: true })).events || []).length} events`);
    const { Pool } = require('pg'); const q = new Pool({ connectionString: process.env.POSTGRES_URL, max: 1 });
    const sz = (await q.query("select (select pg_column_size(data) from app_state where key='rival-a') main_bytes, (select count(*) from app_shards) shard_rows, (select sum(pg_column_size(data)) from app_shards) shard_bytes")).rows[0];
    console.log(`main row ${(sz.main_bytes / 1024).toFixed(0)} KB, ${sz.shard_rows} shard rows, ${(sz.shard_bytes / 1024).toFixed(0)} KB in shards\n`);
    await q.end();

    // ---- real accounts for timing
    const call = (name, body, token, method = 'POST') => handleApi(pick(), { method, name, body: body || {}, token, ua: 'bench', country: 'GB', ip: '9.9.9.9' });
    const tokens = [];
    for (let i = 0; i < 20; i++) { const [s, r] = await call('auth', { mode: 'signup', phone: '+4478' + String(i).padStart(8, '0'), pin: 'secret12', name: 'A' + i, adult: true, consent: true, device: 'b' + i }); if (s !== 200) throw new Error('signup ' + JSON.stringify(r)); tokens.push(r.token); }
    const mk = open[0], R = [];
    R.push(await timed('home (guest)', 60, CONC, () => call('home', {}, null, 'GET')));
    R.push(await timed('home (signed in)', 60, CONC, i => call('home', {}, tokens[i % 20], 'GET')));
    R.push(await timed('market page', 60, CONC, i => call('market', { id: mk }, tokens[i % 20], 'GET')));
    R.push(await timed('leaders', 30, CONC, i => call('leaders', {}, tokens[i % 20], 'GET')));
    R.push(await timed('buy', 60, CONC, async i => { const [s, r] = await call('buy', { id: open[i % open.length], side: Math.floor(i / open.length) % 2 ? 'y' : 'n', amount: 5 }, tokens[i % 20]); if (s !== 200) throw new Error(JSON.stringify(r)); }));
    R.push(await timed('daily top-up', 20, CONC, i => call('bonus', {}, tokens[i % 20])));
    R.push(await timed('login (scrypt)', 20, CONC, i => call('auth', { mode: 'login', phone: '+4478' + String(i % 20).padStart(8, '0'), pin: 'secret12' })));
    R.push(await timed('feedback write', 40, CONC, i => call('feedback', { text: 'hello there ' + i }, tokens[i % 20])));
    fs.writeFileSync(process.env.BENCH_OUT || path.join(os.tmpdir(), 'bench.json'), JSON.stringify({ N, seed: sz, results: R }, null, 1));
  } finally { for (const x of stores) await x.end(); await pg.stop(); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
