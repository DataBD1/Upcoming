// Per-request cost with no concurrency, split into phases: node bench/prof.js 10000 (non-root, after npm install)
'use strict';
require('./latency.js'); // LAT_MS=10 adds network latency to every database round trip
const fs = require('fs'), os = require('os'), path = require('path');
const N = +process.argv[2] || 10000;
const EmbeddedPostgres = require('embedded-postgres').default;
(async () => {
  const pg = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pf-')), user: 't', password: 't', port: 54333, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = 'postgres://t:t@localhost:54333/postgres'; process.env.POSTGRES_URL = url;
  const { createStore, loadFull } = require('../lib/pgstore.js'), { Pool } = require('pg');
  const store = createStore({ url, key: 'k', seed: () => ({}) }), pool = new Pool({ connectionString: url, max: 1 });
  const st = require('./seed.js')(N);
  await store.transact(d => { Object.assign(d, st); });
  const T = async (label, f, n = 10) => { const a = []; for (let i = 0; i < n; i++) { const t = process.hrtime.bigint(); await f(); a.push(Number(process.hrtime.bigint() - t) / 1e6); } a.sort((x, y) => x - y); console.log(label.padEnd(34), 'p50', a[n >> 1].toFixed(1).padStart(7), 'ms'); };
  await T('select main row only', () => pool.query("select data from app_state where key='k'"));
  await T('select all shards', () => pool.query("select coll,k,data from app_shards where key='k'"));
  await T('loadFull (main + shards + parse)', () => loadFull(pool, 'k', false));
  await T('store.read()', () => store.read());
  const full = await store.read();
  await T('JSON.stringify every shard', async () => { for (const c of ['sessions', 'pos', 'log', 'attempts']) for (const k in full[c]) JSON.stringify(full[c][k]); });
  await T('store.transact(no-op)', () => store.transact(() => {}));
  await T('store.transact(1 pos change)', () => store.transact(s => { const u = Object.keys(s.pos)[0]; const m = Object.keys(s.pos[u])[0]; s.pos[u][m].spent += 0.01; }));
  console.log('main row KB', ((await pool.query("select pg_column_size(data) b from app_state where key='k'")).rows[0].b / 1024).toFixed(0), '| events', (full.events || []).length);
  await pool.end(); await store.end(); await pg.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
