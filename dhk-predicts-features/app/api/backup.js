// Nightly backup outside the database (Risk condition for A18). Vercel cron calls this daily
// (vercel.json "crons"); it writes the whole state row to a private Vercel Blob store as
// backups/YYYY-MM-DD.json and deletes copies older than 30 days.
// Needs a Blob store connected to the project (sets BLOB_READ_WRITE_TOKEN). Restore: load the
// JSON into app_state.data for key 'rival-a' (tech/operations.md section 3).
'use strict';
const { put, list, del } = require('@vercel/blob');
const { Pool } = require('pg');

const KEEP_DAYS = 30;
let pool;

module.exports = async (req, res) => {
  // When CRON_SECRET is set, Vercel cron sends it; without it the route is still harmless:
  // one write per day at most, and it returns no data.
  const want = process.env.CRON_SECRET;
  if (want && req.headers.authorization !== 'Bearer ' + want) { res.statusCode = 401; return res.end('no'); }
  try {
    if (!pool) {
      const k = Object.keys(process.env).find(k => /(^|_)(POSTGRES_URL|DATABASE_URL)$/.test(k));
      const url = process.env.POSTGRES_URL || process.env.DATABASE_URL || (k && process.env[k]);
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
      pool = new Pool({ connectionString: url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, ''),
        max: 1, ssl: local ? false : { rejectUnauthorized: false } });
      pool.on('error', e => console.error('backup: idle connection lost:', e.message));
    }
    const { rows } = await pool.query("select data, version, updated_at from app_state where key = 'rival-a'");
    if (!rows[0]) throw new Error('no state row yet');
    const day = new Date().toISOString().slice(0, 10);
    const body = JSON.stringify({ key: 'rival-a', version: rows[0].version, updated_at: rows[0].updated_at, data: rows[0].data });
    let wrote = true;
    try {
      await put(`backups/${day}.json`, body, { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
    } catch (e) {
      if (!/already exists/i.test(String(e && e.message))) throw e;
      wrote = false; // today's copy exists: a repeat call does nothing
    }
    const cutoff = Date.now() - KEEP_DAYS * 864e5, old = [];
    let cursor;
    do {
      const page = await list({ prefix: 'backups/', cursor });
      for (const b of page.blobs) if (new Date(b.uploadedAt).getTime() < cutoff) old.push(b.url);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (old.length) await del(old);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, day, wrote, bytes: body.length, pruned: old.length }));
  } catch (e) {
    console.error('backup failed:', e);
    res.statusCode = 500; res.end(JSON.stringify({ ok: false }));
  }
};
