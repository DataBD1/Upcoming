// Password reset on Postgres, two serverless-style instances (review 08). Run as a non-root user:
//   export TMPDIR=/tmp/pgrun; setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp/pgrun TMPDIR=/tmp/pgrun PATH=$PATH node test-reset-pg.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const EmbeddedPostgres = require('embedded-postgres').default;
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r08pg-')); fs.chmodSync(dir, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 't', password: 't', port: 54418, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  process.env.TRUST_PROXY = '1'; /* the test fakes client IPs with x-forwarded-for */ process.env.PGSTORE_VERIFY = '1'; process.env.POSTGRES_URL = 'postgres://t:t@localhost:54418/postgres'; process.env.ADMIN_PHONES = '01711000000,+12125550123';
  const fn1 = require('./api/index.js');
  for (const k of Object.keys(require.cache)) if (k.includes(__dirname) && !k.includes('node_modules')) delete require.cache[k];
  const fn2 = require('./api/index.js');
  const servers = [fn1, fn2].map((fn, i) => http.createServer(fn).listen(8208 + i));
  const call = async (port, name, body, token, ip = '1.1.1.1', method = 'POST') => {
    const r = await fetch(`http://localhost:${port}/api/${name}` + (method === 'GET' && body ? '?' + new URLSearchParams(body) : ''),
      { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
    return [r.status, await r.json()];
  };
  const su = async (port, phone, pin, name) => (await call(port, 'auth', { mode: 'signup', phone, pin, name, adult: true, consent: true }))[1].token;
  try {
    const admin = await su(8208, '01711000000', 'adminpass1', 'Adm');
    await su(8208, '+12125550123', 'adminpass2', 'Adm2');
    const p1 = await su(8208, '+442079460001', 'playerpw1', 'P1');
    let [st, r] = await call(8209, 'resetpw', { phone: '+12125550123' }, admin);
    assert.equal(r.error, 'admin_reset_denied'); assert.equal(st, 403);
    // anonymous spam from another ip, split across both instances, does not lock the victim out
    for (let i = 0; i < 14; i++) await call(8208 + (i % 2), 'usereset', { phone: '+442079460001', code: 'AAAAAAAAAAAA', pin: 'whatever1' }, undefined, '6.6.6.6');
    assert.equal((await call(8208, 'usereset', { phone: '+442079460001', code: 'AAAAAAAAAAAA', pin: 'whatever1' }, undefined, '6.6.6.6'))[1].error, 'slow_down');
    for (let i = 0; i < 8; i++) await call(8208 + (i % 2), 'auth', { mode: 'login', phone: '+442079460001', pin: 'wrongwrong' }, undefined, '6.6.6.6');
    assert.equal((await call(8209, 'auth', { mode: 'login', phone: '+442079460001', pin: 'playerpw1' }, undefined, '9.9.9.9'))[0], 200, 'victim logs in from own ip');
    [st, r] = await call(8209, 'resetpw', { phone: '+442079460001' }, admin);
    const res = await Promise.all([1, 2, 3, 4, 5, 6].map(i => call(8208 + (i % 2), 'usereset', { phone: '+442079460001', code: r.code, pin: 'racepass' + i }, undefined, '9.9.9.9')));
    assert.equal(res.filter(x => x[0] === 200).length, 1, 'exactly one winner');
    const win = res.find(x => x[0] === 200)[1].token;
    assert.equal((await call(8209, 'home', {}, p1, '1.1.1.1', 'GET'))[1].me, undefined, 'old session dead on other instance');
    assert.ok((await call(8209, 'home', {}, win, '1.1.1.1', 'GET'))[1].me, 'new session works');
    [st, r] = await call(8208, 'auditall', {}, admin, '1.1.1.1', 'GET');
    assert.ok(r.audit.some(x => x.action === 'resetpw_used'), 'redemption audited');
    // revocation by login
    [st, r] = await call(8208, 'resetpw', { phone: '+442079460001' }, admin); const c2 = r.code;
    await call(8209, 'auth', { mode: 'login', phone: '+442079460001', pin: 'racepass' + (res.findIndex(x => x[0] === 200) + 1) }, undefined, '9.9.9.9');
    assert.equal((await call(8208, 'usereset', { phone: '+442079460001', code: c2, pin: 'stolen1234' }, undefined, '3.3.3.3'))[1].error, 'bad_reset');
    console.log('reset regression (Postgres, 2 instances): passed');
  } finally { servers.forEach(s => s.close()); await pg.stop(); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
