// (1) a reader on the same instance sees UNCOMMITTED state of a write that is later killed (backend terminated before commit)
console.log = (...a) => require('fs').writeSync(1, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
// (2) the killed write: HTTP result, DB state, cache recovery
// (3) poison input: "\u0000" in any text is legal JSON but Postgres jsonb rejects it => every such write 500s and drops the whole cache (full reload)
'use strict';
const { startPg, load } = require('./10-lib.js');
const areq = require('module').createRequire('/home/user/upcoming/dhk-predicts-features/app/x.js');
(async () => {
  const pg = areq('pg'); const cq = pg.Client.prototype.query; let gate = null;
  pg.Client.prototype.query = async function (text, ...rest) {
    const t = typeof text === 'string' ? text : (text && text.text) || '';
    if (gate && (process.env.MODE === 'inflight' ? /^insert into app_shards/ : /^update app_state set data/).test(t)) { const g = gate; gate = null; this.processID && (g.pid = this.processID); g.hit(); await g.p; }
    return cq.call(this, text, ...rest);
  };
  // Without this, a lost connection on a CHECKED-OUT client is an unhandled 'error' event and kills the process (finding F2).
  // FIXERR=1 simulates the one-line fix (c.on('error', ...)) so the remaining behaviour can be examined.
  if (process.env.FIXERR) { const pc = pg.Pool.prototype.connect; pg.Pool.prototype.connect = function (...a) { const p = pc.apply(this, a); return p && p.then ? p.then(cl => { cl.on('error', () => {}); return cl; }) : p; }; }
  const P = await startPg('crash'); const { Core, createStore, H, Client } = load(); process.env.ADMIN_PHONES = '01711000000';
  const A = createStore({ url: P.url, key: 'rival-a', seed: () => Core.seed(Date.now()) });
  const call = (name, body, token, method = 'POST') => H.handleApi(A, { method, name, body: body || {}, token, ua: 'x', country: 'GB', ip: '1.1.1.1' });
  const quiet = console.error; console.error = () => {};
  const tok = (await call('auth', { mode: 'signup', phone: '+447800000001', pin: 'secret12', name: 'P1', adult: true, consent: true }))[1].token;
  const open = (await call('home', {}, null, 'GET'))[1].markets.filter(m => m.status === 'open').map(m => m.id);
  const c = new Client({ connectionString: P.url }); c.on('error', () => {}); await c.connect();
  const mkGate = () => { let hit, rel; const h = new Promise(r => (hit = r)), p = new Promise(r => (rel = r)); return { p, hit, h, rel }; };
  // buy parked just before the UPDATE app_state / COMMIT
  const g = gate = mkGate(); const w = call('buy', { id: open[0], side: 'y', amount: 100 }, tok); await g.h; if (process.env.D) console.log('gate hit');
  const seen = (await call('me', {}, tok, 'GET'))[1].me.pts;
  if (process.env.MODE === 'inflight') { // block the writer's next query on a table lock, then kill its backend while the query is running
    const l = new Client({ connectionString: P.url }); l.on('error', () => {}); await l.connect(); await l.query('begin'); await l.query("update app_shards set data = data where key='rival-a' and coll='users'");
    if (process.env.D) console.log('locked'); g.rel(); await new Promise(r => setTimeout(r, 300));
    await c.query('select pg_terminate_backend(pid) from pg_stat_activity where pid <> pg_backend_pid() and pid <> $1 and wait_event_type = \'Lock\'', [(await l.query('select pg_backend_pid() p')).rows[0].p]);
    await l.query('rollback').catch(() => {}); await l.end().catch(() => {});
  } else await c.query('select pg_terminate_backend(pid) from pg_stat_activity where pid <> pg_backend_pid() and state like \'idle in transaction%\'');
  if (process.env.D) console.log('killed'); g.rel(); const res = await w;
  const after = (await call('me', {}, tok, 'GET'))[1].me.pts, dbpts = (await c.query("select data->>'pts' p from app_shards where key='rival-a' and coll='users' and data->>'name'='P1'")).rows[0].p;
  console.error = quiet;
  console.log('(1) a concurrent read saw pts =', seen, '(uncommitted buy of 100) | killed write returned', res[0], JSON.stringify(res[1]), '| pts after =', after, '| DB pts =', dbpts);
  // (3) poison
  let ms = [], codes = [];
  const t0 = Date.now(); const r = await call('feedback', { text: 'hello \u0000 world' }, null);
  console.log('(3) feedback with a NUL character as a guest: HTTP', r[0], JSON.stringify(r[1]));
  const reloads = []; let loads = 0; const orig = pg.Client.prototype.query;
  pg.Client.prototype.query = function (text, ...rest) { const t = typeof text === 'string' ? text : (text && text.text) || ''; if (/from app_shards where key = \$1 and not deleted/.test(t)) loads++; return orig.call(this, text, ...rest); };
  console.error = () => {};
  for (let i = 0; i < 5; i++) { await call('feedback', { text: 'bad \u0000 ' + i }, null); await call('home', {}, null, 'GET'); }
  console.error = quiet; console.log('    5 poison requests + 5 reads caused', loads, 'full state reloads (a good cache causes 0)');
  await c.end(); await A.end(); await P.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
