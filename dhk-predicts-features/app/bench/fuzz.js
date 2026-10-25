// Concurrent fuzz for lib/pgstore.js: random real API actions spread over several store copies (separate caches and pools,
// like separate serverless instances), with PGSTORE_VERIFY on. After every step each copy syncs and its WHOLE cache is
// compared with the database (store.verify()). Any difference, or any HTTP 5xx, fails the run.
//   node bench/fuzz.js [steps=120] [seed=1] [concurrency=6] [instances=3]        run as a non-root user (embedded Postgres)
//   LAT_MS=4 node bench/fuzz.js 120 1 6      with database latency (this is what exposed the original race)
//   for s in $(seq 1 30); do node bench/fuzz.js 120 $s 6 || break; done      the 30-seed gate used for fix 10
'use strict';
require('./latency.js');
const fs = require('fs'), os = require('os'), path = require('path');
const realNow = Date.now;

async function run({ url, key = 'fz', steps = 120, seed = 1, conc = 6, instances = 3, quiet = false }) {
  process.env.PGSTORE_VERIFY = '1'; process.env.ADMIN_PHONES = '01711000000';
  const Core = require('../core.js'), { createStore } = require('../lib/pgstore.js'), H = require('../lib/handler.js');
  let rs = seed; const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  const ri = n => Math.floor(rnd() * n), pick = a => a[ri(a.length)];
  let skew = 0; Date.now = () => realNow() + skew;
  const stores = Array.from({ length: instances }, () => createStore({ url, key, seed: () => Core.seed(Date.now()) }));
  const call = (i, name, body, token, method = 'POST') => H.handleApi(stores[i], { method, name, body: body || {}, token, ua: 'f', country: 'GB', ip: '1.1.1.' + ri(5) });
  const users = [], stats = { n: 0, ok: 0, refused: 0, err500: 0 }, errs = {}, codes = [];
  let admin, diverged = 0, first = null;
  const e0 = console.error; if (quiet) console.error = () => {};
  const act = async () => {
    const i = ri(instances), r = rnd(); let res, label;
    const u = users.length ? pick(users) : null;
    const hm = await call(i, 'home', {}, null, 'GET');
    if (hm[0] >= 500) { stats.n++; stats.err500++; errs['home:' + JSON.stringify(hm[1])] = 1; return 'home500'; }
    const open = hm[1].markets.filter(m => m.status === 'open').map(m => m.id);
    if (!u || r < 0.08) { const ph = '+4478' + String(users.length + 100).padStart(8, '0'); label = 'signup';
      res = await call(i, 'auth', { mode: 'signup', phone: ph, pin: 'secret12', name: 'U' + users.length, adult: true, consent: true, device: 'd' + ri(4) });
      if (res[0] === 200) { const me = (await call(i, 'me', {}, res[1].token, 'GET'))[1]; users.push({ phone: ph, pin: 'secret12', token: res[1].token, uid: me.me.id }); } }
    else if (r < 0.30) { label = 'buy'; res = await call(i, 'buy', { id: pick(open), side: pick(['y', 'n']), amount: 1 + ri(60) }, u.token); }
    else if (r < 0.38) { label = 'sell'; res = await call(i, 'sell', { id: pick(open), side: pick(['y', 'n']), shares: 'all' }, u.token); }
    else if (r < 0.46) { label = 'bonus'; res = await call(i, 'bonus', {}, u.token); }
    else if (r < 0.50) { label = 'rename'; res = await call(i, 'rename', { name: 'N' + ri(1000) }, u.token); }
    else if (r < 0.54) { label = 'feedback'; res = await call(i, 'feedback', { text: 'fb ' + ri(1e6) + (rnd() < .05 ? '\u0000' : '') }, u.token); }
    else if (r < 0.60) { label = 'gcreate'; res = await call(i, 'gcreate', { name: 'G' + ri(1000) }, u.token); if (res[0] === 200) codes.push(res[1].code); }
    else if (r < 0.66 && codes.length) { label = 'gjoin'; res = await call(i, 'gjoin', { code: pick(codes) }, u.token); }
    else if (r < 0.69 && codes.length) { label = 'gleave'; res = await call(i, 'gleave', { code: pick(codes) }, u.token); }
    else if (r < 0.74) { label = 'login'; res = await call(i, 'auth', { mode: 'login', phone: u.phone, pin: rnd() < .8 ? u.pin : 'wrongpin1' }, null); if (res[0] === 200) u.token = res[1].token; }
    else if (r < 0.76) { label = 'logout'; res = await call(i, 'logout', {}, u.token); }
    else if (r < 0.79) { label = 'ack'; res = await call(i, 'ack', {}, u.token); }
    else if (r < 0.82) { label = 'track'; res = await call(i, 'track', { e: 'return_visit' }, u.token); }
    else if (r < 0.84 && users.length > 5) { label = 'delete'; const k = ri(users.length); if (users[k] !== admin) { res = await call(i, 'delete', { pin: users[k].pin }, users[k].token); if (res[0] === 200) users.splice(k, 1); } }
    else if (r < 0.86) { label = 'chphone'; const np = '+4479' + String(ri(1e8)).padStart(8, '0'); res = await call(i, 'chphone', { pin: u.pin, phone: np }, u.token); if (res[0] === 200) u.phone = np; }
    else if (r < 0.88 && admin) { label = 'adjust'; res = await call(i, 'adjust', { user: pick(users).uid, amount: ri(100) - 20, reason: 'fuzz adjust' }, admin.token); }
    else if (r < 0.90 && admin) { label = 'resetpw'; const t = pick(users); const rr = await call(i, 'resetpw', { phone: t.phone }, admin.token); res = rr;
      if (rr[0] === 200) { const r2 = await call(ri(instances), 'usereset', { phone: t.phone, pin: 'newsecret1', code: rr[1].code }); if (r2[0] === 200) { t.pin = 'newsecret1'; t.token = r2[1].token; } } }
    else if (r < 0.92) { label = 'clock+day'; skew += 864e5 * (1 + ri(3)); res = [200]; }
    else if (r < 0.93) { label = 'clock+week'; skew += 864e5 * 8; res = [200]; }
    else if (r < 0.94) { label = 'clock+11min'; skew += 11 * 60e3; res = [200]; }
    else if (r < 0.96 && admin) { label = 'open mkt'; res = await call(i, 'create', { en: 'Fuzz market question ' + ri(1e6), bn: 'ফাজ মার্কেট প্রশ্ন', closes: new Date(realNow() + skew + 5 * 864e5).toISOString().slice(0, 10), p: 50, srcEn: 'src fuzz' }, admin.token); }
    else if (r < 0.975 && admin) { label = 'resolve'; res = await call(i, 'resolve', { id: pick(open), outcome: pick(['y', 'n', 'na']) }, admin.token); }
    else { label = 'read'; res = await call(i, pick(['home', 'leaders', 'me', 'account', 'social', 'league', 'market']), { kind: pick(['week', 'friends', 'groups']), id: pick(open) }, u.token, 'GET'); }
    stats.n++;
    if (res && res[0] === 200) stats.ok++; else if (res && res[0] >= 500) { stats.err500++; errs[label + ':' + JSON.stringify(res[1])] = (errs[label + ':' + JSON.stringify(res[1])] || 0) + 1; } else stats.refused++;
    return label;
  };
  try {
    const a = await call(0, 'auth', { mode: 'signup', phone: '01711000000', pin: 'adminpin1', name: 'Admin', adult: true, consent: true });
    admin = { phone: '+8801711000000', pin: 'adminpin1', token: a[1].token }; admin.uid = (await call(0, 'me', {}, admin.token, 'GET'))[1].me.id; users.push(admin);
    for (let s = 0; s < steps; s++) {
      const labels = conc > 1 ? await Promise.all(Array.from({ length: conc }, act)) : [await act()];
      for (let i = 0; i < instances; i++) {
        try { await stores[i].verify(); } catch (e) { diverged++; if (!first) first = { step: s, labels: labels.join(','), instance: i, error: String(e.message).slice(0, 300) }; }
      }
      if (diverged) break;
    }
  } finally { console.error = e0; Date.now = realNow; for (const s of stores) await s.end().catch(() => {}); }
  return { seed, steps, conc, instances, stats, diverged, first, err500: stats.err500, errs };
}
module.exports = { run };

if (require.main === module) (async () => {
  const [steps, seed, conc, instances] = [120, 1, 6, 3].map((d, i) => +process.argv[2 + i] || d);
  const EmbeddedPostgres = require('embedded-postgres').default;
  const port = +process.env.PGPORT_FUZZ || 54353;
  const pgs = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'fz-')), user: 't', password: 't', port, persistent: false, onLog: () => {} });
  await pgs.initialise(); await pgs.start();
  let r;
  try { r = await run({ url: `postgres://t:t@localhost:${port}/postgres`, steps, seed, conc, instances, quiet: true }); } finally { await pgs.stop(); }
  console.log(JSON.stringify(r));
  process.exit(r.diverged || r.err500 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
