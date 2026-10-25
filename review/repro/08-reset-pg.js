// Postgres repro: sessions killed across instances, concurrent redemption, lockout across instances.
// Run: mkdir -p /tmp/pgrun/08-pg && chmod 777 /tmp/pgrun/08-pg; export TMPDIR=/tmp/pgrun
//   setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp/pgrun TMPDIR=/tmp/pgrun PATH=$PATH node 08-reset-pg.js
const A = '/home/user/upcoming/dhk-predicts-features/app';
const fs = require('fs'), http = require('http'), assert = require('assert');
const EmbeddedPostgres = require('module').createRequire(A + '/x.js')('embedded-postgres').default;
(async () => {
  const dir = '/tmp/pgrun/08-pg/db' + Date.now(); fs.mkdirSync(dir, { recursive: true }); fs.chmodSync(dir, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 't', password: 't', port: 54408, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  process.env.PGSTORE_VERIFY = '1'; process.env.POSTGRES_URL = 'postgres://t:t@localhost:54408/postgres'; process.env.ADMIN_PHONES = '01711000000,+12125550123';
  process.chdir(A);
  const fn1 = require(A + '/api/index.js');
  for (const k of Object.keys(require.cache)) if (k.includes(A) && !k.includes('node_modules')) delete require.cache[k];
  const fn2 = require(A + '/api/index.js');
  const servers = [fn1, fn2].map((fn, i) => http.createServer(fn).listen(8108 + i));
  const call = async (port, name, body, token, method = 'POST') => {
    const r = await fetch(`http://localhost:${port}/api/${name}` + (method === 'GET' && body ? '?' + new URLSearchParams(body) : ''),
      { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
    return [r.status, await r.json()];
  };
  const su = async (port, phone, pin, name) => (await call(port, 'auth', { mode: 'signup', phone, pin, name, adult: true, consent: true }))[1].token;
  const out = [];
  try {
    const admin = await su(8108, '01711000000', 'adminpass1', 'Adm');
    const p1 = await su(8108, '+442079460001', 'playerpw1', 'P1');
    // many sessions of P1 created via both instances, plus warm both caches
    const toks = [p1]; for (let i = 0; i < 4; i++) toks.push((await call(8108 + (i % 2), 'auth', { mode: 'login', phone: '+442079460001', pin: 'playerpw1' }))[1].token);
    for (const t of toks) { await call(8108, 'home', {}, t, 'GET'); await call(8109, 'home', {}, t, 'GET'); }
    let [st, r] = await call(8109, 'resetpw', { phone: '+442079460001' }, admin); const code = r.code;
    // concurrent redemption through both instances
    const res = await Promise.all([0, 1, 2, 3, 4, 5].map(i => call(8108 + (i % 2), 'usereset', { phone: '+442079460001', code, pin: 'racepw' + i })));
    out.push('concurrent usereset (6 over 2 instances): ' + res.map(x => x[0] + (x[1].error ? ':' + x[1].error : '')).join(' '));
    const winners = res.filter(x => x[0] === 200).length; out.push((winners === 1 ? 'HOLDS' : 'CONFIRMED BUG') + ': winners=' + winners);
    // old sessions dead on BOTH instances?
    let alive = 0; for (const t of toks) for (const port of [8108, 8109]) { const h = await call(port, 'home', {}, t, 'GET'); if (h[1].me) alive++; }
    out.push((alive === 0 ? 'HOLDS' : 'CONFIRMED BUG') + ': old sessions still alive across both instances after reset = ' + alive + ' of ' + toks.length * 2);
    // lockout across instances
    const v = await su(8108, '+442079460002', 'vicpass111', 'Vic');
    for (let i = 0; i < 6; i++) await call(8108 + (i % 2), 'usereset', { phone: '+442079460002', code: 'AAAAAAAAAAAA', pin: 'whatever1' });
    [st, r] = await call(8109, 'auth', { mode: 'login', phone: '+442079460002', pin: 'vicpass111' });
    out.push('victim login after 6 anonymous usereset (other instance): ' + st + ' ' + JSON.stringify(r));
    // admin resets admin (second admin)
    const admB = await su(8109, '+12125550123', 'adminBpass1', 'AdmB');
    [st, r] = await call(8108, 'resetpw', { phone: '+12125550123' }, admin);
    [st, r] = await call(8109, 'usereset', { phone: '+12125550123', code: r.code, pin: 'takeover12' });
    const h = await call(8108, 'home', {}, r.token, 'GET');
    out.push('admin->admin takeover on PG: status ' + st + ', hijacked session is admin=' + (h[1].me && h[1].me.admin) + ', B old token alive=' + !!(await call(8109, 'home', {}, admB, 'GET'))[1].me);
  } catch (e) { out.push('ERROR ' + e.stack); }
  console.log(out.join('\n'));
  servers.forEach(s => s.close()); await pg.stop().catch(() => {}); process.exit(0);
})();
