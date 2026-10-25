// Postgres-backed store for the JSON state used by every build (same read()/transact(fn) shape as lib/filestore.js).
//
// Layout. app_state holds one small jsonb row with the app's settings and markets. The big maps in
// SHARDED (players, phone logins, sessions, positions, trade logs...) are one row per key in app_shards.
// Each market's holder book and payouts (market.book / market.paid: one entry per holder, kept forever) and its price
// history are one row per market in the collection "mkt", so the main row stays small (about 0.3 KB per market).
// Analytics events are append-only rows in app_events and are only loaded when asked for.
// Every write locks the app_state row, so trades never interleave, even across serverless instances.
//
// Speed. Each server instance keeps the state in memory. Before a request it checks the state version
// (one tiny query) and, if other instances wrote, fetches only the shard rows changed since: rows carry
// the version of the write that last touched them, and deletes are tombstones so other instances see them.
// A full reload happens on a cold start and about every CACHE_TTL_MS (a random 75% to 125% of it per
// instance, so copies do not reload together). A write saves only the keys the request touched (the maps
// are proxies that record which keys were read or written) and costs two round trips to the database:
// "begin + lock the row" and "all row changes + commit" in one message.
//
// Correctness inside one instance (the in-memory copy is shared by every request):
//  * One async mutex serializes everything that changes the copy: a write and a refresh from the database.
//    So a refresh can never apply an older snapshot over a newer write, and two writes never interleave.
//  * A refresh never applies an older snapshot. A version that goes DOWN, or a different epoch (a restore
//    or migration re-created the rows), makes the instance reload everything.
//  * While a write is between "changed the copy" and "committed", readers wait for it (no dirty reads).
//  * The cache is never set to null: a new one is built and swapped in, so a request in flight keeps a valid one.
//  * If a write fails before the commit, the copy is rolled back key by key; it is dropped (reloaded on the
//    next call) only when the outcome of the commit is unknown (the connection died during it).
// Set PGSTORE_VERIFY=1 (tests do) to also compare the WHOLE cache with the database after every refresh and
// before every commit, and fail on any difference or on a change the proxies missed.
//
// Rollback copies (app_state_history) and backups hold the FULL state in the old single-blob shape;
// an app_state row without "__v" is treated as such a blob and is re-sharded by the next write.
//
// Env: POSTGRES_URL (set by Vercel's Supabase integration) or DATABASE_URL.
// Tables are created on first use, only when a catalog check says something is missing, under an advisory lock.
const { Pool } = require("pg");

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000; // a rollback copy at most this often (less often if copies are slow, see snapEvery)
const SNAPSHOT_MAX_MS = 60 * 60 * 1000;
const HISTORY_KEEP_LAST = 48; // rollback copies kept: the newest this many ...
const HISTORY_KEEP_DAYS = 30; // ... plus the last copy of each day for this many days
const SHARDED = ["sessions", "pos", "log", "attempts", "resets", "devices", "users", "auth", "weekstart", "groups", "seen", "otpcodes", "otpsends"]; // top-level maps kept one row per key
const MKT = "mkt"; // per-market row (one per market id) holding the fields that grow with history
const MFIELDS = ["book", "paid", "hist"]; // book/paid: one entry per holder, kept forever; hist: the price history (up to 48 points)
const COLLS = SHARDED.concat([MKT]);
const META = ["__v", "__e", "__snap"]; // bookkeeping fields in the main row, never part of the state
const EVENTS_KEEP = 50000; // analytics events kept (same cap core.js uses)
const CACHE_TTL_MS = 10 * 60 * 1000; // full reload about this often, whatever the version says
const TOMBSTONE_KEEP = "1 hour"; // deleted shard rows are kept this long so other instances see the delete
const MAX_QUEUE = 150; // writes/refreshes waiting in this process before we answer "busy" (503)
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const newEpoch = () => require("node:crypto").randomBytes(8).toString("hex");

function poolFor(url) {
  if (!url) throw new Error("pgstore: set POSTGRES_URL or DATABASE_URL");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Supabase's pooler cert does not chain to Node's default CAs; sslmode in the URL would force verify.
  const connectionString = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 8000, ssl: local ? false : { rejectUnauthorized: false } });
  // A connection dropped by the database (restart, pooler timeout, killed backend) must never crash the process,
  // whether it is idle (pool 'error') or checked out (client 'error': the pool removes its own listener then).
  pool.on("error", (e) => console.error("pgstore: idle connection lost:", errText(e)));
  pool.on("connect", (cl) => guard(cl));
  return pool;
}
/** Give a client an 'error' listener (once). Returns the client. */
function guard(cl) {
  if (!cl.__guarded) { cl.__guarded = true; cl.on("error", (e) => { cl.__broken = true; console.error("pgstore: connection error:", errText(e)); }); }
  return cl;
}
/** One log line for an error, without connection strings or row contents. */
function errText(e) {
  const m = String((e && e.message) || e).split("\n")[0].replace(/(postgres(ql)?:\/\/)[^@\s]*@/gi, "$1***@").slice(0, 200);
  return (e && e.code ? e.code + " " : "") + m;
}
/** Is this a Postgres or network error (as opposed to an application error such as bonus_taken)? */
const isDbError = (e) => !!e && (e.db === true || e.severity !== undefined || /^[0-9A-Z]{5}$/.test(e.code || "") || /^E[A-Z]+$/.test(e.code || ""));
/** A definite answer from the database (the statement failed, the connection is fine), as opposed to a lost connection. */
const isSqlError = (e) => !!e && e.severity !== undefined;
/** Tag a database error with the HTTP status the API should answer: 503 when retrying may help, else 500. */
function mark(e) {
  if (!e || typeof e !== "object" || e.http) return e;
  e.db = true;
  const c = String(e.code || ""), sqlstate = /^[0-9A-Z]{5}$/.test(c);
  e.http = !sqlstate || c === "55P03" || ["08", "40", "53", "57"].includes(c.slice(0, 2)) || /timeout|terminat|connection|ended|ECONN/i.test(e.message || "") ? 503 : 500;
  return e;
}
const busy = () => Object.assign(new Error("pgstore: too many requests waiting for the database"), { db: true, http: 503, code: "XXBSY" });

/** An SQL string literal that is safe whatever standard_conforming_strings says. */
const lit = (s) => " E'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
/** JSON text of v that jsonb will accept: a NUL character and a lone UTF-16 surrogate (both legal JSON, both rejected by jsonb)
 *  are removed / replaced. */
const BAD_CHARS = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
function ser(v) {
  const t = JSON.stringify(v);
  return /\\u0000|\\ud[89a-f]/i.test(t) ? JSON.stringify(v, (k, x) => (typeof x === "string" ? x.replace(BAD_CHARS, (c) => (c === "\u0000" ? "" : "\ufffd")) : x)) : t;
}
/** `{k: jsonText, ...}` as one JSON document, without parsing the values again. */
const objText = (entries) => "{" + entries.map(([k, j]) => JSON.stringify(k) + ":" + j).join(",") + "}";
/** Same value, same text, whatever the key order (jsonb reorders keys). For the verify checks. */
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => ((o[kk] = x[kk]), o), {}) : x));
const stripMeta = (data) => { const m = { ...data }; for (const k of META) delete m[k]; return m; };

/** A simple async mutex with a bounded queue. */
function mutex() {
  let tail = Promise.resolve(), waiting = 0;
  return {
    async acquire() {
      if (waiting >= MAX_QUEUE) throw busy();
      waiting++;
      let release; const prev = tail; tail = new Promise((r) => (release = r));
      await prev; waiting--;
      return release;
    },
  };
}

/** The full state for `key`, as one object, from a pool or a client. Returns null if there is no row.
 *  Used by backups and tests. The state has the OLD single-blob shape (every market carries its own book and paid),
 *  so it can be restored by pasting it into app_state.data. `shards` is the json text of every shard row as loaded
 *  (null for a legacy single-blob row). */
async function loadFull(q, key, lock, opts) {
  const { rows } = await q.query(
    "select data, version, updated_at from app_state where key = $1" + (lock ? " for update" : ""), [key]);
  if (!rows[0]) return null;
  const { data, updated_at } = rows[0], version = Number(rows[0].version); // bigint arrives as text
  if (!data.__v) return { state: data, version, updated_at, shards: null, saved: JSON.stringify(data) };
  const state = stripMeta(data);
  const shards = {};
  for (const c of COLLS) shards[c] = {};
  for (const c of SHARDED) state[c] = {};
  const { rows: sr } = await q.query("select coll, k, data from app_shards where key = $1 and not deleted", [key]);
  for (const r of sr) if (shards[r.coll]) { shards[r.coll][r.k] = JSON.stringify(r.data); if (r.coll !== MKT) state[r.coll][r.k] = r.data; }
  if (Array.isArray(state.markets)) state.markets = state.markets.map((m) => { const x = m && shards[MKT][m.id]; return x ? { ...m, ...JSON.parse(x) } : m; });
  // Analytics events live in app_events and are only loaded when asked for (metrics, backups).
  // Otherwise state.events is absent and core.js starts a fresh list, which is appended to the table on save.
  delete state.events;
  if (opts && opts.events) state.events = (await q.query("select e from app_events where key = $1 order by id", [key])).rows.map((r) => r.e);
  return { state, version, updated_at, shards, eventsLoaded: !!(opts && opts.events) };
}

/** Write a whole legacy state out as main row content plus shard rows (used to migrate a legacy blob).
 *  Every old shard row becomes a tombstone first, so instances that cached them see them go (a restore). */
async function saveFull(c, key, state, v) {
  const main = { ...state }; delete main.events;
  await c.query("update app_shards set data = 'null'::jsonb, v = $2, deleted = true, t = now() where key = $1 and not deleted", [key, v]);
  await appendEvents(c, key, state.events, true);
  for (const coll of SHARDED) {
    const cur = state[coll];
    if (!isMap(cur)) continue; // missing or odd: leave it where it is (inline) rather than lose it
    delete main[coll];
    await putShards(c, key, coll, Object.keys(cur).map((k) => [k, ser(cur[k])]), v);
  }
  if (Array.isArray(main.markets)) { // book and paid of every market go to their own rows
    const mk = [];
    main.markets = main.markets.map((m) => {
      if (!isMap(m) || typeof m.id !== "string") return m;
      const o = {}; for (const f of MFIELDS) if (m[f] !== undefined) o[f] = m[f];
      if (!Object.keys(o).length) return m;
      mk.push([m.id, ser(o)]);
      const rest = { ...m }; for (const f of MFIELDS) delete rest[f]; return rest;
    });
    await putShards(c, key, MKT, mk, v);
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
async function appendEvents(c, key, events, replace) {
  if (replace) await c.query("delete from app_events where key = $1", [key]);
  if (!Array.isArray(events) || !events.length) return;
  await c.query("insert into app_events (key, e) select $1, v from jsonb_array_elements($2::jsonb) with ordinality x(v, n) order by n", [key, ser(events)]);
}

/** One full copy of the state, in the old blob shape, taken by the database itself in ONE statement (one snapshot):
 *  no JSON work in this process. $1 = key, $2 = the SHARDED names (so empty maps are present, like in a backup). */
const SNAPSHOT_SQL =
  "insert into app_state_history (key, version, data) " +
  "select s.key, s.version, (s.data - '__v' - '__e' - '__snap') " +
  " || (select jsonb_object_agg(c, '{}'::jsonb) from unnest($2::text[]) c) " +
  " || coalesce((select jsonb_object_agg(coll, m) from (select coll, jsonb_object_agg(k, data) m from app_shards where key = s.key and not deleted and coll <> 'mkt' group by coll) x), '{}'::jsonb) " +
  " || jsonb_build_object('markets', coalesce((select jsonb_agg(case when k.data is null then e.v else e.v || k.data end order by e.n) " +
  "      from jsonb_array_elements(s.data->'markets') with ordinality e(v, n) " +
  "      left join app_shards k on k.key = s.key and k.coll = 'mkt' and k.k = e.v->>'id' and not k.deleted), '[]'::jsonb)) " +
  "from app_state s where s.key = $1";
/** Keep the newest $2 copies and the last copy of each of the last $3 days. */
const PRUNE_HISTORY_SQL =
  "delete from app_state_history where key = $1 and id not in (" +
  " (select id from app_state_history where key = $1 order by id desc limit $2)" +
  " union select max(id) from app_state_history where key = $1 and saved_at > now() - make_interval(days => $3::int) group by date_trunc('day', saved_at))";

const SCHEMA_OK_SQL =
  "select (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = current_schema() " +
  "  and c.relname in ('app_state','app_state_history','app_events','app_secrets','app_shards','app_events_key_id','app_shards_v','app_state_history_key_id')) = 8 " +
  "and (select count(*) from information_schema.columns where table_schema = current_schema() and table_name = 'app_shards' and column_name in ('v','deleted','t')) = 3 as ok";
const SCHEMA_DDL = [
  "create table if not exists app_state (key text primary key, data jsonb not null, version bigint not null default 1, updated_at timestamptz not null default now())",
  "create table if not exists app_state_history (id bigserial primary key, key text not null, version bigint not null, data jsonb not null, saved_at timestamptz not null default now())",
  "create table if not exists app_events (id bigserial primary key, key text not null, e jsonb not null)",
  "create index if not exists app_events_key_id on app_events (key, id)",
  "create table if not exists app_secrets (name text primary key, value text not null)",
  "create table if not exists app_shards (key text not null, coll text not null, k text not null, data jsonb not null, primary key (key, coll, k))",
  "alter table app_shards add column if not exists v bigint not null default 0",
  "alter table app_shards add column if not exists deleted boolean not null default false",
  "alter table app_shards add column if not exists t timestamptz not null default now()",
  "create index if not exists app_shards_v on app_shards (key, v)",
  "create index if not exists app_state_history_key_id on app_state_history (key, id)",
];

/** `migrate` (optional, default Core.migrate): the state migration. It runs inside a write, never on the shared copy
 *  of a read: after every full load the store runs it once in a transaction (a no-op, no version bump, if nothing changes). */
function createStore({ url = process.env.POSTGRES_URL || process.env.DATABASE_URL, key = "main", seed, migrate, snapshotEveryMs, cacheTtlMs }) {
  if (migrate === undefined) { try { migrate = require("../core.js").migrate; } catch { migrate = null; } }
  const VERIFY = process.env.PGSTORE_VERIFY === "1"; // read when the store is made, so tests can switch it
  const pool = poolFor(url);
  const mu = mutex();
  const stats = { fullLoads: 0, deltas: 0, writes: 0, noops: 0, refused: 0, failed: 0, snapshots: 0 };
  let ready = null;
  // cache: { state, raw, proxy, json, mproxy, tracked, version, epoch, snapAt, mainText, loadedAt, ttl, pendingMkt, migrated }
  //   raw[coll]   the real map          proxy[coll]  what core.js sees (records touched keys)
  //   json[coll]  last saved json text per key, to tell what changed
  //   mainText    json of the main row as last saved (what a rollback restores)
  let cache = null, needFull = false, refreshing = null, touched = null;
  let dirty = false, writeDone = Promise.resolve(), endWrite = null; // a write has changed the copy and not yet committed
  let snapshotting = null, lastSnapCost = 0;
  let waitUntil = null; try { waitUntil = require("@vercel/functions").waitUntil; } catch { /* not on Vercel */ }
  const snapEvery = () => snapshotEveryMs || Math.min(SNAPSHOT_MAX_MS, Math.max(SNAPSHOT_EVERY_MS, lastSnapCost * 60)); // copies use at most ~1/60 of database time

  // ---- database access -------------------------------------------------------------------------------------
  async function dq(q, text, params) { try { return await q.query(text, params); } catch (e) { throw mark(e); } }
  async function checkout() { try { return guard(await pool.connect()); } catch (e) { throw mark(e); } }
  async function withClient(fn) {
    const cl = await checkout(); let bad = false;
    try { return await fn(cl); } catch (e) { if (isDbError(e) && !isSqlError(e)) bad = true; throw e; } finally { cl.release(bad || cl.__broken ? true : undefined); }
  }

  async function ensureSchema() {
    if ((await dq(pool, SCHEMA_OK_SQL)).rows[0].ok) return; // the normal case: a catalog read, no table locks
    await withClient(async (c) => {
      // Only one instance creates the tables; the others wait for its lock, then find nothing to do.
      await dq(c, "begin; select pg_advisory_xact_lock(727274); set local lock_timeout = '10s'");
      try {
        if (!(await dq(c, SCHEMA_OK_SQL)).rows[0].ok) for (const s of SCHEMA_DDL) await dq(c, s);
        await dq(c, "commit");
      } catch (e) { await c.query("rollback").catch(() => {}); throw e; }
    });
  }
  function init() {
    ready ??= (async () => {
      await ensureSchema();
      if (!(await dq(pool, "select 1 from app_state where key = $1", [key])).rows.length)
        await dq(pool, "insert into app_state (key, data) values ($1, $2) on conflict (key) do nothing", [key, JSON.stringify(await seed())]);
    })().catch((e) => { ready = null; throw e; });
    return ready;
  }

  // ---- the in-memory copy ----------------------------------------------------------------------------------
  const touch = (coll, k) => { if (touched && typeof k === "string") (touched[coll] ||= new Set()).add(k); };
  const rawOf = new WeakMap(); // proxy -> the object behind it
  function watch(coll, raw) {
    return new Proxy(raw, {
      get(t, k, r) { if (Object.prototype.hasOwnProperty.call(t, k)) touch(coll, k); return Reflect.get(t, k, r); },
      set(t, k, v) { touch(coll, k); t[k] = v; return true; },
      deleteProperty(t, k) { touch(coll, k); return delete t[k]; },
    });
  }
  /** market.book / market.paid: a write to them marks the market's row as changed. */
  function watchBook(id, obj) {
    const p = new Proxy(obj, {
      set(t, k, v) { touch(MKT, id); t[k] = v; return true; },
      deleteProperty(t, k) { touch(MKT, id); return delete t[k]; },
    });
    rawOf.set(p, obj); return p;
  }
  function mget(c, id, f) {
    const r = c.raw[MKT][id];
    if (!r || r[f] === undefined) return undefined;
    if (!touched || r[f] === null || typeof r[f] !== "object") return r[f]; // outside a write nothing needs tracking
    const px = (c.mproxy[id] ||= {});
    return (px[f] ||= watchBook(id, r[f]));
  }
  function mset(c, id, f, v) {
    touch(MKT, id);
    const r = (c.raw[MKT][id] ||= {});
    if (v === undefined) delete r[f]; else r[f] = (v && rawOf.get(v)) || v;
    if (c.mproxy[id]) delete c.mproxy[id][f];
  }
  /** Make market.book, .paid and .hist accessors onto the cache's own rows (not enumerable, so the main row never contains them). */
  function track(c, m, quiet) {
    if (!m || typeof m !== "object" || typeof m.id !== "string" || c.tracked.has(m)) return;
    c.tracked.add(m);
    const id = m.id;
    for (const f of MFIELDS) {
      const had = own(m, f) ? m[f] : undefined;
      Object.defineProperty(m, f, { configurable: true, enumerable: false, get() { return mget(c, id, f); }, set(v) { mset(c, id, f, v); } });
      if (had !== undefined) { mset(c, id, f, had); if (quiet) c.pendingMkt.add(id); } // an old main row still carried it inline (book/paid/hist before they moved): it moves to its own row on the next write
    }
  }
  /** Install the main row `data` (without META) as the state of cache `c`. */
  function setMain(c, data) {
    const main = stripMeta(data);
    c.pendingMkt = new Set(); c.tracked = new WeakSet();
    if (Array.isArray(main.markets)) for (const m of main.markets) track(c, m, true);
    for (const cl of SHARDED) main[cl] = c.proxy[cl];
    c.state = main;
  }
  /** A fresh cache from the main row and the live shard rows. */
  function newCache(row, rows) {
    const c = { raw: {}, proxy: {}, json: {}, mproxy: {}, tracked: new WeakSet(), pendingMkt: new Set(), loadedAt: Date.now(), ttl: (cacheTtlMs || CACHE_TTL_MS) * (0.75 + 0.5 * Math.random()),
      version: row.version, epoch: row.data.__e || null, snapAt: Number(row.data.__snap) || 0, migrated: false, state: null, mainText: JSON.stringify(stripMeta(row.data)) };
    for (const cl of COLLS) { c.raw[cl] = {}; c.json[cl] = {}; }
    for (const r of rows) if (!r.deleted && c.raw[r.coll]) { c.raw[r.coll][r.k] = r.data; c.json[r.coll][r.k] = JSON.stringify(r.data); }
    for (const cl of SHARDED) c.proxy[cl] = watch(cl, c.raw[cl]);
    setMain(c, row.data);
    stats.fullLoads++;
    return c;
  }
  /** Apply the shard rows changed since c.version and the new main row, in place. */
  function applyDelta(c, row, rows) {
    for (const r of rows) {
      if (!c.raw[r.coll]) continue;
      if (r.coll === MKT) delete c.mproxy[r.k];
      if (r.deleted) { delete c.raw[r.coll][r.k]; delete c.json[r.coll][r.k]; }
      else { c.raw[r.coll][r.k] = r.data; c.json[r.coll][r.k] = JSON.stringify(r.data); }
    }
    c.mainText = JSON.stringify(stripMeta(row.data));
    setMain(c, row.data);
    c.version = row.version; c.snapAt = Number(row.data.__snap) || c.snapAt;
    stats.deltas++;
  }
  const expired = (c) => Date.now() - c.loadedAt >= c.ttl;
  /** What a database row means for the copy: legacy (old blob), full (reload everything), delta, or same. */
  function decide(row, since) {
    if (!row.data.__v) return "legacy";
    if (!cache || needFull || since === -1) return "full";
    if (row.version < cache.version || (row.data.__e || null) !== cache.epoch) return "full"; // a restore or migration re-created the rows
    return row.version === cache.version ? "same" : "delta";
  }
  const rowOf = (data, version) => ({ data, version: Number(version) }); // bigint arrives as text

  /** Main row plus every shard row with v > since, in ONE statement (one consistent snapshot, one round trip). */
  async function fetchUnion(q, since) {
    const { rows } = await dq(q,
      "select 'm' as t, ''::text as coll, ''::text as k, data, version::text as v, false as deleted from app_state where key = $1 " +
      "union all select 's', coll, k, data, v::text, deleted from app_shards where key = $1 and v > $2::bigint", [key, since]);
    const m = rows.find((r) => r.t === "m");
    return { row: m ? rowOf(m.data, m.v) : null, rows: rows.filter((r) => r.t === "s") };
  }
  async function fetchShards(q, since) {
    return (await dq(q, "select coll, k, data, deleted from app_shards where key = $1 and v > $2::bigint", [key, since])).rows;
  }

  /** Bring the copy up to date with the database. Caller holds the mutex. Returns the legacy blob if the row is one. */
  async function doRefresh(q) {
    let since = cache && !needFull && !expired(cache) ? cache.version : -1;
    for (;;) {
      const { row, rows } = await fetchUnion(q, since);
      if (!row) throw mark(new Error("pgstore: the state row is missing"));
      const mode = decide(row, since);
      if (mode === "full" && since !== -1) { since = -1; continue; }
      if (mode === "legacy") { needFull = true; return row.data; } // old single-blob row: the next write migrates it
      if (mode === "full") { cache = newCache(row, rows); needFull = false; }
      else if (mode === "delta") applyDelta(cache, row, rows);
      if (VERIFY) await compareWithDb(q, cache);
      return null;
    }
  }
  /** The main row's content for cache `c` (no shard maps, no events, no META). */
  function mainOf(c) { const m = { ...c.state }; for (const cl of SHARDED) delete m[cl]; delete m.events; return m; }
  /** Fail loudly if the cache differs from what the database holds (as seen by `q`, whose snapshot must match). */
  async function compareWithDb(q, c) {
    const { row, rows } = await fetchUnion(q, -1);
    const fail = (what) => { throw new Error("pgstore verify: the cache differs from the database: " + what); };
    const pending = c.pendingMkt; // an older main row that still carries book/paid/hist inline: the next write moves them
    if (row.data.__v && !pending.size && canon(stripMeta(row.data)) !== canon(mainOf(c))) fail("main row");
    for (const cl of COLLS) {
      const db = {}; for (const r of rows) if (r.coll === cl && !r.deleted) db[r.k] = r.data;
      const mine = {}; for (const k of Object.keys(c.raw[cl])) if (!(cl === MKT && !Object.keys(c.raw[cl][k]).length)) mine[k] = c.raw[cl][k];
      for (const k of new Set([...Object.keys(db), ...Object.keys(mine)])) if (!(cl === MKT && pending.has(k)) && canon(db[k]) !== canon(mine[k])) fail(cl + "/" + k + (k in db ? (k in mine ? " differs" : " is missing in the cache") : " is missing in the database"));
    }
  }

  async function withRR(fn) {
    return withClient(async (c) => {
      await dq(c, "begin isolation level repeatable read read only");
      try { const r = await fn(c); await dq(c, "commit"); return r; } catch (e) { await c.query("rollback").catch(() => {}); throw e; }
    });
  }
  /** Single-flight refresh under the mutex. */
  function refresh() {
    refreshing ??= (async () => {
      const release = await mu.acquire();
      try { return await (VERIFY ? withRR((c) => doRefresh(c)) : doRefresh(pool)); }
      finally { release(); refreshing = null; }
    })();
    return refreshing;
  }
  async function dbVersion() {
    const { rows } = await dq(pool, "select version from app_state where key = $1", [key]);
    if (!rows[0]) throw mark(new Error("pgstore: the state row is missing"));
    return Number(rows[0].version);
  }

  async function currentState() {
    for (;;) {
      if (dirty) { await writeDone; continue; } // a write is between "changed" and "committed": wait, never show uncommitted data
      const c = cache;
      if (c && !needFull && !expired(c)) {
        const v = await dbVersion(); // fast path: nothing changed since our copy
        if (cache !== c || dirty || needFull) continue;
        if (v === c.version) return c.state;
      }
      const legacy = await refresh();
      if (legacy) return legacy;
      if (cache && !cache.migrated && (migrate || cache.pendingMkt.size)) {
        // Once per full load: migrations and moves to new rows are saved by a write, never made on the shared copy.
        cache.migrated = true;
        await transact((s) => { if (migrate) migrate(s); });
        continue;
      }
      if (dirty || !cache || needFull) continue;
      return cache.state;
    }
  }
  async function read(opts) {
    await init();
    for (;;) {
      const s = await currentState();
      if (!(opts && opts.events)) return s;
      const events = (await dq(pool, "select e from app_events where key = $1 order by id", [key])).rows.map((r) => r.e);
      if (!dirty) return { ...s, events }; // a write that started meanwhile would show uncommitted data: read again
    }
  }

  /** Put the touched keys back exactly as last saved and the small main row from its saved text. */
  function rollbackMem(c, changed) {
    for (const cl of COLLS) for (const k of (changed && changed[cl]) || []) {
      if (cl === MKT) delete c.mproxy[k];
      if (k in c.json[cl]) c.raw[cl][k] = JSON.parse(c.json[cl][k]); else delete c.raw[cl][k];
    }
    setMain(c, JSON.parse(c.mainText));
  }

  /** Run fn on the state and save it. If fn throws, nothing is saved and the in-memory copy is put back. */
  async function transact(fn) {
    await init();
    const release = await mu.acquire();
    try { return await txn(fn); } finally { release(); }
  }
  async function txn(fn) {
    let c = null, cc = null, changed = null, refused = false, mutated = false, sent = false;
    try {
      c = await checkout();
      const lockRes = await dq(c, "begin; select data, version from app_state where key = " + lit(key) + " for update");
      const r0 = lockRes[1].rows[0];
      if (!r0) throw mark(new Error("pgstore: the state row is missing"));
      const row = rowOf(r0.data, r0.version), v = row.version + 1;

      if (!row.data.__v) { // migrate a single-blob row (or a restored copy) in this one transaction
        needFull = true;
        const draft = row.data, saved = JSON.stringify(draft);
        let out;
        try { out = await fn(draft); } catch (e) { refused = true; throw e; }
        await dq(c, "insert into app_state_history (key, version, data) values ($1, $2, $3)", [key, row.version, saved]);
        let main;
        try { main = await saveFull(c, key, draft, v); } catch (e) { throw mark(e); }
        main.__v = 2; main.__e = newEpoch(); main.__snap = Date.now();
        await dq(c, "update app_state set data = $2, version = $3, updated_at = now() where key = $1", [key, ser(main), v]);
        sent = true;
        await dq(c, "commit");
        stats.writes++;
        return out;
      }

      // Bring the copy up to date (this write holds the row lock, so nobody else changes the database meanwhile).
      const mode = decide(row, cache && !needFull && !expired(cache) ? cache.version : -1);
      if (mode === "full") { cache = newCache(row, await fetchShards(c, -1)); needFull = false; }
      else if (mode === "delta") applyDelta(cache, row, await fetchShards(c, cache.version));
      cc = cache;

      dirty = true; writeDone = new Promise((ok) => (endWrite = ok));
      mutated = true;
      touched = {};
      for (const id of cc.pendingMkt) touch(MKT, id); // markets whose book/paid an old main row still held inline
      let out;
      try { out = await fn(cc.state); }
      catch (e) { // A refused request (bonus_taken, too_big, ...) is normal: undo exactly what it changed.
        changed = touched; touched = null; rollbackMem(cc, changed); refused = true; stats.refused++;
        throw e;
      }
      // Markets added by this request get their book/paid accessors; rows of removed markets go.
      const ids = new Set();
      if (Array.isArray(cc.state.markets)) for (const m of cc.state.markets) if (m && typeof m.id === "string") { ids.add(m.id); track(cc, m, false); }
      for (const id of Object.keys(cc.raw[MKT])) if (!ids.has(id)) { delete cc.raw[MKT][id]; delete cc.mproxy[id]; touch(MKT, id); }
      const mine = touched; touched = null; changed = mine;
      // core.js may replace a whole map (s.weekstart = {} at the start of a week) instead of editing it.
      // That swaps out our proxy: copy the new contents into the real map, mark every key old and new as touched.
      for (const cl of SHARDED) {
        const now = cc.state[cl];
        if (now === cc.proxy[cl]) continue;
        const raw = cc.raw[cl], keep = isMap(now) ? now : {};
        (mine[cl] ||= new Set());
        for (const k of Object.keys(raw)) { mine[cl].add(k); delete raw[k]; }
        for (const k of Object.keys(keep)) { mine[cl].add(k); raw[k] = keep[k]; }
        cc.state[cl] = cc.proxy[cl];
      }

      if (VERIFY) for (const cl of COLLS) { // a change the proxies missed would be lost on the next reload
        for (const k of Object.keys(cc.raw[cl])) if (!(mine[cl] && mine[cl].has(k)) && JSON.stringify(cc.raw[cl][k]) !== cc.json[cl][k]) throw new Error("pgstore verify: " + cl + "/" + k + " changed without being touched");
        for (const k of Object.keys(cc.json[cl])) if (!(k in cc.raw[cl]) && !(mine[cl] && mine[cl].has(k))) throw new Error("pgstore verify: " + cl + "/" + k + " removed without being touched");
      }
      const puts = [], gones = [];
      for (const cl of COLLS) for (const k of mine[cl] || []) {
        const val = cc.raw[cl][k];
        if (k in cc.raw[cl] && !(cl === MKT && !Object.keys(val).length)) {
          let j = JSON.stringify(val);
          if (/\\u0000|\\ud[89a-f]/i.test(j)) { const j2 = ser(val); if (j2 !== j) { j = j2; cc.raw[cl][k] = JSON.parse(j); } } // keep the copy equal to what the database will hold
          if (cc.json[cl][k] !== j) puts.push([cl, k, j]);
        } else if (k in cc.json[cl]) gones.push([cl, k]);
      }
      const events = cc.state.events; delete cc.state.events;
      const main = mainOf(cc), rawMainText = JSON.stringify(main), mainText = ser(main);
      if (rawMainText !== mainText) setMain(cc, JSON.parse(mainText)); // a NUL character in the main row was removed: the copy follows
      const hasEvents = Array.isArray(events) && events.length > 0;
      if (!puts.length && !gones.length && !hasEvents && mainText === cc.mainText) { // nothing to save: no version bump
        await dq(c, "rollback"); stats.noops++;
        return out;
      }

      const now = Date.now(), claim = !cc.snapAt || now - cc.snapAt >= snapEvery();
      if (!cc.epoch) cc.epoch = newEpoch();
      const rowText = ser({ ...JSON.parse(mainText), __v: 2, __e: cc.epoch, __snap: claim ? now : cc.snapAt });
      const K = lit(key), parts = [];
      if (puts.length) parts.push("up as (insert into app_shards (key, coll, k, data, v, deleted, t) select " + K + ", e->>'c', e->>'k', e->'d', " + v + ", false, now() from jsonb_array_elements(" +
        lit("[" + puts.map(([cl, k, j]) => '{"c":' + JSON.stringify(cl) + ',"k":' + JSON.stringify(k) + ',"d":' + j + "}").join(",") + "]") +
        "::jsonb) e on conflict (key, coll, k) do update set data = excluded.data, v = excluded.v, deleted = false, t = now())");
      if (gones.length) parts.push("dl as (update app_shards s set data = 'null'::jsonb, v = " + v + ", deleted = true, t = now() from jsonb_array_elements(" +
        lit("[" + gones.map(([cl, k]) => '{"c":' + JSON.stringify(cl) + ',"k":' + JSON.stringify(k) + "}").join(",") + "]") +
        "::jsonb) e where s.key = " + K + " and s.coll = e->>'c' and s.k = e->>'k')");
      if (hasEvents) parts.push("ev as (insert into app_events (key, e) select " + K + ", x from jsonb_array_elements(" + lit(ser(events)) + "::jsonb) with ordinality t(x, n) order by n)");
      parts.push("st as (update app_state set data = " + lit(rowText) + "::jsonb, version = " + v + ", updated_at = now() where key = " + K + ")");
      const sql = "with " + parts.join(", ") + " select 1";
      sent = true;
      if (VERIFY) { await dq(c, sql); await compareWithDb(c, cc); await dq(c, "commit"); }
      else await dq(c, sql + "; commit");

      for (const [cl, k, j] of puts) cc.json[cl][k] = j;
      for (const [cl, k] of gones) delete cc.json[cl][k];
      cc.version = v; cc.mainText = mainText; cc.snapAt = claim ? now : cc.snapAt; cc.pendingMkt = new Set();
      stats.writes++;
      if (claim) startSnapshot();
      return out;
    } catch (e) {
      if (!changed) changed = touched;
      touched = null;
      if (c) { // free the row lock; if even that fails the connection is gone and the database releases the lock
        try { if (!c.__broken) await c.query("rollback"); } catch { c.__broken = true; }
      }
      if (!refused) {
        stats.failed++;
        if (isDbError(e)) mark(e);
        if (c && isDbError(e) && !isSqlError(e)) c.__broken = true; // connection trouble: do not reuse that connection
        if (cc && mutated) {
          // A failed statement aborts the transaction: nothing was saved, so undo it in memory.
          // If the connection died while the write was on its way, it may or may not have committed: reload.
          if (sent && isDbError(e) && !isSqlError(e)) needFull = true; else rollbackMem(cc, changed || touchedAll(cc));
        }
      }
      throw e;
    } finally {
      if (dirty) { dirty = false; if (endWrite) endWrite(); }
      if (c) c.release(c.__broken ? true : undefined);
    }
  }
  /** Used when a write failed before its touched keys were collected: be safe and put everything it could have touched back. */
  function touchedAll(c) { const all = {}; for (const cl of COLLS) all[cl] = new Set(Object.keys(c.raw[cl]).concat(Object.keys(c.json[cl]))); return all; }

  /** A copy of the whole state in app_state_history, taken by the database after the commit (not on the request path),
   *  then old copies and old rows are cleaned up. At most one at a time per instance. */
  function startSnapshot() {
    if (snapshotting) return snapshotting;
    snapshotting = (async () => {
      const t0 = Date.now();
      try {
        await withClient(async (c) => {
          await c.query("begin; set local statement_timeout = '120s'");
          try { await c.query(SNAPSHOT_SQL, [key, SHARDED]); await c.query("commit"); } catch (e) { await c.query("rollback").catch(() => {}); throw e; }
        });
        stats.snapshots++;
        lastSnapCost = Date.now() - t0;
        await pool.query(PRUNE_HISTORY_SQL, [key, HISTORY_KEEP_LAST, HISTORY_KEEP_DAYS]);
        await pool.query("delete from app_events where key = $1 and id <= (select max(id) - $2 from app_events where key = $1)", [key, EVENTS_KEEP]);
        await pool.query("delete from app_shards where key = $1 and deleted and t < now() - $2::interval", [key, TOMBSTONE_KEEP]);
      } catch (e) { console.error("pgstore: rollback copy failed:", errText(e)); }
      finally { snapshotting = null; }
    })();
    try { if (waitUntil) waitUntil(snapshotting); } catch { /* not in a Vercel request */ }
    return snapshotting;
  }

  /** A random secret (e.g. the session cookie key) made on first use and kept in the database,
   *  so nobody has to generate or paste one into the hosting dashboard. */
  async function secret(name) {
    await init();
    const value = require("node:crypto").randomBytes(32).toString("base64url");
    await dq(pool, "insert into app_secrets (name, value) values ($1, $2) on conflict (name) do nothing", [name, value]);
    const { rows } = await dq(pool, "select value from app_secrets where name = $1", [name]);
    return rows[0].value;
  }

  /** Reload from the database now and compare the whole cache with it (tests). Throws on any difference. */
  async function verify() {
    await init();
    const release = await mu.acquire();
    try { await withRR(async (c) => { if (!(await doRefresh(c))) await compareWithDb(c, cache); }); } finally { release(); }
  }

  return {
    read, transact, secret, verify, stats, ttl: () => (cache ? cache.ttl : null),
    flush: async () => { while (snapshotting) await snapshotting; }, // wait for the background rollback copy (tests)
    end: async () => { while (snapshotting) await snapshotting; await pool.end(); },
  };
}

module.exports = { createStore, loadFull, SHARDED, COLLS, isDbError };
