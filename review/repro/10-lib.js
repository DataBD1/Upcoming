// Shared harness for reviewer 10: embedded Postgres on port 54410 + helpers. Run scripts as non-root:
//   export TMPDIR=/tmp/pgrun; run() { setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp/pgrun TMPDIR=/tmp/pgrun PATH=$PATH "$@"; }; run node 10-xxx.js
'use strict';
const fs = require('fs'), path = require('path');
const APP = '/home/user/upcoming/dhk-predicts-features/app';
const areq = require('module').createRequire(APP + '/x.js');
const EmbeddedPostgres = areq('embedded-postgres').default;
const PORT = +process.env.PGPORT_10 || 54410;
async function startPg(name) {
  const dir = '/tmp/pgrun/10-' + (name || 'pg') + '-' + process.pid; fs.mkdirSync(dir, { recursive: true }); fs.chmodSync(dir, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 't', password: 't', port: PORT, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = `postgres://t:t@localhost:${PORT}/postgres`;
  return { pg, url, stop: async () => { await pg.stop(); } };
}
const load = () => ({ Core: require(APP + '/core.js'), ...require(APP + '/lib/pgstore.js'), H: require(APP + '/lib/handler.js'), Pool: areq('pg').Pool, Client: areq('pg').Client });
module.exports = { APP, startPg, load, PORT };

/** Simulate network latency to the database: every query round trip waits `ms` (+ up to 100% jitter). */
module.exports.addLatency = function addLatency(ms) {
  const pg = areq('pg'), delay = () => new Promise(r => setTimeout(r, ms * (1 + Math.random())));
  const cq = pg.Client.prototype.query;
  pg.Client.prototype.query = function (...a) {
    if (typeof a[a.length - 1] === 'function') return cq.apply(this, a);
    return delay().then(() => cq.apply(this, a));
  };
};
