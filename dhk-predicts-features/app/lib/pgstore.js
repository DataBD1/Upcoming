// Postgres-backed store for the JSON state used by every build (same read()/transact(fn) shape as lib/filestore.js).
//
// Layout. app_state holds one small jsonb row with the app's settings and markets. The big maps in
// SHARDED (players, phone logins, sessions, positions, trade logs...) are one row per key in app_shards.
// Analytics events are append-only rows in app_events and are only loaded when asked for.
// Every write locks the app_state row, so trades never interleave, even across serverless instances.
//
// Speed. Each server instance keeps the state in memory. Before a request it checks the state version
// (one tiny query) and, if other instances wrote, fetches only the shard rows changed since: rows carry
// the version of the write that last touched them, and deletes are tombstones so other instances see them.
// A full reload happens on a cold start and every CACHE_TTL_MS, which bounds any drift. A write saves only
// the keys the request touched (the maps are proxies that record which keys were read or written).
// Set PGSTORE_VERIFY=1 (tests do) to also compare every key and fail on a change the proxies missed.
//
// Rollback copies (app_state_history) and backups hold the FULL state in the old single-blob shape;
// an app_state row without "__v" is treated as such a blob and is re-sharded by the next write.
// If a write fails, the in-memory copy is dropped and reloaded, so it never keeps a half-applied change.
//
// Env: POSTGRES_URL (set by Vercel's Supabase integration) or DATABASE_URL.
// Tables are created on first use, so nobody has to run SQL by hand.
const { Pool } = require("pg");

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000; // keep a rollback copy at most every 10 minutes
const SHARDED = ["sessions", "pos", "log", "attempts", "resets", "devices", "users", "auth", "weekstart", "groups"]; // top-level maps kept one row per key
const EVENTS_KEEP = 50000; // analytics events kept (same cap core.js uses)
const CACHE_TTL_MS = 10 * 60 * 1000; // full reload this often, whatever the version says
const TOMBSTONE_KEEP = "1 hour"; // deleted shard rows are kept this long so other instances see the delete
const VERIFY = process.env.PGSTORE_VERIFY === "1";
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function poolFor(url) {
  if (!url) throw new Error("pgstore: set POSTGRES_URL or DATABASE_URL");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Supabase's pooler cert does not chain to Node's default CAs; sslmode in the URL would force verify.
  const connectionString = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const pool = new Pool({ connectionString, max: 5, ssl: local ? false : { rejectUnauthorized: false } });
  // An idle connection dropped by the database (restart, pooler timeout) must not crash the process.
  pool.on("error", (e) => console.error("pgstore: idle connection lost:", e.message));
  return pool;
}

/** `{k: jsonText, ...}` as one JSON document, without parsing the values again. */
const objText = (entries) => "{" + entries.map(([k, j]) => JSON.stringify(k) + ":" + j).join(",") + "}";

/** The full state for `key`, as one object, from a pool or a client. Returns null if there is no row.
 *  Used by backups, tests and cold loads. `shards` is the json text of every shard row as loaded
 *  (null for a legacy single-blob row). */
async function loadFull(q, key, lock, opts) {
  const { rows } = await q.query(
    "select data, version, updated_at from app_state where key = $1" + (lock ? " for update" : ""), [key]);
  if (!rows[0]) return null;
  const { data, updated_at } = rows[0], version = Number(rows[0].version); // bigint arrives as text
  if (!data.__v) return { state: data, version, updated_at, shards: null, saved: JSON.stringify(data) };
  const state = { ...data }; delete state.__v;
  const shards = {};
  for (const c of SHARDED) { state[c] = {}; shards[c] = {}; }
  const { rows: sr } = await q.query("select coll, k, data from app_shards where key = $1 and not deleted", [key]);
  for (const r of sr) if (shards[r.coll]) { state[r.coll][r.k] = r.data; shards[r.coll][r.k] = JSON.stringify(r.data); }
  // Analytics events live in app_events and are only loaded when asked for (metrics, backups).
  // Otherwise state.events is absent and core.js starts a fresh list, which is appended to the table on save.
  delete state.events;
  if (opts && opts.events) state.events = (await q.query("select e from app_events where key = $1 order by id", [key])).rows.map((r) => r.e);
  return { state, version, updated_at, shards, eventsLoaded: !!(opts && opts.events) };
}

/** Write a whole state out as main row content plus shard rows (used to migrate a legacy blob). */
async function saveFull(c, key, state, shards, v) {
  const main = { ...state, __v: 2 };
  delete main.events;
  await c.query("delete from app_shards where key = $1", [key]);
  await appendEvents(c, key, state.events, true);
  for (const coll of SHARDED) {
    const cur = state[coll];
    if (!isMap(cur)) continue; // missing or odd: leave it where it is (inline) rather than lose it
    delete main[coll];
    await putShards(c, key, coll, Object.keys(cur).map((k) => [k, JSON.stringify(cur[k])]), v);
  }
  return main;
}

async function putShards(c, key, coll, entries, v) {
  if (!entries.length) return;
  await c.query(
    "insert into app_shards (key, coll, k, data, v, deleted, t) select $1, $2, e.key, e.value, $4, false, now() from jsonb_each($3::jsonb) e " +
    "on conflict (key, coll, k) do update set data = excluded.data, v = excluded.v, deleted = false, t = now()",
    [key, coll, objText(entries), v]);
}
async function dropShards(c, key, coll, ks, v) {
  if (!ks.length) return;
  await c.query("update app_shards set data = 'null'::jsonb, v = $4, deleted = true, t = now() where key = $1 and coll = $2 and k = any($3::text[])", [key, coll, ks, v]);
}
async function appendEvents(c, key, events, replace) {
  if (replace) await c.query("delete from app_events where key = $1", [key]);
  if (!Array.isArray(events) || !events.length) return;
  await c.query("insert into app_events (key, e) select $1, v from jsonb_array_elements($2::jsonb) with ordinality x(v, n) order by n", [key, JSON.stringify(events)]);
}
/** Housekeeping that runs with the rollback copy: old events, and delete tombstones nobody can still need. */
async function housekeeping(c, key) {
  await c.query("delete from app_events where key = $1 and id <= (select max(id) - $2 from app_events where key = $1)", [key, EVENTS_KEEP]);
  await c.query("delete from app_shards where key = $1 and deleted and t < now() - $2::interval", [key, TOMBSTONE_KEEP]);
}

function createStore({ url = process.env.POSTGRES_URL || process.env.DATABASE_URL, key = "main", seed }) {
  const pool = poolFor(url);
  let ready = null;
  // cache: { state, raw, proxy, json, version, loadedAt }
  //   raw[coll]   the real map          proxy[coll]  what core.js sees (records touched keys)
  //   json[coll]  last saved json text per key, to tell what changed
  let cache = null, refreshing = null, touched = null;

  function init() {
    ready ??= (async () => {
      await pool.query(`
        create table if not exists app_state (
          key text primary key, data jsonb not null, version bigint not null default 1,
          updated_at timestamptz not null default now());
        create table if not exists app_state_history (
          id bigserial primary key, key text not null, version bigint not null,
          data jsonb not null, saved_at timestamptz not null default now());
        create table if not exists app_events (
          id bigserial primary key, key text not null, e jsonb not null);
        create index if not exists app_events_key_id on app_events (key, id);
        create table if not exists app_secrets (name text primary key, value text not null);
        create table if not exists app_shards (
          key text not null, coll text not null, k text not null, data jsonb not null,
          primary key (key, coll, k));
        alter table app_shards add column if not exists v bigint not null default 0;
        alter table app_shards add column if not exists deleted boolean not null default false;
        alter table app_shards add column if not exists t timestamptz not null default now();
        create index if not exists app_shards_v on app_shards (key, v);`);
      await pool.query(
        "insert into app_state (key, data) values ($1, $2) on conflict (key) do nothing",
        [key, JSON.stringify(await seed())]);
    })().catch((e) => { ready = null; throw e; });
    return ready;
  }

  const touch = (coll, k) => { if (touched && typeof k === "string") (touched[coll] ||= new Set()).add(k); };
  function watch(coll, raw) {
    return new Proxy(raw, {
      get(t, k, r) { if (Object.prototype.hasOwnProperty.call(t, k)) touch(coll, k); return Reflect.get(t, k, r); },
      set(t, k, v) { touch(coll, k); t[k] = v; return true; },
      deleteProperty(t, k) { touch(coll, k); return delete t[k]; },
    });
  }
  /** A fresh cache from a loadFull() result. */
  function build(full) {
    const raw = {}, proxy = {}, json = full.shards;
    for (const c of SHARDED) { raw[c] = full.state[c]; proxy[c] = watch(c, raw[c]); }
    const state = { ...full.state }; for (const c of SHARDED) state[c] = proxy[c];
    return { state, raw, proxy, json, version: full.version, loadedAt: Date.now() };
  }
  /** Bring the cache up to date with the database, using `q` (a client inside a transaction, or the pool). */
  async function sync(q, lock) {
    const { rows } = await q.query("select data, version from app_state where key = $1" + (lock ? " for update" : ""), [key]);
    const row = rows[0]; row.version = Number(row.version); // bigint arrives as text
    if (!row.data.__v) { cache = null; return { legacy: true, row }; } // old single-blob row: the next write migrates it
    if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
      if (row.version === cache.version) return { row };
      // Others wrote: apply the main row and every shard row changed since our version.
      const { rows: ch } = await q.query("select coll, k, data, deleted from app_shards where key = $1 and v > $2", [key, cache.version]);
      for (const r of ch) {
        if (!cache.raw[r.coll]) continue;
        if (r.deleted) { delete cache.raw[r.coll][r.k]; delete cache.json[r.coll][r.k]; }
        else { cache.raw[r.coll][r.k] = r.data; cache.json[r.coll][r.k] = JSON.stringify(r.data); }
      }
      const main = { ...row.data }; delete main.__v;
      const state = { ...main }; for (const c of SHARDED) state[c] = cache.proxy[c];
      cache.state = state; cache.version = row.version;
      return { row };
    }
    cache = null;
    const full = await loadFull(q, key, false);
    cache = build(full);
    return { row };
  }

  async function read(opts) {
    await init();
    const wantEvents = !!(opts && opts.events);
    // Fast path: nothing changed since our copy.
    if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
      const { rows } = await pool.query("select version from app_state where key = $1", [key]);
      if (Number(rows[0].version) === cache.version) return wantEvents ? withEvents(cache.state) : cache.state;
    }
    refreshing ??= (async () => {
      const c = await pool.connect();
      try {
        await c.query("begin isolation level repeatable read read only");
        const r = await sync(c, false);
        const legacy = r.legacy ? r.row.data : null;
        await c.query("commit");
        return legacy;
      } catch (e) { await c.query("rollback").catch(() => {}); cache = null; throw e; }
      finally { c.release(); refreshing = null; }
    })();
    const legacy = await refreshing;
    if (!legacy && !cache) return read(opts); // a failed write dropped the copy while we waited: load again
    const state = legacy || cache.state;
    return wantEvents ? withEvents(state) : state;
  }
  async function withEvents(state) {
    const events = (await pool.query("select e from app_events where key = $1 order by id", [key])).rows.map((r) => r.e);
    return { ...state, events };
  }

  /** Run fn on the state and save it. If fn throws, nothing is saved and the in-memory copy is dropped. */
  async function transact(fn) {
    await init();
    const c = await pool.connect();
    let refused = false;
    try {
      await c.query("begin");
      const r = await sync(c, true);
      const { rows: last } = await c.query("select max(saved_at) as t from app_state_history where key = $1", [key]);
      const snapshotDue = !last[0].t || Date.now() - new Date(last[0].t).getTime() > SNAPSHOT_EVERY_MS;
      const v = r.row.version + 1;

      if (r.legacy) { // migrate a single-blob row (or a restored copy) in this one transaction
        const draft = r.row.data, saved = JSON.stringify(draft);
        const out = await fn(draft);
        if (snapshotDue) await c.query("insert into app_state_history (key, version, data) values ($1, $2, $3)", [key, r.row.version, saved]);
        const main = await saveFull(c, key, draft, null, v);
        await c.query("update app_state set data = $2, version = $3, updated_at = now() where key = $1", [key, JSON.stringify(main), v]);
        await c.query("commit");
        cache = null; // rebuilt from the database on the next call
        return out;
      }

      // Rollback copy of the state as it is before this change (raw maps, so nothing counts as touched).
      let snapshot = null;
      if (snapshotDue) { const full = { ...cache.state }; for (const cl of SHARDED) full[cl] = cache.raw[cl]; delete full.events; snapshot = JSON.stringify(full); }
      delete cache.state.events;
      touched = {};
      let out;
      try { out = await fn(cache.state); }
      catch (e) {
        // A refused request (bonus_taken, too_big, ...) is normal. Undo whatever it changed in memory,
        // exactly: touched keys go back to their saved text, the small main row comes from the database.
        const was = touched; touched = null;
        for (const cl of SHARDED) for (const k of (was && was[cl]) || []) {
          if (k in cache.json[cl]) cache.raw[cl][k] = JSON.parse(cache.json[cl][k]); else delete cache.raw[cl][k];
        }
        const main = { ...r.row.data }; delete main.__v;
        cache.state = { ...main }; for (const cl of SHARDED) cache.state[cl] = cache.proxy[cl];
        await c.query("rollback").catch(() => {});
        refused = true;
        throw e;
      }
      var mine = touched; touched = null;
      // core.js may replace a whole map (s.weekstart = {} at the start of a week) instead of editing it.
      // That swaps out our proxy: copy the new contents into the real map, mark every key old and new as touched.
      for (const cl of SHARDED) {
        const now = cache.state[cl];
        if (now === cache.proxy[cl]) continue;
        const raw = cache.raw[cl], keep = isMap(now) ? now : {};
        (mine[cl] ||= new Set());
        for (const k of Object.keys(raw)) { mine[cl].add(k); delete raw[k]; }
        for (const k of Object.keys(keep)) { mine[cl].add(k); raw[k] = keep[k]; }
        cache.state[cl] = cache.proxy[cl];
      }

      if (VERIFY) for (const cl of SHARDED) {
        for (const k of Object.keys(cache.raw[cl])) if (!(mine[cl] && mine[cl].has(k)) && JSON.stringify(cache.raw[cl][k]) !== cache.json[cl][k]) throw new Error("pgstore verify: " + cl + "/" + k + " changed without being touched");
        for (const k of Object.keys(cache.json[cl])) if (!(k in cache.raw[cl]) && !(mine[cl] && mine[cl].has(k))) throw new Error("pgstore verify: " + cl + "/" + k + " removed without being touched");
      }
      const written = [];
      for (const cl of SHARDED) {
        const put = [], gone = [];
        for (const k of mine[cl] || []) {
          if (k in cache.raw[cl]) { const j = JSON.stringify(cache.raw[cl][k]); if (cache.json[cl][k] !== j) { put.push([k, j]); written.push([cl, k, j]); } }
          else if (k in cache.json[cl]) { gone.push(k); written.push([cl, k, null]); }
        }
        await putShards(c, key, cl, put, v); await dropShards(c, key, cl, gone, v);
      }
      const events = cache.state.events; delete cache.state.events;
      await appendEvents(c, key, events, false);
      if (snapshot) {
        await c.query("insert into app_state_history (key, version, data) values ($1, $2, $3)", [key, r.row.version, snapshot]);
        await housekeeping(c, key);
      }
      const main = { ...cache.state, __v: 2 }; for (const cl of SHARDED) delete main[cl];
      await c.query("update app_state set data = $2, version = $3, updated_at = now() where key = $1", [key, JSON.stringify(main), v]);
      await c.query("commit");
      for (const [cl, k, j] of written) { if (j === null) delete cache.json[cl][k]; else cache.json[cl][k] = j; }
      cache.version = v;
      return out;
    } catch (e) {
      touched = null;
      if (!refused) cache = null; // a database or unexpected failure: reload rather than trust memory
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  /** A random secret (e.g. the session cookie key) made on first use and kept in the database,
   *  so nobody has to generate or paste one into the hosting dashboard. */
  async function secret(name) {
    await init();
    const value = require("node:crypto").randomBytes(32).toString("base64url");
    await pool.query("insert into app_secrets (name, value) values ($1, $2) on conflict (name) do nothing", [name, value]);
    const { rows } = await pool.query("select value from app_secrets where name = $1", [name]);
    return rows[0].value;
  }

  return { read, transact, secret, end: () => pool.end() };
}

module.exports = { createStore, loadFull, SHARDED };
