// Nightly backup outside the database (Risk condition for A18). Vercel cron calls this daily
// (vercel.json "crons"); it writes the whole state (the app_state row plus app_shards) to a private Vercel Blob store as
// backups/YYYY-MM-DD.json and deletes copies older than 30 days.
// Needs a Blob store connected to the project (sets BLOB_READ_WRITE_TOKEN) and, in production, CRON_SECRET
// (Vercel sends it as "Authorization: Bearer ..." on cron calls; without it the route refuses to run).
// It checks Blob for today's copy BEFORE reading the database, so a repeat call (or an attacker's) costs one list call.
// Restore: load the JSON into app_state.data for key 'rival-a' (docs/operations.md section 3); the next write re-shards it.
'use strict';
const crypto = require('crypto');
const { put, list, del } = require('@vercel/blob');
const { Pool } = require('pg');
const { loadFull } = require('../lib/pgstore.js');

const KEEP_DAYS = 30;
let pool;
const isProd = () => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
const hash = s => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));

module.exports = async (req, res) => {
  const want = process.env.CRON_SECRET;
  // Fail closed: in production the route is open to the whole internet, so without a secret it does nothing.
  if (!want && isProd()) {
    console.error('backup refused: set CRON_SECRET in the production environment (Vercel sends it on cron calls)');
    res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: false, error: 'cron_secret_missing' }));
  }
  if (want && !same(req.headers.authorization || '', 'Bearer ' + want)) { res.statusCode = 401; return res.end('no'); }
  try {
    const day = new Date().toISOString().slice(0, 10), name = `backups/${day}.json`;
    // One list call finds both today's copy (then we stop: no database read at all) and the copies to prune.
    const cutoff = Date.now() - KEEP_DAYS * 864e5, old = [];
    let have = false, cursor;
    do {
      const page = await list({ prefix: 'backups/', cursor });
      for (const b of page.blobs) {
        if (b.pathname === name) have = true;
        if (new Date(b.uploadedAt).getTime() < cutoff) old.push(b.url);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    let wrote = false, bytes = 0;
    if (!have) {
      if (!pool) {
        const k = Object.keys(process.env).find(k => /(^|_)(POSTGRES_URL|DATABASE_URL)$/.test(k));
        const url = process.env.POSTGRES_URL || process.env.DATABASE_URL || (k && process.env[k]);
        const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
        pool = new Pool({ connectionString: url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, ''),
          max: 1, ssl: local ? false : { rejectUnauthorized: false } });
        pool.on('error', e => console.error('backup: idle connection lost:', e.message));
      }
      // One consistent snapshot of the main row and every shard.
      const c = await pool.connect();
      c.on('error', e => console.error('backup: connection lost:', e.message)); // a dropped connection must not crash the process
      let full;
      try {
        await c.query('begin isolation level repeatable read read only');
        full = await loadFull(c, 'rival-a', false, { events: true });
        await c.query('commit');
      } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
      if (!full) throw new Error('no state row yet');
      const body = JSON.stringify({ key: 'rival-a', version: full.version, updated_at: full.updated_at, data: full.state });
      bytes = body.length;
      try {
        await put(name, body, { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
        wrote = true;
      } catch (e) {
        if (!/already exists/i.test(String(e && e.message))) throw e; // two calls raced: the other one wrote it
      }
    }
    if (old.length) await del(old);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, day, wrote, bytes, pruned: old.length }));
  } catch (e) {
    console.error('backup failed:', e);
    res.statusCode = 500; res.end(JSON.stringify({ ok: false }));
  }
};
