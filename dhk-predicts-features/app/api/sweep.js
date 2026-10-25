// Settles proposals whose dispute window has ended and that have no open dispute, for quiet periods when no
// player or admin write has triggered the lazy sweep in core.js. Vercel cron calls it (vercel.json "crons").
// Protected by CRON_SECRET exactly like api/backup.js. Settlement writes an audit entry by 'system'.
'use strict';
let store;

module.exports = async (req, res) => {
  const want = process.env.CRON_SECRET;
  if (want && req.headers.authorization !== 'Bearer ' + want) { res.statusCode = 401; return res.end('no'); }
  try {
    if (!store) {
      const Core = require('../core.js');
      const { createStore } = require('../lib/pgstore.js');
      const k = Object.keys(process.env).find(k => /(^|_)(POSTGRES_URL|DATABASE_URL)$/.test(k));
      const url = process.env.POSTGRES_URL || process.env.DATABASE_URL || (k && process.env[k]);
      store = createStore({ url, key: 'rival-a', seed: () => Core.seed(Date.now()) });
    }
    const Core = require('../core.js');
    const n = await store.transact(s => { Core.migrate(s); return Core.sweep(s, Date.now()); });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, settled: n }));
  } catch (e) {
    console.error('sweep failed:', e);
    res.statusCode = 500; res.end(JSON.stringify({ ok: false }));
  }
};
