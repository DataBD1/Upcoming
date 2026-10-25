// Runs rival A's API against a real Postgres through lib/pgstore.js, the way api/index.js does on Vercel.
// Needs devDependency embedded-postgres (downloads a throwaway Postgres from npm). Run: node test-pg.js
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const EmbeddedPostgres = require("embedded-postgres").default;
const { Client } = require("pg");
(async () => {
  const pg = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), "ra-")), user: "t", password: "t", port: 54331, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = "postgres://t:t@localhost:54331/postgres";
  process.env.PGSTORE_VERIFY = "1"; process.env.POSTGRES_URL = url; process.env.ADMIN_PHONES = "01711000000";
  try {
    // Two "serverless instances": separate module copies, separate pools.
    const fn1 = require("./api/index.js");
    for (const k of Object.keys(require.cache)) if (k.includes(__dirname) && !k.includes("node_modules")) delete require.cache[k];
    const fn2 = require("./api/index.js");
    const servers = [fn1, fn2].map((fn, i) => http.createServer(fn).listen(3200 + i));
    const call = async (port, name, body, token, method = "POST") => {
      const r = await fetch(`http://localhost:${port}/api/${name}` + (method === "GET" && body ? "?" + new URLSearchParams(body) : ""),
        { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: method === "POST" ? JSON.stringify(body || {}) : undefined });
      return [r.status, await r.json()];
    };
    let [st, r] = await call(3200, "auth", { mode: "signup", phone: "01711000000", pin: "dhaka123", name: "Admin", adult: true, consent: true });
    assert.equal(st, 200, JSON.stringify(r)); const admin = r.token;
    const tokens = [];
    for (let i = 0; i < 20; i++) {
      [st, r] = await call(3200 + (i % 2), "auth", { mode: "signup", phone: "0181234" + String(5000 + i), pin: "secret12", name: "P" + i, adult: true, consent: true });
      assert.equal(st, 200, JSON.stringify(r)); tokens.push(r.token);
    }
    // Session made on instance 1 works on instance 2.
    [st, r] = await call(3201, "home", {}, tokens[0], "GET"); assert.equal(r.me.pts, 1000);
    // 20 players x 5 concurrent buys across both instances.
    const res = await Promise.all(tokens.flatMap((t, i) => Array.from({ length: 5 }, (_, j) =>
      call(3200 + ((i + j) % 2), "buy", { id: "bdt-usd-mar", side: j % 2 ? "y" : "n", amount: 20 }, t))));
    assert(res.every(([s]) => s === 200), JSON.stringify(res.find(([s]) => s !== 200)));
    for (const t of tokens) { [st, r] = await call(3201, "me", {}, t, "GET"); assert.equal(r.me.pts, 900); }
    // Failed logins counted across instances.
    for (let i = 0; i < 6; i++) await call(3200 + (i % 2), "auth", { mode: "login", phone: "01812345000", pin: "wrongpw" });
    [st, r] = await call(3201, "auth", { mode: "login", phone: "01812345000", pin: "secret12" }); assert.equal(r.error, "slow_down");
    // N/A refund.
    [st, r] = await call(3201, "resolve", { id: "bdt-usd-mar", outcome: "na" }, admin); assert.equal(st, 200, JSON.stringify(r));
    [st, r] = await call(3200, "me", {}, tokens[3], "GET"); assert.equal(r.me.pts, 1000);
    // Restore drill: take the latest rollback copy and put it back.
    const c = new Client({ connectionString: url }); c.on("error", () => {}); await c.connect();
    const { loadFull } = require("./lib/pgstore.js");
    const beforeFull = await loadFull(c, "rival-a");
    // The store writes rollback copies as full-state blobs; do the same here for the drill.
    await c.query("insert into app_state_history (key, version, data) values ('rival-a', $1, $2)", [beforeFull.version, JSON.stringify(beforeFull.state)]);
    await c.query("update app_state set data = '{}'::jsonb, version = version + 1 where key='rival-a'"); // manual edits must bump version, like the documented restore SQL
    [st] = await call(3200, "home", {}, tokens[3], "GET"); assert.notEqual(st, 200, "damaged state should break");
    await c.query(`update app_state s set data = h.data, version = s.version + 1 from
      (select data from app_state_history where key='rival-a' order by id desc limit 1) h where s.key='rival-a'`);
    [st, r] = await call(3200, "me", {}, tokens[3], "GET"); assert.equal(r.me.pts, 1000, "restored");
    assert.deepEqual((await loadFull(c, "rival-a")).state, beforeFull.state, "restore brings back the full state");
    // The next write re-shards the restored blob.
    [st] = await call(3200, "feedback", { text: "after restore" }, tokens[3]); assert.equal(st, 200);
    const main2 = (await c.query("select data from app_state where key='rival-a'")).rows[0].data;
    assert.equal(main2.__v, 2); assert(!("sessions" in main2) && !("pos" in main2), "restored blob is sharded again");
    assert.equal((await call(3201, "me", {}, tokens[3], "GET"))[1].me.pts, 1000, "sessions survive re-sharding");

    // ---- Sharding: big maps live in app_shards, and a write touches only the rows that changed.
    const size = (await c.query("select pg_column_size(data) b, length(data::text) t from app_state where key='rival-a'")).rows[0];
    const shardN = +(await c.query("select count(*) n from app_shards where key='rival-a' and not deleted")).rows[0].n;
    assert(shardN > 40, "sessions, positions and logs are in app_shards (" + shardN + ")");
    for (const coll of ["sessions", "pos", "log"]) assert(!(coll in main2), coll + " is not in the main row");
    const xmins = async () => Object.fromEntries((await c.query("select coll||'/'||k id, xmin::text x from app_shards where key='rival-a'")).rows.map((r) => [r.id, r.x]));
    const x0 = await xmins();
    [st, r] = await call(3200, "home", {}, null, "GET"); const open = r.markets.find((m) => m.status === "open"); assert(open, "an open market");
    [st, r] = await call(3200, "buy", { id: open.id, side: "y", amount: 20 }, tokens[7]); assert.equal(st, 200, JSON.stringify(r));
    const x1 = await xmins(), changed = Object.keys(x1).filter((k) => x0[k] !== x1[k]);
    assert(changed.length >= 1 && changed.length <= 3, "one buy rewrites only that player's rows, got " + JSON.stringify(changed));
    assert(changed.every((k) => /^(pos|log|users)\//.test(k)), "only that player's rows changed: " + JSON.stringify(changed));
    // Deleting an account removes its session shard (its trades stay anonymous).
    [st, r] = await call(3200, "me", {}, tokens[9], "GET"); const gone = r.me.id;
    const sessBefore = +(await c.query("select count(*) n from app_shards where key='rival-a' and coll='sessions' and not deleted")).rows[0].n;
    [st, r] = await call(3200, "delete", { pin: "secret12" }, tokens[9]); assert.equal(st, 200, JSON.stringify(r));
    const sessAfter = +(await c.query("select count(*) n from app_shards where key='rival-a' and coll='sessions' and not deleted")).rows[0].n;
    assert.equal(sessAfter, sessBefore - 1, "the deleted account's session row is gone");
    assert.equal((await call(3200, "home", {}, tokens[9], "GET"))[1].me, null, "and its token no longer works");
    assert.equal((await call(3201, "home", {}, tokens[9], "GET"))[1].me, null, "on the other server copy too (the delete reaches its cache)");
    console.log("state size after 21 users / 100 trades (main row only):", size, "| shard rows:", shardN);

    // ---- Backup reads main row + shards in one snapshot and gives the old single-blob shape.
    const full = await loadFull(c, "rival-a");
    assert(full.state.sessions && Object.keys(full.state.sessions).length >= 20 && full.state.pos && full.state.users, "full state is whole");
    assert.equal(JSON.stringify(full.state).includes("__v"), false);

    // ---- Migration of a legacy single-blob row (the format every earlier version wrote).
    const { createStore } = require("./lib/pgstore.js");
    const legacy = { v: 4, users: { u1: { name: "L" } }, markets: [], pos: { u1: { m: { y: 1, n: 0, spent: 1 } } }, sessions: { h1: ["u1", 1] }, log: { u1: [{ at: 1 }] }, custom: { keep: true } };
    const ls = createStore({ url, key: "legacy", seed: () => legacy });
    assert.deepEqual(await ls.read(), legacy, "a legacy row reads as is, before any write");
    await ls.transact((s) => { s.pos.u1.m.y = 2; s.resets = { r1: { uid: "u1", exp: 5 } }; });
    const lm = (await c.query("select data from app_state where key='legacy'")).rows[0].data;
    assert.equal(lm.__v, 2); assert(!lm.pos && !lm.sessions && !lm.log && !lm.resets); assert.deepEqual(lm.custom, { keep: true });
    const back = await ls.read();
    assert.equal(back.pos.u1.m.y, 2); assert.deepEqual(back.sessions, legacy.sessions); assert.deepEqual(back.resets, { r1: { uid: "u1", exp: 5 } });
    await assert.rejects(ls.transact((s) => { s.pos.u1.m.y = 99; s.users.u1.name = "X"; s.custom.keep = false; delete s.sessions.h1; throw new Error("boom"); }), /boom/);
    { const again = await ls.read(); assert.equal(again.users.u1.name, "L", "refused change: shard rolled back in memory"); assert.deepEqual(again.custom, { keep: true }, "and the main row too"); assert.deepEqual(again.sessions, legacy.sessions, "and a deleted key is back"); }
    assert.equal((await ls.read()).pos.u1.m.y, 2, "a failed change saves nothing, shards included");
    await ls.transact((s) => { s.weekstart = {}; for (let i = 0; i < 50; i++) s.weekstart["p" + i] = i; });
    assert.equal(Object.keys((await ls.read()).weekstart).length, 50, "replacing a whole map in one request is saved");
    await ls.transact((s) => { s.weekstart = { only: 1 }; });
    assert.deepEqual((await ls.read()).weekstart, { only: 1 }, "and the old keys are gone");
    assert.equal(+(await c.query("select count(*) n from app_shards where key='legacy' and coll='weekstart' and not deleted")).rows[0].n, 1, "in the database too");
    await ls.transact((s) => { delete s.sessions.h1; });
    assert.deepEqual((await ls.read()).sessions, {}, "removed keys are removed");
    await ls.end();
    await c.end(); servers.forEach((s) => s.close());
    console.log("rival A on Postgres: all checks passed (2 instances, 100 concurrent buys, sessions, rate limit, N/A, restore, sharding, backup shape, legacy migration)");
  } finally { await pg.stop(); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
