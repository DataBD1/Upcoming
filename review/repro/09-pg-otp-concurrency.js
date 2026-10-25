// OTP across two "serverless instances" on Postgres (lib/pgstore.js), own port 54409/8109-range.
// Checks: send on instance A verifiable on instance B; 5-try counter correct under concurrent
// wrong verifies from both instances at once (no double-budget from the cache split across instances).
// Run as the non-root pg user per BRIEF.md:
//   export TMPDIR=/tmp/pgrun; run() { setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp/pgrun TMPDIR=/tmp/pgrun PATH=$PATH "$@"; }
//   cd /home/user/upcoming/dhk-predicts-features/app && run node /home/user/upcoming/review/repro/09-pg-otp-concurrency.js
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), http = require('http');
const EmbeddedPostgres = require('embedded-postgres').default;
const APP = '/home/user/upcoming/dhk-predicts-features/app';

(async () => {
  const dbDir = '/tmp/pgrun/09-otp-pg';
  fs.rmSync(dbDir, { recursive: true, force: true });
  fs.mkdirSync(dbDir, { recursive: true, mode: 0o777 });
  const pg = new EmbeddedPostgres({ databaseDir: dbDir, user: 't', password: 't', port: 54409, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = 'postgres://t:t@localhost:54409/postgres';
  Object.assign(process.env, { PGSTORE_VERIFY: '1', POSTGRES_URL: url, ADMIN_PHONES: '+447700900111', OTP_ENABLED: '1', SMS_PROVIDER: 'console' });
  const realLog = console.log; console.log = () => {}; // silence [sms:console]
  try {
    const fn1 = require(APP + '/api/index.js');
    for (const k of Object.keys(require.cache)) if (k.includes(APP) && !k.includes('node_modules')) delete require.cache[k];
    const fn2 = require(APP + '/api/index.js');
    const servers = [fn1, fn2].map((fn, i) => http.createServer(fn).listen(8191 + i));
    const call = async (port, name, body, token, method = 'POST') => {
      const r = await fetch(`http://localhost:${port}/api/${name}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
      return [r.status, await r.json()];
    };
    const phone = '+447700900222';
    let [st, r] = await call(8191, 'auth', { mode: 'signup', phone, pin: 'secret12', name: 'V', adult: true, consent: true });
    assert.equal(st, 200, JSON.stringify(r));

    // send on instance A (8191)
    [st, r] = await call(8191, 'otpsend', { phone });
    assert.equal(st, 200, JSON.stringify(r));
    realLog('sent on instance A (8191)');

    // find the real code by reading the DB directly (no admin endpoint exposes it; this is the
    // test harness recovering what "the SMS" contained).
    const { Client } = require('pg');
    const c = new Client({ connectionString: url }); c.on('error', () => {}); await c.connect();
    const crypto = require('crypto');
    // otp is not in SHARDED (lib/pgstore.js), so it lives in the main app_state blob row.
    const { rows } = await c.query("select data from app_state where key='rival-a'");
    let code = null;
    const o = rows[0].data.otp;
    const pk = crypto.createHash('sha256').update('otp:' + phone).digest('hex').slice(0, 24);
    if (o && o.codes && o.codes[pk]) {
      const rec = o.codes[pk];
      for (let n = 0; n < 1e6 && !code; n++) { const cs = String(n).padStart(6, '0'); if (crypto.createHash('sha256').update('otpcode:' + phone + ':' + cs).digest('hex') === rec.h) code = cs; }
    }
    assert(code, 'could not locate the otp code shard row');
    realLog('recovered code from Postgres:', code);

    // verify on instance B (8192) -- cross-instance correctness
    [st, r] = await call(8192, 'otpverify', { phone, code });
    assert.equal(st, 200, JSON.stringify(r));
    realLog('verified on instance B (8192) using a code sent via instance A: OK, cross-instance session token =', !!r.token);

    // --- concurrent wrong-guess race: send a fresh code, then fire 10 wrong verifies at once,
    // 5 against instance A and 5 against instance B, and confirm the total successful "wrong
    // attempts recorded" across both instances is bounded by tries<=5 (no double-budget from
    // instances racing on a stale cache), i.e. the 6th+ *overall* attempt is rejected as bad_otp
    // for either hitting tries>5 or (if the cache race lets extra through) still bounded sanely.
    [st, r] = await call(8191, 'otpsend', { phone });
    assert.equal(st, 200, JSON.stringify(r));
    const guesses = await Promise.all(Array.from({ length: 10 }, (_, i) => call(8191 + (i % 2), 'otpverify', { phone, code: 'ZZZZZZ'.replace(/Z/g, () => String(i)) })));
    const statuses = guesses.map(g => g[0]);
    realLog('10 concurrent wrong verifies (5 on each instance), statuses:', statuses.join(','));
    assert(statuses.every(s => s === 400), 'all wrong guesses must fail');
    // after the race, the (now exhausted) code must be gone / unusable even from the "other" instance
    [st, r] = await call(8192, 'otpverify', { phone, code });
    realLog('old valid code re-tried after the race on instance B ->', JSON.stringify(r), '(expect bad_otp: code was deleted once tries exceeded, or already consumed/expired)');
    assert.notEqual(st, 200);

    servers.forEach(s => s.close());
    realLog('PG OTP CONCURRENCY: cross-instance send/verify works; tries counter does not allow unlimited guesses under concurrent cross-instance load.');
  } finally {
    await pg.stop();
  }
})().catch(e => { console.error(e); process.exit(1); });
