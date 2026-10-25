// OTP across two "serverless instances" on embedded Postgres (needs a non-root user, see README).
//   export TMPDIR=/tmp/pgrun; run() { setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp/pgrun TMPDIR=/tmp/pgrun PATH=$PATH "$@"; }
//   run node test-pg-otp.js        (PG_PORT / PG_DIR override the port and database folder)
'use strict';
const assert = require('assert'), fs = require('fs'), http = require('http');
const EmbeddedPostgres = require('embedded-postgres').default;
const PORT = Number(process.env.PG_PORT) || 54409, DIR = process.env.PG_DIR || '/tmp/pgrun/otp-pg';
(async () => {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true, mode: 0o777 });
  const pg = new EmbeddedPostgres({ databaseDir: DIR, user: 't', password: 't', port: PORT, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  Object.assign(process.env, { PGSTORE_VERIFY: '1', POSTGRES_URL: `postgres://t:t@localhost:${PORT}/postgres`, ADMIN_PHONES: '+447700900111', OTP_ENABLED: '1', SMS_PROVIDER: 'console' });
  const sent = [], log = console.log; console.log = (...a) => { const m = String(a[0]); if (m.startsWith('[sms:console]')) sent.push(m); else log(...a); };
  const servers = [];
  try {
    const fn1 = require('./api/index.js');
    for (const k of Object.keys(require.cache)) if (k.startsWith(__dirname) && !k.includes('node_modules')) delete require.cache[k];
    const fn2 = require('./api/index.js');
    [fn1, fn2].forEach((fn, i) => servers.push(http.createServer(fn).listen(8291 + i)));
    const call = async (port, name, body) => { const r = await fetch(`http://localhost:${port}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return [r.status, await r.json()]; };
    const wait = async () => { for (let i = 0; i < 50 && !sent.length; i++) await new Promise(r => setTimeout(r, 50)); };
    const phone = '+447700900222', other = '+447700900333', admin = '+447700900111';
    for (const p of [phone, other, admin]) assert.equal((await call(8291, 'auth', { mode: 'signup', phone: p, pin: 'secret12', name: 'V', adult: true, consent: true }))[0], 200);
    // send on A, verify on B
    assert.deepEqual(await call(8291, 'otpsend', { phone }), [200, { ok: true }]); await wait();
    const code = /your code is (\d{6})/.exec(sent[0])[1];
    assert(!(sent[0].includes(phone)), 'phone masked in the log');
    // concurrent wrong guesses across both instances: all fail, never more than the caps allow
    const wrong = code === '000000' ? '000001' : '000000';
    const g = await Promise.all(Array.from({ length: 12 }, (_, i) => call(8291 + (i % 2), 'otpverify', { phone, code: wrong })));
    assert(g.every(x => x[0] === 400), 'all wrong guesses fail');
    assert.equal((await call(8292, 'otpverify', { phone, code }))[0], 400, 'tries exhausted: the right code no longer works');
    // re-send on B does not reset tries or the per-number hourly cap
    sent.length = 0; await call(8292, 'otpsend', { phone }); await wait();
    assert.equal((await call(8291, 'otpverify', { phone, code: /your code is (\d{6})/.exec(sent[0])[1] }))[0], 400, 'tries carried over a re-send');
    // admin: no code, no login
    sent.length = 0; assert.deepEqual(await call(8291, 'otpsend', { phone: admin }), [200, { ok: true }]); await new Promise(r => setTimeout(r, 300));
    assert.equal(sent.length, 0); assert.equal((await call(8292, 'otpverify', { phone: admin, code: '123456' }))[0], 400);
    // a clean number still logs in across instances
    sent.length = 0; await call(8291, 'otpsend', { phone: other }); await wait();
    const r = await call(8292, 'otpverify', { phone: other, code: /your code is (\d{6})/.exec(sent[0])[1] });
    assert.equal(r[0], 200); assert(r[1].token);
    console.log = log; log('PG OTP: cross-instance send/verify, tries carry over, admin refused: passed');
  } finally { console.log = log; servers.forEach(s => s.close()); await pg.stop(); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
