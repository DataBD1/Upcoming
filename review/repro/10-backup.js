// api/backup.js against N players with a fake @vercel/blob. Measures: time/memory of one call, and that an UNAUTHENTICATED repeat call
// (CRON_SECRET unset, route excluded from the rewrite + country middleware) repeats the full load even though "today's copy exists".
const APP = '/home/user/upcoming/dhk-predicts-features/app', areq = require('module').createRequire(APP + '/x.js');
const blobPath = areq.resolve('@vercel/blob'); let puts = 0, bytes = 0;
require.cache[blobPath] = { id: blobPath, filename: blobPath, loaded: true, exports: {
  put: async (n, body) => { puts++; bytes = body.length; if (puts > 1) { const e = new Error('This blob already exists'); throw e; } },
  list: async () => ({ blobs: [], hasMore: false }), del: async () => {} } };
process.env.POSTGRES_URL = 'postgres://t:t@localhost:54410/postgres'; delete process.env.CRON_SECRET;
const h = require(APP + '/api/backup.js');
const call = () => new Promise(r => { const res = { setHeader() {}, end: b => r({ status: res.statusCode || 200, b }) }; h({ headers: {} }, res); });
(async () => {
  for (let i = 0; i < 3; i++) { const t = Date.now(); const r = await call(); global.gc && global.gc(); const m = process.memoryUsage();
    console.log('call', i + 1, 'status', r.status, String(r.b).slice(0, 90), '|', Date.now() - t, 'ms | rss', (m.rss / 1048576).toFixed(0), 'MB | body', (bytes / 1048576).toFixed(1), 'MB'); }
  console.log('peak RSS (VmHWM):', require('fs').readFileSync('/proc/self/status', 'utf8').match(/VmHWM:\s+(\d+)/)[1] / 1024 | 0, 'MB');
  process.exit(0);
})();
