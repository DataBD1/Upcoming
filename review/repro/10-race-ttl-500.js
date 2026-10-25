// RACE: every CACHE_TTL_MS (10 min) each instance does a full reload and sets `cache = null` while requests that already
// passed the `if (cache ...)` check are in flight. Those resume and dereference null => TypeError => HTTP 500 (reads) or a failed write.
//   (a) a read in the fast path (waiting for the one-row version check) when another request triggers the TTL reload
//   (b) a write between its sync() and its use of `cache.state` when a read triggers the TTL reload
'use strict';
const { startPg, load } = require('./10-lib.js');
const areq = require('module').createRequire('/home/user/dhk-predicts-features/app/x.js'.replace('/home/user/dhk','/home/user/upcoming/dhk'));
(async () => {
  const pg = areq('pg'); const cq = pg.Client.prototype.query;
  let gateRead = null, gateW = null, gateLoad = null; const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
  pg.Client.prototype.query = async function (text, ...rest) {
    const t = typeof text === 'string' ? text : (text && text.text) || '';
    if (gateRead && /^select version from app_state/.test(t)) { const g = gateRead; gateRead = null; g.hit(); await g.p; }
    if (gateW && /select max\(saved_at\)/.test(t)) { const g = gateW; gateW = null; g.hit(); await g.p; }
    if (gateLoad && /from app_shards where key = \$1 and not deleted/.test(t)) { const g = gateLoad; gateLoad = null; g.hit(); await g.p; }
    return cq.call(this, text, ...rest);
  };
  const mkGate = () => { let hit, rel; const h = new Promise(r => (hit = r)), p = new Promise(r => (rel = r)); return { p, hit, h, rel }; };
  const P = await startPg('ttl'); const { Core, createStore, H } = load(); process.env.ADMIN_PHONES = '01711000000';
  const A = createStore({ url: P.url, key: 'main', seed: () => Core.seed(Date.now()) });
  const call = (name, body, token, method = 'POST') => H.handleApi(A, { method, name, body: body || {}, token, ua: 'x', country: 'GB', ip: '1.1.1.1' });
  const quiet = console.error; let logged = []; console.error = (...a) => logged.push(String(a[0] && a[0].stack || a[0]).split('\n')[0]);
  const tok = (await call('auth', { mode: 'signup', phone: '+447800000001', pin: 'secret12', name: 'P1', adult: true, consent: true }))[1].token;
  const open = (await call('home', {}, null, 'GET'))[1].markets.filter(m => m.status === 'open').map(m => m.id);
  // (a)
  let g = gateRead = mkGate(); const r1 = call('home', {}, tok, 'GET'); await g.h;          // r1 is inside the fast-path version check
  skew += 11 * 60e3;                                                                          // TTL expires
  const gl = gateLoad = mkGate(); const r2 = call('home', {}, tok, 'GET'); await gl.h;         // r2 is mid full reload: cache === null
  g.rel(); await new Promise(r => setTimeout(r, 100)); gl.rel(); const [x1, x2] = await Promise.all([r1, r2]);
  console.log('(a) reader in flight during TTL reload: status', x1[0], JSON.stringify(x1[1]).slice(0, 60), '| reloader status', x2[0]);
  // (b) writer between sync() and cache.state; a reader then hits TTL
  skew += 11 * 60e3;
  const gw = gateW = mkGate(); const w = call('buy', { id: open[0], side: 'y', amount: 10 }, tok); await gw.h;   // writer has synced (cache valid), now parked
  skew += 11 * 60e3;
  const gl2 = gateLoad = mkGate(); const rd = call('home', {}, tok, 'GET'); await gl2.h;  // reader: TTL expired => cache = null => full reload in progress
  gw.rel(); await new Promise(r => setTimeout(r, 100)); gl2.rel(); const [wr, rr] = await Promise.all([w, rd]);
  console.log('(b) write in flight during a TTL reload: status', wr[0], JSON.stringify(wr[1]), '| reader status', rr[0]);
  console.error = quiet; console.log('errors logged by the handler:', [...new Set(logged)]);
  await A.end(); await P.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
