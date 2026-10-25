// Starts the embedded Postgres on port 54410 (data dir /tmp/pgrun/10-scale) and keeps it up until killed. Run as non-root.
const { startPg } = require('./10-lib.js'); const fs = require('fs');
(async () => {
  process.env.PGPORT_10 = process.env.PGPORT_10 || '54410';
  const dir = '/tmp/pgrun/10-scale'; fs.rmSync(dir, { recursive: true, force: true });
  const EP = require('module').createRequire('/home/user/upcoming/dhk-predicts-features/app/x.js')('embedded-postgres').default;
  fs.mkdirSync(dir, { recursive: true }); fs.chmodSync(dir, 0o777);
  const pg = new EP({ databaseDir: dir, user: 't', password: 't', port: 54410, persistent: false, onLog: () => {}, postgresFlags: ['-c', 'max_connections=300'] });
  await pg.initialise(); await pg.start(); console.log('pg up on 54410'); setInterval(() => {}, 1e6);
})();
