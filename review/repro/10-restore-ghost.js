// Restore drill while instances run (docs/operations.md section 3 SQL). saveFull() HARD-deletes app_shards rows (no tombstones),
// so an instance that was idle through the restore keeps accounts that the restore removed ("ghost" players), until its 10-minute TTL.
// Also: a version that goes DOWN (row.version < cache.version) is treated as "someone wrote" and is never fully reloaded.
'use strict';
const { startPg, load } = require('./10-lib.js');
(async () => {
  const P = await startPg('ghost'); const { Core, createStore, loadFull, H, Client } = load(); process.env.ADMIN_PHONES = '01711000000';
  const mk = () => createStore({ url: P.url, key: 'rival-a', seed: () => Core.seed(Date.now()) });
  const A = mk(), B = mk(), C = mk();
  const call = (s, name, body, token, method = 'POST') => H.handleApi(s, { method, name, body: body || {}, token, ua: 'x', country: 'GB', ip: '1.1.1.1' });
  const su = async (s, i) => (await call(s, 'auth', { mode: 'signup', phone: '+44780000000' + i, pin: 'secret12', name: 'P' + i, adult: true, consent: true }))[1].token;
  await su(A, 1); await call(C, 'home', {}, null, 'GET');
  const c = new Client({ connectionString: P.url }); c.on('error', () => {}); await c.connect();
  const blob = (await loadFull(c, 'rival-a', false)).state;                         // what a backup / history copy holds
  await c.query("insert into app_state_history (key, version, data) values ('rival-a', 1, $1)", [JSON.stringify(blob)]);
  const t2 = await su(A, 2);                                                            // signs up AFTER the backup
  await call(C, 'home', {}, t2, 'GET'); console.log('C (idle) knows player 2 before restore:', !!(await C.read()).auth['+447800000002']);
  await c.query(`update app_state s set data = h.data, version = s.version + 1, updated_at = now() from (select data from app_state_history where key='rival-a' order by id desc limit 1) h where s.key='rival-a'`);
  await call(B, 'feedback', { text: 'first write after restore' });                    // re-shards the restored blob
  const dbAuth = (await c.query("select count(*) n from app_shards where key='rival-a' and coll='auth' and not deleted")).rows[0].n;
  const ghost = (await C.read());
  console.log('DB auth rows after restore:', dbAuth, '| C cache has player 2 account:', !!ghost.auth['+447800000002'], '| C session of player 2 still valid:', (await call(C, 'me', {}, t2, 'GET'))[0]);
  console.log('same token on B (fresh from DB):', (await call(B, 'me', {}, t2, 'GET'))[0], '(401 = removed by the restore)');
  const l = await call(C, 'auth', { mode: 'login', phone: '+447800000002', pin: 'secret12' });
  console.log('login of the removed player on C:', l[0], '=> orphan session written to DB:', (await c.query("select count(*) n from app_shards where key='rival-a' and coll='sessions' and not deleted")).rows[0].n, 'session rows vs', Object.keys(blob.sessions).length, 'expected');
  // version going down
  await c.query("update app_state set version = 2 where key='rival-a'");              // e.g. DB restored from an older dump, or version reset
  await c.query("update app_shards set data = jsonb_set(data,'{name}','\"CHANGED-BY-SQL\"') where key='rival-a' and coll='users' and k in (select k from app_shards where coll='users' limit 1)");
  const u = Object.values((await C.read()).users).map(x => x.name);
  console.log('after version dropped to 2 and a users row changed: C sees changed row?', u.includes('CHANGED-BY-SQL'), '(false = stale cache, no reload for a lower version)');
  await c.end(); await A.end(); await B.end(); await C.end(); await P.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
