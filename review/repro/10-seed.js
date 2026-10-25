// node 10-seed.js <players> <key>   : builds bench/seed.js state and saves it with the real store (key = DB row key)
const N = +process.argv[2], KEY = process.argv[3] || 'n' + N, APP = '/home/user/upcoming/dhk-predicts-features/app';
const { createStore } = require(APP + '/lib/pgstore.js'), Core = require(APP + '/core.js');
(async () => {
  let t = Date.now(); const st = require(APP + '/bench/seed.js')(N); console.log('seed state built', Date.now() - t, 'ms; json MB', (JSON.stringify(st).length / 1048576).toFixed(1));
  const store = createStore({ url: 'postgres://t:t@localhost:54410/postgres', key: KEY, seed: () => Core.seed(Date.now()) });
  t = Date.now(); await store.transact(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, st); }); console.log('first transact (legacy -> shards)', Date.now() - t, 'ms');
  t = Date.now(); await store.transact(d => { d.touch = 1; }); console.log('second transact', Date.now() - t, 'ms');
  await store.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
