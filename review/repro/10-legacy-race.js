// Two cold server copies race the first write on a LEGACY single-blob row, while a third keeps reading; then a restore (blob) while they run.
// Expect: exactly one migration, no lost write, every copy ends identical to the DB.  Uses the shared PG on 54410 (10-pghold.js).
const APP = '/home/user/upcoming/dhk-predicts-features/app', { createStore, loadFull, SHARDED } = require(APP + '/lib/pgstore.js');
const { Client } = require('module').createRequire(APP + '/x.js')('pg');
const url = 'postgres://t:t@localhost:54410/postgres', KEY = 'legacy' + process.pid;
const legacy = { v: 4, users: {}, markets: [], pos: {}, sessions: {}, log: {}, auth: {}, attempts: {}, resets: {}, devices: {}, weekstart: {}, groups: {}, counter: 0 };
for (let i = 0; i < 200; i++) legacy.users['u' + i] = { id: 'u' + i, pts: 1000 };
(async () => {
  const c = new Client({ connectionString: url }); c.on('error', () => {}); await c.connect();
  const mk = () => createStore({ url, key: KEY, seed: () => legacy });
  const S = [mk(), mk(), mk(), mk()];
  await S[0].read(); // creates the legacy row
  const errs = [];
  let n = 0;
  // 3 writers each add 20 points to 20 different players concurrently; one reader loops
  let stop = false; const reader = (async () => { while (!stop) { try { const s = await S[3].read(); n++; if (Object.keys(s.users).length !== 200) errs.push('reader saw ' + Object.keys(s.users).length + ' users'); } catch (e) { errs.push('reader: ' + e.message); } } })();
  await Promise.all([0, 1, 2].flatMap(w => Array.from({ length: 20 }, (_, j) => S[w].transact(s => { s.users['u' + (w * 20 + j)].pts += 20; s.counter++; }).catch(e => errs.push('writer ' + w + ': ' + e.message)))));
  stop = true; await reader;
  const db = await loadFull(c, KEY, false);
  const total = Object.values(db.state.users).reduce((t, u) => t + u.pts, 0);
  console.log('reads during race:', n, '| errors:', errs.length, errs.slice(0, 3), '| counter', db.state.counter, '(60 expected) | total pts', total, '(' + (200 * 1000 + 60 * 20) + ' expected)', '| __v', (await c.query('select data->>\'__v\' v from app_state where key=$1', [KEY])).rows[0].v);
  let div = 0; for (const s of S) { const st = await s.read(); for (const cl of SHARDED) for (const k of new Set([...Object.keys(st[cl]), ...Object.keys(db.state[cl])])) if (JSON.stringify(st[cl][k]) !== JSON.stringify(db.state[cl][k])) div++; if (st.counter !== 60) div++; }
  console.log('copies differing from DB:', div);
  for (const s of S) await s.end(); await c.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
