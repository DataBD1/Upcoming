// Resolve a market held by ~half of all players (bench/seed.js: every even player holds 2 markets) and see what happens to the main row,
// the write time, and the cost of every later write.   node 10-resolve.js <key>
const APP = '/home/user/upcoming/dhk-predicts-features/app', key = process.argv[2];
const { createStore } = require(APP + '/lib/pgstore.js'), Core = require(APP + '/core.js'), H = require(APP + '/lib/handler.js');
const { Client } = require('module').createRequire(APP + '/x.js')('pg');
(async () => {
  process.env.ADMIN_PHONES = '01711000000';
  const store = createStore({ url: 'postgres://t:t@localhost:54410/postgres', key, seed: () => ({}) });
  const c = new Client({ connectionString: 'postgres://t:t@localhost:54410/postgres' }); await c.connect();
  const mainKB = async () => ((await c.query('select length(data::text) n from app_state where key=$1', [key])).rows[0].n / 1024).toFixed(0) + ' KB';
  const call = (name, body, token, method = 'POST') => H.handleApi(store, { method, name, body: body || {}, token, ua: 'x', country: 'GB', ip: '1.1.1.1' });
  const tok = (await call('auth', { mode: 'signup', phone: '01711000000', pin: 'adminpin1', name: 'Admin', adult: true, consent: true }))[1].token;
  const home = (await call('home', {}, tok, 'GET'))[1]; const open = home.markets.filter(m => m.status === 'open').map(m => m.id);
  console.log(key, 'main row before:', await mainKB());
  let t = Date.now(); let r = await call('buy', { id: open[0], side: 'y', amount: 5 }, tok); console.log('first write of the week (rollWeek writes every player):', Date.now() - t, 'ms', r[0]);
  console.log('main row after week roll:', await mainKB());
  for (let i = 0; i < 2; i++) { t = Date.now(); r = await call('resolve', { id: open[i], outcome: 'y' }, tok); console.log('resolve market', open[i], Date.now() - t, 'ms', r[0], JSON.stringify(r[1]).slice(0, 60), '| main row now', await mainKB()); }
  t = Date.now(); await call('bonus', {}, tok); console.log('a daily top-up after that:', Date.now() - t, 'ms (rewrites the whole main row)');
  const sz = (await c.query("select (select count(*) from app_shards where key=$1 and v=(select version from app_state where key=$1)) n", [key])).rows[0].n; console.log('shard rows in last write:', sz);
  console.log('per resolved market with this many holders, main row grows by ~', 'see above');
  await store.end(); await c.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
