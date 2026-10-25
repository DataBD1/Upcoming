// Fuzz: random real API actions spread over 3 store instances (separate pgstore module copies would be ideal; createStore()
// gives separate caches + pools which is the same thing). After EVERY step compare each instance's cached view to the database.
//   node 10-fuzz.js [steps=300] [seed=1] [concurrency=1]    (PGSTORE_VERIFY=1 optional)
'use strict';
const { startPg, load } = require('./10-lib.js');
const STEPS = +process.argv[2] || 300, SEED = +process.argv[3] || 1, CONC = +process.argv[4] || 1;
let rs = SEED; const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
const ri = n => Math.floor(rnd() * n), pick = a => a[ri(a.length)];
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
(async () => {
  if (+process.env.LAT) require('./10-lib.js').addLatency(+process.env.LAT); const P = await startPg('fuzz'); const { Core, createStore, loadFull, SHARDED, H, Pool } = load();
  process.env.ADMIN_PHONES = '01711000000';
  const stores = [0, 1, 2].map(() => createStore({ url: P.url, key: 'main', seed: () => Core.seed(Date.now()) }));
  const pool = new Pool({ connectionString: P.url, max: 2 }); pool.on('error', () => {});
  const call = (i, name, body, token, method = 'POST') => H.handleApi(stores[i], { method, name, body: body || {}, token, ua: 'f', country: 'GB', ip: '1.1.1.' + ri(5) });
  const users = []; // {phone,pin,token,uid}
  let admin;
  const stats = { n: 0, ok: 0, refused: 0, err500: 0 }, errs = {};
  const act = async () => {
    const i = ri(3), r = rnd(); let res, label;
    const u = users.length ? pick(users) : null;
    const hm = await call(i, 'home', {}, null, 'GET'); if (hm[0] >= 500) { stats.n++; stats.err500++; errs['home:' + JSON.stringify(hm[1])] = (errs['home:' + JSON.stringify(hm[1])] || 0) + 1; return 'home500'; }
    const open = hm[1].markets.filter(m => m.status === 'open').map(m => m.id);
    if (!u || r < 0.08) { const ph = '+4478' + String(users.length + 100).padStart(8, '0'); label = 'signup'; res = await call(i, 'auth', { mode: 'signup', phone: ph, pin: 'secret12', name: 'U' + users.length, adult: true, consent: true, device: 'd' + ri(4) });
      if (res[0] === 200) { const me = (await call(i, 'me', {}, res[1].token, 'GET'))[1]; users.push({ phone: ph, pin: 'secret12', token: res[1].token, uid: me.me.id }); if (!admin && users.length === 1) {} } }
    else if (r < 0.30) { label = 'buy'; res = await call(i, 'buy', { id: pick(open), side: pick(['y', 'n']), amount: 1 + ri(60) }, u.token); }
    else if (r < 0.38) { label = 'sell'; res = await call(i, 'sell', { id: pick(open), side: pick(['y', 'n']), shares: 'all' }, u.token); }
    else if (r < 0.46) { label = 'bonus'; res = await call(i, 'bonus', {}, u.token); }
    else if (r < 0.50) { label = 'rename'; res = await call(i, 'rename', { name: 'N' + ri(1000) }, u.token); }
    else if (r < 0.54) { label = 'feedback'; res = await call(i, 'feedback', { text: 'fb ' + ri(1e6) }, u.token); }
    else if (r < 0.60) { label = 'gcreate'; res = await call(i, 'gcreate', { name: 'G' + ri(1000) }, u.token); if (res[0] === 200) (act.codes ||= []).push(res[1].code); }
    else if (r < 0.66 && act.codes) { label = 'gjoin'; res = await call(i, 'gjoin', { code: pick(act.codes) }, u.token); }
    else if (r < 0.69 && act.codes) { label = 'gleave'; res = await call(i, 'gleave', { code: pick(act.codes) }, u.token); }
    else if (r < 0.74) { label = 'login'; res = await call(i, 'auth', { mode: 'login', phone: u.phone, pin: rnd() < .8 ? u.pin : 'wrongpin1' }, null); if (res[0] === 200) u.token = res[1].token; }
    else if (r < 0.76) { label = 'logout'; res = await call(i, 'logout', {}, u.token); }
    else if (r < 0.79) { label = 'ack'; res = await call(i, 'ack', {}, u.token); }
    else if (r < 0.82) { label = 'track'; res = await call(i, 'track', { e: 'return_visit' }, u.token); }
    else if (r < 0.84 && users.length > 5) { label = 'delete'; const k = ri(users.length); if (users[k] !== admin) { res = await call(i, 'delete', { pin: users[k].pin }, users[k].token); if (res[0] === 200) users.splice(k, 1); } }
    else if (r < 0.86) { label = 'chphone'; const np = '+4479' + String(ri(1e8)).padStart(8, '0'); res = await call(i, 'chphone', { pin: u.pin, phone: np }, u.token); if (res[0] === 200) u.phone = np; }
    else if (r < 0.88 && admin) { label = 'adjust'; res = await call(i, 'adjust', { user: pick(users).uid, amount: ri(100) - 20, reason: 'fuzz adjust' }, admin.token); }
    else if (r < 0.90 && admin) { label = 'resetpw'; const t = pick(users); const rr = await call(i, 'resetpw', { phone: t.phone }, admin.token); res = rr; if (rr[0] === 200) { const r2 = await call(ri(3), 'usereset', { phone: t.phone, pin: 'newsecret1', code: rr[1].code }); if (r2[0] === 200) { t.pin = 'newsecret1'; t.token = r2[1].token; } } }
    else if (r < 0.92) { label = 'clock+day'; skew += 864e5 * (1 + ri(3)); res = [200]; }
    else if (r < 0.93) { label = 'clock+week'; skew += 864e5 * 8; res = [200]; }
    else if (r < 0.94) { label = 'clock+11min'; skew += 11 * 60e3; res = [200]; }
    else if (r < 0.96 && admin) { label = 'open mkt'; res = await call(i, 'create', { en: 'Fuzz market question ' + ri(1e6), bn: 'ফাজ মার্কেট প্রশ্ন', closes: new Date(realNow() + skew + 5 * 864e5).toISOString().slice(0, 10), p: 50, srcEn: 'src fuzz' }, admin.token); }
    else if (r < 0.975 && admin) { label = 'propose+resolve'; const m = pick(open); res = await call(i, 'resolve', { id: m, outcome: pick(['y', 'n', 'na']) }, admin.token); }
    else { label = 'read'; res = await call(i, pick(['home', 'leaders', 'me', 'account', 'social', 'league']), { kind: pick(['week', 'friends', 'groups']) }, u.token, 'GET'); }
    stats.n++; if (res && res[0] === 200) stats.ok++; else if (res && res[0] >= 500) { stats.err500++; errs[label + ':' + JSON.stringify(res[1])] = (errs[label + ':' + JSON.stringify(res[1])] || 0) + 1; } else stats.refused++;
    return label;
  };
  // seed admin
  const a = await call(0, 'auth', { mode: 'signup', phone: '01711000000', pin: 'adminpin1', name: 'Admin', adult: true, consent: true });
  admin = { phone: '+8801711000000', pin: 'adminpin1', token: a[1].token }; admin.uid = (await call(0, 'me', {}, admin.token, 'GET'))[1].me.id; users.push(admin);
  const dbState = async () => { const c = await pool.connect(); try { await c.query('begin isolation level repeatable read read only'); const f = await loadFull(c, 'main', false); await c.query('commit'); delete f.state.events; return f; } finally { c.release(); } };
  let diverged = 0, firstDiv = null;
  const check = async (label) => {
    const db = await dbState();
    for (let i = 0; i < 3; i++) {
      const s = await stores[i].read(); // syncs the instance
      for (const c of [...SHARDED, 'markets', 'feedback', 'audit', 'site', 'week', 'trades', 'v', 'seen', 'cities']) {
        const mine = canon(s[c]), theirs = canon(db.state[c]);
        if (mine !== theirs) {
          diverged++; let detail;
          const A = s[c], B = db.state[c];
          if (A && B && typeof A === 'object' && !Array.isArray(A)) { const ks = new Set([...Object.keys(A), ...Object.keys(B)]); for (const k of ks) if (canon(A[k]) !== canon(B[k])) { detail = { key: k, cache: canon(A[k]), db: canon(B[k]) }; break; } }
          else detail = { cache: mine.slice(0, 300), db: theirs.slice(0, 300) };
          if (!firstDiv) firstDiv = { step: stats.n, label, instance: i, coll: c, detail, cacheVersion: 'n/a' }; return false; }
      }
    }
    return true;
  };
  let bad = 0;
  for (let s = 0; s < STEPS; s++) {
    let label;
    if (CONC > 1) { const l = await Promise.all(Array.from({ length: CONC }, act)); label = l.join(','); } else label = await act();
    if (!(await check(label))) { bad++; if (bad === 1) console.log('FIRST DIVERGENCE', JSON.stringify(firstDiv, null, 1)); break; }
  }
  console.log(JSON.stringify({ seed: SEED, steps: STEPS, conc: CONC, verify: process.env.PGSTORE_VERIFY === '1', stats, diverged, errs }));
  for (const s of stores) await s.end().catch(() => {}); await pool.end(); await P.stop(); process.exit(bad || stats.err500 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
