// Postgres-backed replacement for the JSON-file stores used by every build
// (handoff-engine/store.ts, rival-a/server.js, rival-c/server.js).
// The whole app state lives in one jsonb row; each write locks that row, so trades never
// interleave even across serverless instances. Fine for the beta (hundreds of users);
// move hot tables out of the blob before it passes a few MB.
//
// Env: POSTGRES_URL (set by Vercel's Supabase integration) or DATABASE_URL.
// Tables are created on first use, so nobody has to run SQL by hand.
const { Pool } = require("pg");

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000; // keep a rollback copy at most every 10 minutes

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
        create table if not exists app_secrets (name text primary key, value text not null);`);
      await pool.query(
        "insert into app_state (key, data) values ($1, $2) on conflict (key) do nothing",
        [key, JSON.stringify(await seed())]);
    })().catch((e) => { ready = null; throw e; });
    return ready;
  }

  async function read() {
    await init();
    const { rows } = await pool.query("select data from app_state where key = $1", [key]);
    return rows[0].data;
  }

  /** Run fn on a copy of the state and save it. If fn throws, nothing is saved. */
  async function transact(fn) {
    await init();
    const c = await pool.connect();
    try {
      await c.query("begin");
      const { rows } = await c.query(
        "select data, version, updated_at from app_state where key = $1 for update", [key]);
      const draft = rows[0].data;
      const out = await fn(draft);
      const { rows: last } = await c.query(
        "select max(saved_at) as t from app_state_history where key = $1", [key]);
      if (!last[0].t || Date.now() - new Date(last[0].t).getTime() > SNAPSHOT_EVERY_MS) {
        await c.query("insert into app_state_history (key, version, data) values ($1, $2, $3)",
          [key, rows[0].version, JSON.stringify(rows[0].data)]);
      }
      await c.query("update app_state set data = $2, version = version + 1, updated_at = now() where key = $1",
        [key, JSON.stringify(draft)]);
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

module.exports = { createStore };
