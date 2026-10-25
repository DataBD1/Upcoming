// Vercel entry (decision A10): the same API as server.js, with state in Postgres
// via tech/deploy-kit/pgstore.js. vercel.json rewrites /api/* here.
'use strict';
let serve, bootError = null;
// Vercel's Supabase connect dialog can add a prefix (e.g. STORAGE_POSTGRES_URL), so accept any
// *POSTGRES_URL, preferring the plain names.
const dbKeys = Object.keys(process.env).filter(k => /(^|_)(POSTGRES_URL|DATABASE_URL)$/.test(k));
const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || (dbKeys[0] && process.env[dbKeys[0]]);
try {
  const Core = require('../core.js');
  const { serveApi, ADMINS } = require('../lib/handler.js');
  const { createStore } = require('../lib/pgstore.js'); // copy of tech/deploy-kit/pgstore.js
  // Refuses to start in production without valid ADMIN_PHONES (fail closed, A27).
  ADMINS();
  const store = createStore({ url: dbUrl, key: 'rival-a', seed: () => Core.seed(Date.now()) });
  serve = (req, res) => serveApi(store, req, res);
} catch (e) {
  bootError = e;
  console.error('api boot failed:', e);
}

module.exports = (req, res) => {
  if (serve) return serve(req, res);
  // Say what is missing without leaking values, so a bad deploy is diagnosable from outside.
  res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: 'boot', detail: (bootError && bootError.code) || String(bootError && bootError.message).split('\n')[0].replace(/\/[^\s']+/g, '…').slice(0, 120),
    db_url_set: !!dbUrl, db_env_names: Object.keys(process.env).filter(k => /POSTGRES|SUPABASE|DATABASE/.test(k)).sort(), admin_phones_set: !!process.env.ADMIN_PHONES }));
};
