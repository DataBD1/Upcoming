// What the rollback copy costs at N players: the write that makes one due must not wait for it.
//   node bench/snapshot.js 10000        (non-root, after npm install; LAT_MS adds database latency)
'use strict';
require('./latency.js');
const fs = require('fs'), os = require('os'), path = require('path');
const N = +process.argv[2] || 10000;
const EmbeddedPostgres = require('embedded-postgres').default;
(async () => {
  const port = +process.env.PGPORT_BENCH || 54337;
  const pg = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sn-')), user: 't', password: 't', port, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = `postgres://t:t@localhost:${port}/postgres`; process.env.POSTGRES_URL = url; process.env.ADMIN_PHONES = '01711000000';
  const Core = require('../core.js'), { createStore } = require('../lib/pgstore.js'), { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const store = createStore({ url, key: 'k', seed: () => Core.seed(Date.now()), snapshotEveryMs: 1 });
    const st = require('./seed.js')(N); await store.transact(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, st); }); await store.flush();
    const time = async f => { const t = process.hrtime.bigint(); await f(); return Number(process.hrtime.bigint() - t) / 1e6; };
    const lag = []; const iv = setInterval(() => { const t = Date.now(); setImmediate(() => lag.push(Date.now() - t)); }, 5);
    const w = await time(() => store.transact(s => { s.feedback = s.feedback || []; s.feedback.push({ uid: 'x', text: 'snapshot bench', at: Date.now() }); }));
    const t0 = Date.now(); await store.flush(); const snap = Date.now() - t0; clearInterval(iv);
    const size = (await pool.query("select pg_column_size(data) b from app_state_history where key = 'k' order by id desc limit 1")).rows[0].b;
    console.log(`${N} players: the write that took the copy ${w.toFixed(0)} ms (a copy was due), copy finished ${snap} ms later in the database, stored ${(size / 1048576).toFixed(2)} MB, worst event-loop stall ${Math.max(0, ...lag)} ms`);
    await store.end();
  } finally { await pool.end(); await pg.stop(); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
