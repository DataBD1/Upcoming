// Postgres-backed replacement for the JSON-file stores used by every build
// (handoff-engine/store.ts, rival-a/server.js, rival-c/server.js).
// The app state is one small jsonb row (app_state) plus one row per player/session/etc. for the
// large maps in SHARDED (app_shards). Each write still locks the app_state row, so trades never
// interleave even across serverless instances, but it now rewrites only the shard rows that
// changed, not the whole state. Reads still load every shard, so the next step past a few
// thousand players is loading only the shards a request needs (a change in core.js).
// Rollback copies (app_state_history) and backups hold the FULL state in the old single-blob
// shape; an app_state row without "__v" is treated as such a blob and is re-sharded by the next write.
//
// Env: POSTGRES_URL (set by Vercel's Supabase integration) or DATABASE_URL.
// Tables are created on first use, so nobody has to run SQL by hand.
const { Pool } = require("pg");

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000; // keep a rollback copy at most every 10 minutes
const SHARDED = ["sessions", "pos", "log", "attempts", "resets", "devices"]; // top-level maps kept one row per key
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function poolFor(url) {
  if (!url) throw new Error("pgstore: set POSTGRES_URL or DATABASE_URL");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Supabase's pooler cert does not chain to Node's default CAs; sslmode in the URL would force verify.
  const connectionString = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const pool = new Pool({ connectionString, max: 3, ssl: local ? false : { rejectUnauthorized: false } });
  // An idle connection dropped by the database (restart, pooler timeout) must not crash the process.
  pool.on("error", (e) => console.error("pgstore: idle connection lost:", e.message));
  return pool;
}


/** The full state for `key`, as one object, from a pool or a client. Returns null if there is no row.
 *  `shards` is the json text of every shard row as loaded (null for a legacy single-blob row), used to find what changed. */
async function loadFull(q, key, lock) {
  const { rows } = await q.query(
    "select data, version, updated_at from app_state where key = $1" + (lock ? " for update" : ""), [key]);
  if (!rows[0]) return null;
  const { data, version, updated_at } = rows[0];
  if (!data.__v) return { state: data, version, updated_at, shards: null, saved: JSON.stringify(data) };
  const state = { ...data }; delete state.__v;
  const shards = {};
  for (const c of SHARDED) { state[c] = {}; shards[c] = {}; }
  const { rows: sr } = await q.query("select coll, k, data from app_shards where key = $1", [key]);
  for (const r of sr) if (shards[r.coll]) { state[r.coll][r.k] = r.data; shards[r.coll][r.k] = JSON.stringify(r.data); }
  return { state, version, updated_at, shards };
}

/** Save `state` as the main row plus shard rows. `shards` is what loadFull saw (null = rewrite every shard). */
async function saveFull(c, key, state, shards) {
  const main = { ...state, __v: 2 };
  if (!shards) await c.query("delete from app_shards where key = $1", [key]);
  for (const coll of SHARDED) {
    const cur = state[coll];
    if (!isMap(cur)) continue; // missing or odd: leave it where it is (inline) rather than lose it
    delete main[coll];
    const old = (shards && shards[coll]) || {}, put = {}, gone = [];
    for (const k of Object.keys(cur)) { const j = JSON.stringify(cur[k]); if (old[k] !== j) put[k] = JSON.parse(j); }
    for (const k of Object.keys(old)) if (!(k in cur)) gone.push(k);
    if (Object.keys(put).length) await c.query(
      "insert into app_shards (key, coll, k, data) select $1, $2, e.key, e.value from jsonb_each($3::jsonb) e " +
      "on conflict (key, coll, k) do update set data = excluded.data", [key, coll, JSON.stringify(put)]);
    if (gone.length) await c.query("delete from app_shards where key = $1 and coll = $2 and k = any($3::text[])", [key, coll, gone]);
  }
  return main;
}

function createStore({ url = process.env.POSTGRES_URL || process.env.DATABASE_URL, key = "main", seed }) {
  const pool = poolFor(url);
  let ready = null;

  function init() {
    ready ??= (async () => {
      await pool.query(`
        create table if not exists app_state (
          key text primary key, data jsonb not null, version bigint not null default 1,
          updated_at timestamptz not null default now());
        create table if not exists app_state_history (
          id bigserial primary key, key text not null, version bigint not null,
          data jsonb not null, saved_at timestamptz not null default now());
        create table if not exists app_secrets (name text primary key, value text not null);
        create table if not exists app_shards (
          key text not null, coll text not null, k text not null, data jsonb not null,
          primary key (key, coll, k));`);
      await pool.query(
        "insert into app_state (key, data) values ($1, $2) on conflict (key) do nothing",
        [key, JSON.stringify(await seed())]);
    })().catch((e) => { ready = null; throw e; });
    return ready;
  }

  async function read() {
    await init();
    return (await loadFull(pool, key, false)).state;
  }

  /** Run fn on a copy of the state and save it. If fn throws, nothing is saved. */
  async function transact(fn) {
    await init();
    const c = await pool.connect();
    try {
      await c.query("begin");
      const cur = await loadFull(c, key, true);
      const draft = cur.state;
      const { rows: last } = await c.query(
        "select max(saved_at) as t from app_state_history where key = $1", [key]);
      // Rollback copies hold the whole state in the single-blob shape, taken before this change.
      const snapshot = !last[0].t || Date.now() - new Date(last[0].t).getTime() > SNAPSHOT_EVERY_MS
        ? cur.saved || JSON.stringify(draft) : null;
      const out = await fn(draft);
      if (snapshot) await c.query("insert into app_state_history (key, version, data) values ($1, $2, $3)",
        [key, cur.version, snapshot]);
      const main = await saveFull(c, key, draft, cur.shards);
      await c.query("update app_state set data = $2, version = version + 1, updated_at = now() where key = $1",
        [key, JSON.stringify(main)]);
      await c.query("commit");
      return out;
    } catch (e) {
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
