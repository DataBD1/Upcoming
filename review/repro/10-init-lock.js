// Every cold start runs init(): `alter table app_shards add column if not exists ...` x3 + create index if not exists. ALTER TABLE takes ACCESS EXCLUSIVE
// even when the column already exists, so it queues behind any open transaction that touched app_shards and, while queued, BLOCKS every other query on that table.
const APP = '/home/user/upcoming/dhk-predicts-features/app', { createStore } = require(APP + '/lib/pgstore.js');
const { Client } = require('module').createRequire(APP + '/x.js')('pg');
const url = 'postgres://t:t@localhost:54410/postgres', KEY = 'init' + process.pid;
(async () => {
  const warm = createStore({ url, key: KEY, seed: () => ({ v: 4 }) }); await warm.read(); await warm.end(); // tables exist
  const mkc = async () => { const c = new Client({ connectionString: url }); c.on('error', () => {}); await c.connect(); return c; };
  const open = await mkc(), probe = await mkc();
  await open.query('begin'); await open.query('select count(*) from app_shards where key = $1', [KEY]); // stands in for any in-flight request / long write transaction
  const t0 = Date.now();
  const cold = createStore({ url, key: KEY, seed: () => ({ v: 4 }) }); const coldDone = cold.read().then(() => Date.now() - t0);
  await new Promise(r => setTimeout(r, 300));
  const tp = Date.now(); const probeDone = probe.query('select 1 from app_shards where key = $1 limit 1', [KEY]).then(() => Date.now() - tp);
  await new Promise(r => setTimeout(r, 2500)); await open.query('commit'); // the "long transaction" ends after ~2.8 s
  console.log('cold start finished after', await coldDone, 'ms; an ordinary SELECT on app_shards issued 300 ms later was blocked for', await probeDone, 'ms (normal: <5 ms)');
  await cold.end(); await open.end(); await probe.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
