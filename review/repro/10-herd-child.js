const APP = '/home/user/upcoming/dhk-predicts-features/app', { createStore } = require(APP + '/lib/pgstore.js');
process.on('message', async () => {
  const s = createStore({ url: 'postgres://t:t@localhost:54410/postgres', key: process.argv[2], seed: () => ({}) });
  const t = Date.now(); await s.read(); const ms = Date.now() - t;
  process.send({ ms, rss: Math.round(process.memoryUsage().rss / 1048576) }); await s.end(); process.exit(0);
});
process.send('ready');
