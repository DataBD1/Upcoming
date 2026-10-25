// node --expose-gc 10-mem.js <key>   : one fresh server copy: cold start time, heap, RSS, no-op write cost, snapshot (every 10 min) cost
const APP = '/home/user/upcoming/dhk-predicts-features/app', KEY = process.argv[2];
const { createStore } = require(APP + '/lib/pgstore.js'), Core = require(APP + '/core.js'), { monitorEventLoopDelay } = require('perf_hooks');
const mb = x => (x / 1048576).toFixed(0) + ' MB';
(async () => {
  global.gc(); const base = process.memoryUsage();
  const store = createStore({ url: 'postgres://t:t@localhost:54410/postgres', key: KEY, seed: () => ({}) });
  let t = Date.now(); await store.read(); const cold = Date.now() - t; // includes init + full load
  global.gc(); const m = process.memoryUsage();
  const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
  const h = monitorEventLoopDelay({ resolution: 5 }); h.enable();
  t = Date.now(); await store.transact(() => {}); const noop = Date.now() - t;
  skew += 11 * 60e3; // TTL expiry => full reload on next request
  t = Date.now(); await store.read(); const reload = Date.now() - t;
  skew += 11 * 60e3; t = Date.now(); await store.transact(() => {}); const snapwrite = Date.now() - t; // reload + snapshot (history row) + write
  t = Date.now(); await store.transact(() => {}); const noop2 = Date.now() - t;
  skew += 11 * 60e3; global.gc();
  // snapshot with a warm cache: skew less than TTL is impossible (snapshot every 10min == TTL), so measure on a cache loaded just now
  const m2 = process.memoryUsage(); h.disable();
  console.log(JSON.stringify({ key: KEY, coldStartMs: cold, heapUsed: mb(m.heapUsed - base.heapUsed), rss: mb(m.rss), noopWriteMs: noop, ttlReloadMs: reload, reloadPlusSnapshotWriteMs: snapwrite, noopWrite2Ms: noop2, heapAfterMax: mb(m2.heapUsed), maxEventLoopBlockMs: +(h.max / 1e6).toFixed(0) }));
  await store.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
