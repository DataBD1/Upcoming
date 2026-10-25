// Memory and cold-start cost of one server copy at N players:  node --expose-gc bench/mem.js 10000   (non-root, after npm install)
// Seeds N light players (a few positions each, bench/seed.js), then starts a fresh store and measures heap after the first read.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const N = +process.argv[2] || 10000;
const EmbeddedPostgres = require('embedded-postgres').default;
(async () => {
  const port = +process.env.PGPORT_BENCH || 54336;
  const pg = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mm-')), user: 't', password: 't', port, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = `postgres://t:t@localhost:${port}/postgres`; process.env.POSTGRES_URL = url;
  const Core = require('../core.js'), { createStore } = require('../lib/pgstore.js');
  try {
    const seeder = createStore({ url, key: 'm', seed: () => Core.seed(Date.now()) });
    const st = require('./seed.js')(N); await seeder.transact(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, st); }); await seeder.end();
    const gc = () => { if (global.gc) { global.gc(); global.gc(); } };
    gc(); const h0 = process.memoryUsage().heapUsed;
    const t0 = Date.now(); const store = createStore({ url, key: 'm', seed: () => Core.seed(Date.now()) }); await store.read(); const cold = Date.now() - t0;
    gc(); const h1 = process.memoryUsage().heapUsed;
    console.log(`${N} players: cold start ${cold} ms (first read, incl. the one-off migration check), heap +${((h1 - h0) / 1048576).toFixed(0)} MB`);
    await store.end();
  } finally { await pg.stop(); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
