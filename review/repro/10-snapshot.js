// Cost of the "rollback copy" taken by the first write after every 10 minutes: full JSON.stringify of the state on the event loop,
// then one INSERT of that blob into app_state_history while the global write lock is held.  node 10-snapshot.js <key>
const APP = '/home/user/upcoming/dhk-predicts-features/app', key = process.argv[2];
const { createStore } = require(APP + '/lib/pgstore.js'), { monitorEventLoopDelay } = require('perf_hooks');
const { Client } = require('module').createRequire(APP + '/x.js')('pg');
(async () => {
  const url = 'postgres://t:t@localhost:54410/postgres', c = new Client({ connectionString: url }); await c.connect();
  const s = createStore({ url, key, seed: () => ({}) }); await s.read();
  const time = async (label, f) => { const h = monitorEventLoopDelay({ resolution: 1 }); h.enable(); const t = Date.now(); await f(); const ms = Date.now() - t; h.disable(); console.log(label.padEnd(44), String(ms).padStart(6), 'ms | longest event-loop stall', (h.max / 1e6).toFixed(0), 'ms'); };
  await s.transact(() => {}); // make sure a snapshot exists / reset the clock
  await time('no-op write, no snapshot due', () => s.transact(() => {}));
  await c.query("update app_state_history set saved_at = saved_at - interval '11 minutes' where key = $1", [key]);
  await time('no-op write WITH snapshot (every 10 min)', () => s.transact(() => {}));
  const r = (await c.query("select count(*) n, pg_size_pretty(avg(pg_column_size(data))::bigint) avg_size, pg_size_pretty(sum(pg_column_size(data))::bigint) tot from app_state_history where key = $1", [key])).rows[0];
  console.log('history rows', r.n, 'avg stored size', r.avg_size, '=> 144 snapshots/day =', r.avg_size, 'x 144 per day if writes happen in every 10-minute slot; nothing ever deletes them');
  await s.end(); await c.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
