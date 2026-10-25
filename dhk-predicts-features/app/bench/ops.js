// Sequential per-operation cost at N players, with how many shard rows each write touched: node bench/ops.js 10000
'use strict';
require('./latency.js'); // LAT_MS=10 adds network latency to every database round trip
const fs = require('fs'), os = require('os'), path = require('path');
const N = +process.argv[2] || 10000;
const EmbeddedPostgres = require('embedded-postgres').default;
(async () => {
  const pg = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'op-')), user: 't', password: 't', port: 54334, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = 'postgres://t:t@localhost:54334/postgres'; process.env.POSTGRES_URL = url; process.env.ADMIN_PHONES = '01711000000';
  const Core = require('../core.js'), { createStore } = require('../lib/pgstore.js'), { handleApi } = require('../lib/handler.js'), { Pool } = require('pg');
  const store = createStore({ url, key: 'rival-a', seed: () => Core.seed(Date.now()) }), pool = new Pool({ connectionString: url, max: 1 });
  const st = require('./seed.js')(N); await store.transact(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, st); });
  const call = (name, body, token, method = 'POST') => handleApi(store, { method, name, body: body || {}, token, ua: 'b', country: 'GB', ip: '9.9.9.9' });
  const tok = []; for (let i = 0; i < 6; i++) tok.push((await call('auth', { mode: 'signup', phone: '+4478' + String(i).padStart(8, '0'), pin: 'secret12', name: 'A' + i, adult: true, consent: true, device: 'b' + i }))[1].token);
  const mainKB = async () => { const r = (await pool.query("select pg_column_size(data) b, length(data::text) t from app_state where key='rival-a'")).rows[0]; return (r.t / 1024).toFixed(0) + ' (stored ' + (r.b / 1024).toFixed(0) + ')'; };
  const ver = async () => +(await pool.query("select version v from app_state where key='rival-a'")).rows[0].v;
  const open = (await call('home', {}, null, 'GET'))[1].markets.find(m => m.status === 'open').id;
  const step = async (label, f, n = 5) => { for (let i = 0; i < n; i++) { const v0 = await ver(), t = process.hrtime.bigint(); const r = await f(i); const ms = Number(process.hrtime.bigint() - t) / 1e6;
    const rows = +(await pool.query("select count(*) n from app_shards where key='rival-a' and v = $1", [v0 + 1])).rows[0].n;
    console.log(label.padEnd(18), ('#' + (i + 1)).padEnd(3), ms.toFixed(1).padStart(8), 'ms', '| shard rows written', String(rows).padStart(5), '| main row text KB', await mainKB(), r && r[0] !== 200 ? '| ' + JSON.stringify(r[1]) : ''); } };
  // New week: the first write records every player's starting score (once a week).
  await store.transact(s => { s.week = { id: '2000-01-01' }; });
  await step('first write of week', i => call('buy', { id: open, side: 'n', amount: 5 }, tok[i]), 1);
  await step('buy', i => call('buy', { id: open, side: 'y', amount: 5 }, tok[i % 6]));
  await step('daily top-up', i => call('bonus', {}, tok[i]));
  await step('feedback', i => call('feedback', { text: 'hello ' + i }, tok[i]));
  await step('login', i => call('auth', { mode: 'login', phone: '+4478' + String(i).padStart(8, '0'), pin: 'secret12' }), 3);
  const t = process.hrtime.bigint(); await call('leaders', {}, tok[0], 'GET'); console.log('leaders'.padEnd(18), '   ', (Number(process.hrtime.bigint() - t) / 1e6).toFixed(1).padStart(8), 'ms');
  await pool.end(); await store.end(); await pg.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
