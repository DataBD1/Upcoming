// Reads call Core.migrate(...) on the SHARED cached state with touch-tracking off. For a sharded database whose main row is still v:2 (or 3 with 01.. keys)
// (phone keys not yet E.164) the first READ renames auth keys in memory only and bumps state.v to 4 in memory; the next WRITE then sees v:4,
// skips the migration, and writes main row v:4 -- the auth shard rows keep the old keys in the database. After a cache reload the accounts are unreachable.
const APP = '/home/user/upcoming/dhk-predicts-features/app', { createStore } = require(APP + '/lib/pgstore.js'), H = require(APP + '/lib/handler.js'), Core = require(APP + '/core.js');
const { Client } = require('module').createRequire(APP + '/x.js')('pg');
const url = 'postgres://t:t@localhost:54410/postgres', KEY = 'mig' + process.pid;
(async () => {
  process.env.ADMIN_PHONES = '01711000000';
  const c = new Client({ connectionString: url }); c.on('error', () => {}); await c.connect();
  const mk = () => createStore({ url, key: KEY, seed: () => Core.seed(Date.now()) });
  const A = mk(); const call = (s, name, body, token, method = 'POST') => H.handleApi(s, { method, name, body: body || {}, token, ua: 'x', country: 'GB', ip: '1.1.1.1' });
  const tok = (await call(A, 'auth', { mode: 'signup', phone: '01712345678', pin: 'secret12', name: 'Old', adult: true, consent: true }))[1].token;
  // make the stored state look like an older (v2) sharded database: main row v:2, auth key in the old local format
  await c.query("update app_state set data = jsonb_set(data, '{v}', '2') where key = $1", [KEY]);
  await c.query("update app_shards set k = '01712345678' where key = $1 and coll = 'auth' and k = '+8801712345678'", [KEY]);
  await c.query("update app_state set version = version + 1 where key = $1", [KEY]);
  const B = mk(); // fresh copy loads the v3 database
  await call(B, 'home', {}, tok, 'GET');                                    // a READ: migrates the cached copy in place
  console.log('after one READ, B cache auth keys:', Object.keys((await B.read()).auth), '| DB auth keys:', (await c.query("select k from app_shards where key=$1 and coll='auth'", [KEY])).rows.map(r => r.k));
  await call(B, 'feedback', { text: 'a write after the read' }, tok);        // a WRITE: main row becomes v:4
  console.log('after one WRITE, DB main v:', (await c.query("select data->>'v' v from app_state where key=$1", [KEY])).rows[0].v, '| DB auth keys:', (await c.query("select k from app_shards where key=$1 and coll='auth' and not deleted", [KEY])).rows.map(r => r.k));
  const C = mk(); const r = await call(C, 'auth', { mode: 'login', phone: '01712345678', pin: 'secret12' });
  console.log('fresh copy login with the same number:', r[0], JSON.stringify(r[1]).slice(0, 60), '(wrong_login = account unreachable)');
  await A.end(); await B.end(); await C.end(); await c.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
