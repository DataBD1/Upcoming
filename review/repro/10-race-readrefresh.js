// RACE: a read() that refreshes the cache (delta sync from an OLD snapshot) overlaps a transact() on the SAME instance.
// The read applies older shard rows over what the write already changed in memory, then regresses/sets cache.version.
// Result: the instance's cache silently differs from the database; the next write touching that key writes the stale value back (lost update).
// Latency is simulated with a gate, no timing luck needed.   Run as non-root, see 10-lib.js
'use strict';
const { startPg, load } = require('./10-lib.js');
const areq = require('module').createRequire('/home/user/upcoming/dhk-predicts-features/app/x.js');
(async () => {
  const pg = areq('pg'); const cq = pg.Client.prototype.query;
  let gate = null, held = false;
  pg.Client.prototype.query = async function (text, ...rest) {
    const t = typeof text === 'string' ? text : (text && text.text) || '';
    if (/^begin isolation level repeatable read read only/.test(t)) this.isR = true;
    if (this.isR && gate && /v > \$2/.test(t)) { held = true; await gate.p; }
    if (!this.isR && gate && /^update app_state set data/.test(t)) { gate.release(); await new Promise(r => setTimeout(r, 200)); }
    return cq.call(this, text, ...rest);
  };
  const P = await startPg('race'); const { Core, createStore, loadFull, H, Pool } = load();
  process.env.ADMIN_PHONES = '01711000000';
  const A = createStore({ url: P.url, key: 'main', seed: () => Core.seed(Date.now()) }), B = createStore({ url: P.url, key: 'main', seed: () => Core.seed(Date.now()) });
  const call = (s, name, body, token, method = 'POST') => H.handleApi(s, { method, name, body: body || {}, token, ua: 'x', country: 'GB', ip: '1.1.1.1' });
  const su = async (i) => (await call(A, 'auth', { mode: 'signup', phone: '+44780000000' + i, pin: 'secret12', name: 'P' + i, adult: true, consent: true })); 
  const tok = (await su(1))[1].token;
  const open = (await call(A, 'home', {}, null, 'GET'))[1].markets.filter(m => m.status === 'open').map(m => m.id);
  await call(A, 'buy', { id: open[0], side: 'y', amount: 10 }, tok);       // A and B both cache this
  await call(B, 'home', {}, tok, 'GET');
  await call(B, 'buy', { id: open[1], side: 'y', amount: 20 }, tok);       // B writes the player's rows: A is now stale
  // A: refresh-read starts, its delta query is held; meanwhile A writes the SAME player; the read then finishes.
  let release; gate = { p: new Promise(r => (release = r)), release: () => release() };
  const reader = call(A, 'home', {}, tok, 'GET');
  await new Promise(r => setTimeout(r, 300)); if (!held) throw new Error('gate did not catch the refresh');
  const w = await call(A, 'buy', { id: open[2], side: 'n', amount: 30 }, tok);
  await reader; gate = null;
  const c = new pg.Client({ connectionString: P.url }); c.on('error', () => {}); await c.connect();
  const db = await loadFull(c, 'main', false);
  const uid = Object.keys(db.state.users).find(u => db.state.users[u].name === 'P1');
  const mine = (await A.read());
  const dbPts = db.state.users[uid].pts, cachePts = mine.users[uid].pts;
  console.log('write status', w[0], '| DB pts', dbPts, '| A cache pts', cachePts, '| DB positions', Object.keys(db.state.pos[uid]).length, '| A cache positions', Object.keys(mine.pos[uid]).length);
  const diverged = dbPts !== cachePts || Object.keys(db.state.pos[uid]).length !== Object.keys(mine.pos[uid]).length;
  console.log(diverged ? 'CONFIRMED: A cache differs from the database after a committed write' : 'no divergence');
  // Consequence: the next write by A for this player writes the stale values back.
  const w2 = await call(A, 'buy', { id: open[0], side: 'y', amount: 5 }, tok);
  const db2 = await loadFull(c, 'main', false);
  console.log('after one more buy of 5 on A: DB pts', db2.state.users[uid].pts, '(expected', dbPts - 5, ') DB positions', Object.keys(db2.state.pos[uid]).length, '(expected', Object.keys(db.state.pos[uid]).length, ')');
  console.log(db2.state.users[uid].pts !== dbPts - 5 ? 'CONFIRMED LOST UPDATE: the trade of 30 points on market ' + open[2] + ' vanished from the database' : 'no lost update');
  await c.end(); await A.end(); await B.end(); await P.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
