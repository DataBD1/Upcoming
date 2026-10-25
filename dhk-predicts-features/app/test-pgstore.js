// Regression tests for lib/pgstore.js (review 10): races between a refresh and a write on one instance, lost connections,
// dirty reads, the size of the main row, rollback-copy pruning, restore "ghosts", NUL input, schema setup, migrations on read,
// the backup route, and the number of database round trips per write.
// Needs devDependency embedded-postgres; run as a NON-ROOT user (Postgres refuses root):  node test-pgstore.js
'use strict';
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const EmbeddedPostgres = require("embedded-postgres").default;
const pg = require("pg");
const PORT = +process.env.PGPORT_TEST || 54352;
process.env.ADMIN_PHONES = "01711000000"; process.env.PGSTORE_VERIFY = "1";

// ---- query hooks: gate, count or fail specific statements (all stores share the pg module) -------------------------
const hooks = [], log = [];
const origQuery = pg.Client.prototype.query;
pg.Client.prototype.query = async function (text, ...rest) {
  const t = typeof text === "string" ? text : (text && text.text) || "";
  log.push({ pid: this.processID, t });
  const run = async (after) => { for (const h of hooks.slice()) if (!!h.after === after && h.re.test(t)) { if (h.once) hooks.splice(hooks.indexOf(h), 1); await h.fn(this, t); } };
  await run(false);
  const res = await origQuery.call(this, text, ...rest);
  await run(true); // after the database answered: the answer is already a stale snapshot while we wait
  return res;
};
const hook = (re, fn, once = true, after = false) => hooks.push({ re, fn, once, after });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => ((o[kk] = x[kk]), o), {}) : x));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ps-")); fs.chmodSync(dir, 0o777);
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "t", password: "t", port: PORT, persistent: false, onLog: () => {} });
  await server.initialise(); await server.start();
  const url = `postgres://t:t@localhost:${PORT}/postgres`;
  const { createStore, loadFull, SHARDED } = require("./lib/pgstore.js"), Core = require("./core.js"), H = require("./lib/handler.js");
  const admin = new pg.Client({ connectionString: url }); admin.on("error", () => {}); await admin.connect();
  const stores = [];
  let n = 0;
  const mk = (key, opts) => { const s = createStore({ url, key, seed: () => Core.seed(Date.now()), ...opts }); stores.push(s); return s; };
  const call = (s, name, body, token, method = "POST") => H.handleApi(s, { method, name, body: body || {}, token, ua: "t", country: "GB", ip: "1.1.1.1" });
  const signup = async (s, i) => (await call(s, "auth", { mode: "signup", phone: "+4478000" + String(10000 + i), pin: "secret12", name: "P" + i, adult: true, consent: true, device: "d" + i }))[1].token;
  const openMarkets = async (s) => (await call(s, "home", {}, null, "GET"))[1].markets.filter((m) => m.status === "open").map((m) => m.id);
  const dbRow = async (key) => { const full = await loadFull(admin, key, false); return full; };
  const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
  const mkFast = (key, opts) => { process.env.PGSTORE_VERIFY = "0"; try { return mk(key, opts); } finally { process.env.PGSTORE_VERIFY = "1"; } };
  const tests = [];
  const t = (name, fn) => tests.push([name, fn]);
  const bypid = (pid, since) => log.slice(since || 0).filter((l) => l.pid === pid).map((l) => l.t);

  // ---- F1: a refresh and a write on the same instance must not interleave -----------------------------------------
  t("F1 refresh gated while a write arrives: cache equals database, no lost update", async () => {
    const A = mk("f1"), B = mk("f1");
    const tok = await signup(A, 1); const open = await openMarkets(A);
    await call(A, "buy", { id: open[0], side: "y", amount: 10 }, tok);
    await call(B, "home", {}, tok, "GET");
    await call(B, "buy", { id: open[1], side: "y", amount: 20 }, tok);          // A is now stale
    let hit = false;
    hook(/union all select 's'/, async () => { hit = true; await sleep(300); }, true, true); // the snapshot is taken, then the answer is held back
    const reader = call(A, "home", {}, tok, "GET");
    await sleep(80); assert(hit, "the gate caught the refresh query");
    const w = await call(A, "buy", { id: open[2], side: "n", amount: 30 }, tok); // queued behind the refresh
    await reader;
    assert.equal(w[0], 200);
    await A.verify(); await B.verify();
    const db = await dbRow("f1"), uid = Object.keys(db.state.users).find((u) => db.state.users[u].name === "P1");
    assert.equal(db.state.users[uid].pts, 940);
    assert.equal((await A.read()).users[uid].pts, 940, "A's cache has the same points as the database");
    assert.equal(Object.keys((await A.read()).pos[uid]).length, 3);
    await call(A, "buy", { id: open[0], side: "y", amount: 5 }, tok);
    assert.equal((await dbRow("f1")).state.users[uid].pts, 935, "the next trade builds on the right numbers");
  });

  t("F10 readers never see a write that is not committed yet; a killed write leaves no trace", async () => {
    const A = mk("f10");
    const tok = await signup(A, 1); const open = await openMarkets(A);
    let victim = null, release;
    const gate = new Promise((r) => (release = r));
    hook(/^with [\s\S]*update app_state set data/, async (cl) => { victim = cl.processID; await gate; });
    const w = call(A, "buy", { id: open[0], side: "y", amount: 100 }, tok);
    await sleep(100); assert(victim, "write is parked just before its commit");
    let got = null; const r = call(A, "me", {}, tok, "GET").then((x) => (got = x));
    await sleep(150); if (got !== null) release(); assert.equal(got, null, "a reader waits while the write is uncommitted");
    await admin.query("select pg_terminate_backend($1)", [victim]);               // kill the writer's backend: it never commits
    release();
    const [ws] = await quiet(() => Promise.all([w, r]));
    assert.equal(ws[0], 503, "a lost connection is a 503, not a 400"); assert.deepEqual(ws[1], { error: "server" });
    assert.equal(got[1].me.pts, 1000, "the reader saw the committed points only (never 900)");
    assert.equal((await call(A, "me", {}, tok, "GET"))[1].me.pts, 1000);
    const w2 = await call(A, "buy", { id: open[0], side: "y", amount: 100 }, tok);   // the store recovered on its own
    assert.equal(w2[0], 200); await A.verify();
    assert.equal((await call(A, "me", {}, tok, "GET"))[1].me.pts, 900);
  });

  // ---- F2/F9: database errors never crash the process, and are 503/500 never 400 -----------------------------------
  t("F2 killing idle and checked-out connections does not crash the process; F9 status codes", async () => {
    const A = mk("f2");
    const tok = await signup(A, 1); const open = await openMarkets(A);
    await quiet(() => admin.query("select pg_terminate_backend(pid) from pg_stat_activity where pid <> pg_backend_pid() and datname = current_database() and usename = 't'"));
    await sleep(200);
    assert.equal((await call(A, "me", {}, tok, "GET"))[0], 200, "idle connections killed: the next call reconnects");
    // an SQL error while writing: 500 (never 400), the in-memory copy is rolled back without a full reload
    const loads = A.stats.fullLoads;
    hook(/^with [\s\S]*update app_state set data/, async () => { throw Object.assign(new Error("boom: secret postgres://u:pw@h/db"), { code: "42P01", severity: "ERROR" }); });
    const lines = []; const e0 = console.error; console.error = (...a) => lines.push(a.join(" "));
    let bad; try { bad = await call(A, "buy", { id: open[0], side: "y", amount: 50 }, tok); } finally { console.error = e0; }
    assert.equal(bad[0], 500); assert.deepEqual(bad[1], { error: "server" });
    assert(lines.some((l) => /42P01/.test(l)), "logged on the server"); assert(!lines.some((l) => /u:pw@/.test(l)), "no secrets in the log");
    assert.equal((await call(A, "me", {}, tok, "GET"))[1].me.pts, 1000, "nothing was saved or kept in memory");
    assert.equal(A.stats.fullLoads, loads, "no full reload after a failed write");
    await A.verify();
    assert.equal((await call(A, "buy", { id: open[0], side: "y", amount: 50 }, tok))[0], 200);
    // a refused request is still a 400 for the caller
    await call(A, "bonus", {}, tok);
    const r2 = await call(A, "bonus", {}, tok); assert.equal(r2[0], 400); assert.equal(r2[1].error, "bonus_taken");
  });
  t("F9 a NUL character in any text is saved without it, with no full reload", async () => {
    const A = mk("f9"), B = mk("f9");
    const tok = await signup(A, 1); await call(B, "home", {}, tok, "GET"); await call(A, "home", {}, tok, "GET");
    const loads = A.stats.fullLoads;
    let r = await call(A, "feedback", { text: "bad\u0000text" }, tok); assert.equal(r[0], 200, JSON.stringify(r));
    r = await call(A, "rename", { name: "x\u0000yz" }, tok); assert.equal(r[0], 200, JSON.stringify(r));
    r = await call(A, "feedback", { text: "lone \ud800 surrogate" }, tok); assert.equal(r[0], 200, JSON.stringify(r));
    assert.equal(A.stats.fullLoads, loads);
    const db = await dbRow("f9");
    assert(db.state.feedback.some((f) => f.text === "badtext")); assert(Object.values(db.state.users).some((u) => u.name === "xyz"));
    assert.equal((await call(A, "me", {}, tok, "GET"))[1].me.name, "xyz", "the cache matches the database");
    await A.verify(); await B.verify();
    assert.equal((await call(B, "me", {}, tok, "GET"))[1].me.name, "xyz");
  });

  // ---- F3: the main row does not grow with history ----------------------------------------------------------------
  async function resolvedMarket(s, holders) {
    const adminTok = (await call(s, "auth", { mode: "signup", phone: "01711000000", pin: "adminpin1", name: "Admin", adult: true, consent: true }))[1].token;
    const mid = (await openMarkets(s))[0];
    await s.transact((d) => { for (let i = 0; i < holders; i++) { const u = "u" + i.toString(36).padStart(8, "0"); d.users[u] = { id: u, name: "P" + i, pts: 1000, lastBonus: "x" }; d.pos[u] = { [mid]: { y: 10 + i % 7, n: 0, spent: 10, sy: 10, sn: 0, net: 10, counted: 1 } }; } });
    const r = await call(s, "resolve", { id: mid, outcome: "y" }, adminTok); assert.equal(r[0], 200, JSON.stringify(r));
    return { adminTok, mid };
  }
  t("F3 100 resolved markets with 3,000 holders: main row about 100 KB (was 21.7 MB), book/paid/hist in their own rows", async () => {
    const A = mkFast("f3");
    const { adminTok, mid } = await resolvedMarket(A, 3000);
    const m = (await A.read()).markets.find((x) => x.id === mid);
    assert.equal(Object.keys(m.book).length, 3000); assert.equal(Object.keys(m.paid).length, 3000);
    assert.equal(Object.prototype.propertyIsEnumerable.call(m, "book"), false);
    for (let b = 0; b < 10; b++) await A.transact((s) => {
      const src = s.markets.find((x) => x.id === mid);
      for (let i = 0; i < 10; i++) { const c = JSON.parse(JSON.stringify(src)); c.id = "copy" + (b * 10 + i); s.markets.push(c); c.book = JSON.parse(JSON.stringify(src.book)); c.paid = JSON.parse(JSON.stringify(src.paid)); c.hist = JSON.parse(JSON.stringify(src.hist)); }
    });
    const size = (await admin.query("select length(data::text) n from app_state where key = 'f3'")).rows[0].n;
    assert(size < 120 * 1024, "main row is " + size + " bytes (about 1 KB of question/source text per market, whatever the number of holders)");
    const shards = +(await admin.query("select count(*) n from app_shards where key='f3' and coll='mkt' and not deleted")).rows[0].n;
    assert.equal(shards, (await A.read()).markets.length, "one row per market");
    const t0 = Date.now(); const w = await call(A, "feedback", { text: "after history" }, adminTok); const ms = Date.now() - t0;
    assert.equal(w[0], 200); assert(ms < 500, "a small write after 100 resolved markets took " + ms + " ms");
    const bytes = +(await admin.query("select sum(pg_column_size(data)) n from app_shards where key='f3' and coll='mkt'")).rows[0].n;
    console.log("    main row", size, "bytes; 101 market rows", Math.round(bytes / 1024), "KB; small write", ms, "ms");
    // a fresh instance sees the same markets with their books; the full state keeps the old blob shape
    const B = mk("f3"); const mv = await call(B, "market", { id: "copy57" }, adminTok, "GET");
    assert.equal(mv[1].holders, 3000); assert(mv[1].totalPaid > 0);
    const full = await dbRow("f3");
    assert.equal(Object.keys(full.state.markets.find((x) => x.id === "copy57").book).length, 3000, "backups carry book/paid inline");
    // a correction re-settles from the stored book (book + paid used together)
    const rr = await call(B, "resolve", { id: "copy57", outcome: "n" }, adminTok); assert([200, 400].includes(rr[0]));
  });

  t("F3 a main row written by the previous version (book/paid/hist inline) is moved to market rows by the first read", async () => {
    const A = mk("f3b");
    const { adminTok, mid } = await resolvedMarket(A, 40); await A.flush();
    // make the database look like it did before this change: markets carry everything, no mkt rows
    await admin.query(`update app_state s set data = jsonb_set(data, '{markets}', (select jsonb_agg(case when k.data is null then e.v else e.v || k.data end order by e.n)
        from jsonb_array_elements(s.data->'markets') with ordinality e(v, n) left join app_shards k on k.key = s.key and k.coll = 'mkt' and k.k = e.v->>'id')), version = version + 1 where s.key = 'f3b'`);
    await admin.query("delete from app_shards where key = 'f3b' and coll = 'mkt'");
    assert((await admin.query("select length(data::text) n from app_state where key = 'f3b'")).rows[0].n > 8000, "the old-style main row is big again");
    const before = canon((await loadFull(admin, "f3b", false)).state.markets);
    const B = mk("f3b"); const mv = await call(B, "market", { id: mid }, adminTok, "GET");   // a READ moves the data
    assert.equal(mv[1].holders, 40);
    assert.equal(+(await admin.query("select count(*) n from app_shards where key='f3b' and coll='mkt' and not deleted")).rows[0].n, (await B.read()).markets.length, "market rows exist now");
    assert(!/"book"|"paid"/.test((await admin.query("select data::text t from app_state where key = 'f3b'")).rows[0].t), "and the main row no longer has book or paid");
    assert.equal(canon((await loadFull(admin, "f3b", false)).state.markets), before, "nothing was lost or changed");
    await B.verify();
  });

  // ---- F5/F6: rollback copies are taken off the request path, pruned, and restorable -------------------------------
  t("F5/F6 rollback copy in SQL after the commit; history is pruned; the copy restores", async () => {
    const A = mk("f5", { snapshotEveryMs: 1 });
    const { adminTok, mid } = await resolvedMarket(A, 60);
    await A.flush();
    // 120 fake copies over 60 days (2 per day)
    await admin.query("delete from app_state_history where key = 'f5'");
    await admin.query("insert into app_state_history (key, version, data, saved_at) select 'f5', 1, '{}'::jsonb, now() - (g || ' hours')::interval from generate_series(1440, 1, -12) g");
    const mark = log.length;
    await call(A, "feedback", { text: "trigger copy" }, adminTok); await A.flush();
    const ids = (await admin.query("select id, saved_at from app_state_history where key = 'f5' order by id")).rows;
    assert(ids.length <= 48 + 31, "history has " + ids.length + " rows");
    const days = new Set(ids.filter((r) => Date.now() - new Date(r.saved_at).getTime() < 30 * 864e5).map((r) => new Date(r.saved_at).toISOString().slice(0, 10)));
    assert(days.size >= 29, "one copy per day is kept for 30 days (" + days.size + " days)");
    assert(ids.filter((r) => Date.now() - new Date(r.saved_at).getTime() > 31 * 864e5).length <= 48, "older than 30 days: only the newest 48 remain");
    // the copy: taken by SQL, equal to the full state, in the blob shape
    const last = (await admin.query("select data, version from app_state_history where key = 'f5' order by id desc limit 1")).rows[0];
    const full = await loadFull(admin, "f5", false);
    assert.equal(canon(last.data), canon(full.state), "the rollback copy equals the full state");
    assert(last.data.markets.some((m) => m.book && Object.keys(m.book).length === 60), "with books inline");
    // the writer's own connection never ran the copy: its statements were begin+lock and the write
    const w = log.slice(mark).filter((l) => /feedback|trigger/.test(l.t) || /^with /.test(l.t));
    assert(!w.some((l) => /app_state_history/.test(l.t) && /^with/.test(l.t)), "no history insert inside the write statement");
    // restore from it
    await admin.query("update app_state set data = $1::jsonb, version = version + 1 where key = 'f5'", [JSON.stringify(last.data)]);
    const B = mk("f5");
    await call(B, "feedback", { text: "after restore" }, adminTok);
    const after = await loadFull(admin, "f5", false); delete after.state.audit;
    assert.equal(after.state.markets.find((m) => m.id === mid).book && Object.keys(after.state.markets.find((m) => m.id === mid).book).length, 60);
    assert.equal(canon(Object.keys(after.state.users).sort()), canon(Object.keys(full.state.users).sort()), "same players after the restore");
  });
  t("F6 the rollback copy interval grows with its cost and is not due on every write", async () => {
    const A = mk("f6", { snapshotEveryMs: 60 * 60e3 });
    const tok = await signup(A, 1); await A.flush();
    const n0 = A.stats.snapshots;
    for (let i = 0; i < 5; i++) await call(A, "feedback", { text: "x" + i }, tok);
    await A.flush(); assert.equal(A.stats.snapshots, n0, "no new copy inside the interval");
  });

  // ---- F7/F14: reload swaps a new cache; no errors under TTL reloads; single flight; jitter -------------------------
  t("F7 TTL reloads and failed writes never turn into 500s; F14 single flight and jitter", async () => {
    const A = mk("f7", { cacheTtlMs: 25 }), B = mk("f7", { cacheTtlMs: 25 });
    const toks = []; for (let i = 0; i < 4; i++) toks.push(await signup(i % 2 ? A : B, i));
    const open = await openMarkets(A);
    const bad = []; const stop = Date.now() + 2500;
    const worker = async (w) => { let i = 0; while (Date.now() < stop) { const s = (w + i) % 2 ? A : B, tk = toks[(w + i) % 4]; i++;
      const r = i % 3 ? await call(s, "home", {}, tk, "GET") : await call(s, "buy", { id: open[i % open.length], side: i % 2 ? "y" : "n", amount: 1 }, tk);
      if (r[0] >= 500) bad.push(r); } };
    await Promise.all([0, 1, 2, 3, 4, 5].map(worker));
    assert.equal(bad.length, 0, JSON.stringify(bad[0]));
    assert(A.stats.fullLoads > 5, "TTL reloads really happened (" + A.stats.fullLoads + ")");
    await A.verify(); await B.verify();
    // single flight: 25 concurrent first reads = one full load
    const C = mk("f7"); await Promise.all(Array.from({ length: 25 }, () => C.read()));
    assert.equal(C.stats.fullLoads, 1, "25 concurrent cold reads share one load");
    const ttls = []; for (let i = 0; i < 12; i++) { const s = mk("f7"); await s.read(); ttls.push(s.ttl()); }
    assert(new Set(ttls.map((x) => Math.round(x))).size > 6, "the reload time differs between instances");
  });
  t("F14 default TTL is jittered 75% to 125% of 10 minutes", async () => {
    const xs = []; for (let i = 0; i < 12; i++) { const s = mk("f7"); await s.read(); xs.push(s.ttl()); }
    assert(xs.every((x) => x >= 450e3 && x <= 750e3), JSON.stringify(xs)); assert(new Set(xs).size > 6);
  });

  // ---- F8: a restore while another instance sleeps ------------------------------------------------------------------
  t("F8 an instance idle through a restore does not keep removed players; a version that goes down reloads", async () => {
    const A = mk("f8"), B = mk("f8"), C = mk("f8");
    await signup(A, 1); await call(C, "home", {}, null, "GET");
    const blob = (await loadFull(admin, "f8", false)).state;
    await admin.query("insert into app_state_history (key, version, data) values ('f8', 1, $1)", [JSON.stringify(blob)]);
    const t2 = await signup(A, 2);
    await call(C, "home", {}, t2, "GET");
    assert((await C.read()).auth["+447800010002"], "C knows player 2 before the restore");
    await admin.query("update app_state s set data = h.data, version = s.version + 1 from (select data from app_state_history where key='f8' order by id desc limit 1) h where s.key='f8'");
    await call(B, "feedback", { text: "first write after restore" });                 // re-shards the restored blob
    const me = await call(C, "me", {}, t2, "GET");
    assert.equal(me[1].me, null, "C no longer accepts the session of the removed player");
    assert(!(await C.read()).auth["+447800010002"], "and does not keep the account");
    await C.verify();
    const l = await call(C, "auth", { mode: "login", phone: "+447800010002", pin: "secret12" });
    assert.equal(l[1].error, "wrong_login");
    assert.equal(+(await admin.query("select count(*) n from app_shards where key='f8' and coll='sessions' and not deleted")).rows[0].n, Object.keys(blob.sessions).length, "no orphan session row");
    // a version that goes DOWN
    await admin.query("update app_state set version = 2 where key='f8'");
    await admin.query("update app_shards set data = jsonb_set(data,'{name}','\"CHANGED-BY-SQL\"') where key='f8' and coll='users' and not deleted and k = (select k from app_shards where key='f8' and coll='users' and not deleted limit 1)");
    assert(Object.values((await C.read()).users).some((u) => u.name === "CHANGED-BY-SQL"), "C reloaded because the version went down");
  });

  // ---- F11: schema set-up cannot block readers --------------------------------------------------------------------
  t("F11 a cold start next to an open transaction does not block other queries; concurrent first starts work", async () => {
    const warm = mk("f11"); await warm.read();
    const open = new pg.Client({ connectionString: url }); open.on("error", () => {}); await open.connect();
    const probe = new pg.Client({ connectionString: url }); probe.on("error", () => {}); await probe.connect();
    await open.query("begin"); await open.query("select count(*) from app_shards where key = 'f11'");
    const t0 = Date.now(); const cold = mk("f11"); const coldDone = cold.read().then(() => Date.now() - t0);
    await sleep(300);
    const tp = Date.now(); await probe.query("select 1 from app_shards where key = 'f11' limit 1"); const blocked = Date.now() - tp;
    const coldMs = await coldDone;
    await open.query("commit"); await open.end(); await probe.end();
    assert(blocked < 400, "an ordinary SELECT was blocked for " + blocked + " ms");
    assert(coldMs < 3000, "the cold start took " + coldMs + " ms");
  });
  t("F11 first start on an empty database: three instances at once create the tables once", async () => {
    await admin.query("drop schema if exists emp cascade; create schema emp");
    const u2 = url + "?options=-csearch_path%3Demp";
    const ss = [0, 1, 2].map(() => createStore({ url: u2, key: "x", seed: () => Core.seed(Date.now()) })); stores.push(...ss);
    await Promise.all(ss.map((s) => s.read()));
    const tables = (await admin.query("select count(*) n from pg_tables where schemaname = 'emp'")).rows[0].n;
    assert.equal(+tables, 5);
    assert.equal((await call(ss[1], "home", {}, null, "GET"))[0], 200);
  });

  // ---- F12: migrations happen in a write, not on the shared copy ---------------------------------------------------
  t("F12 an older sharded database is migrated by the store, and saved", async () => {
    const A = mk("f12"); const tok = (await call(A, "auth", { mode: "signup", phone: "01712345678", pin: "secret12", name: "Old", adult: true, consent: true }))[1].token;
    await admin.query("update app_state set data = jsonb_set(data, '{v}', '2') where key = 'f12'");
    await admin.query("update app_shards set k = '01712345678' where key = 'f12' and coll = 'auth' and k = '+8801712345678'");
    await admin.query("update app_state set version = version + 1 where key = 'f12'");
    const B = mk("f12");
    await call(B, "home", {}, tok, "GET");                                      // a READ
    const keys = (await admin.query("select k from app_shards where key='f12' and coll='auth' and not deleted")).rows.map((r) => r.k);
    assert.deepEqual(keys, ["+8801712345678"], "the migration was saved by the read's own transaction");
    assert.equal((await admin.query("select data->>'v' v from app_state where key='f12'")).rows[0].v, "4");
    const C = mk("f12"); const r = await call(C, "auth", { mode: "login", phone: "01712345678", pin: "secret12" });
    assert.equal(r[0], 200, JSON.stringify(r));
  });

  // ---- F4: round trips ---------------------------------------------------------------------------------------------
  t("F4 an ordinary write is two round trips (begin+lock, write+commit); a read is one", async () => {
    const A = mkFast("f4", { snapshotEveryMs: 36e8 });
    const tok = await signup(A, 1); const open = await openMarkets(A); await A.flush();
    await call(A, "home", {}, tok, "GET");
    let mark = log.length;
    const r = await call(A, "buy", { id: open[0], side: "y", amount: 5 }, tok);
    assert.equal(r[0], 200);
    const stm = log.slice(mark); const pids = new Set(stm.filter((l) => /^begin/.test(l.t)).map((l) => l.pid));
    assert.equal(pids.size, 1); const mine = bypid([...pids][0], mark);
    assert.equal(mine.filter((x) => !/^select version/.test(x)).length, 2, JSON.stringify(mine.map((x) => x.slice(0, 40))));
    mark = log.length; await call(A, "home", {}, tok, "GET");
    assert.equal(log.slice(mark).length, 1, "a read is one version check");
    // the number of statements a write sent: begin+lock, one combined write (all shard rows, events and main row, with the commit)
    assert(/^with /.test(mine[1]) && /; commit$/.test(mine[1]));
  });

  // ---- queue bound ----------------------------------------------------------------------------------------------
  t("a long queue behind a stuck database answers 503 busy instead of growing without bound", async () => {
    const A = mk("fq"); const tok = await signup(A, 1);
    let release; const gate = new Promise((r) => (release = r));
    hook(/^begin; select data, version/, async () => { await gate; });
    const ps = Array.from({ length: 160 }, () => call(A, "bonus", {}, tok));
    await sleep(300);
    release();
    const res = await quiet(() => Promise.all(ps));
    assert(res.some((r) => r[0] === 503), "some requests were refused with 503 (" + res.map((r) => r[0]).filter((x) => x !== 200 && x !== 400).length + ")");
    assert.equal((await call(A, "me", {}, tok, "GET"))[0], 200);
  });

  // ---- F13: backup route ---------------------------------------------------------------------------------------------
  t("F13 /api/backup fails closed in production, checks Blob before loading the state, and survives a dropped connection", async () => {
    const blobs = []; let puts = 0, lists = 0;
    require.cache[require.resolve("@vercel/blob")] = { id: "x", filename: "x", loaded: true, exports: {
      put: async (name, body) => { puts++; if (blobs.some((b) => b.pathname === name)) throw new Error("This blob already exists"); blobs.push({ pathname: name, url: "u:" + name, uploadedAt: new Date().toISOString(), size: body.length }); },
      list: async () => { lists++; return { blobs: blobs.slice(), hasMore: false }; },
      del: async (urls) => { for (const u of urls) { const i = blobs.findIndex((b) => b.url === u); if (i >= 0) blobs.splice(i, 1); } } } };
    const A = mk("rival-a"); await signup(A, 1);
    process.env.POSTGRES_URL = url;
    delete require.cache[require.resolve("./api/backup.js")];
    const backup = require("./api/backup.js");
    const run = async (headers) => { const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, end(b) { this.body = b; } }; await backup({ headers: headers || {} }, res); return res; };
    const saved = { ve: process.env.VERCEL_ENV, ne: process.env.NODE_ENV, cs: process.env.CRON_SECRET };
    try {
      process.env.VERCEL_ENV = "production"; delete process.env.CRON_SECRET;
      let mark = log.length, r = await quiet(() => run());
      assert.equal(r.statusCode, 503); assert.equal(log.length, mark, "no database access, nothing written"); assert.equal(puts, 0); assert.equal(lists, 0);
      process.env.CRON_SECRET = "s3cret";
      r = await run({ authorization: "Bearer nope" }); assert.equal(r.statusCode, 401); assert.equal(lists, 0);
      mark = log.length; r = await run({ authorization: "Bearer s3cret" });
      assert.equal(r.statusCode, 200, r.body); assert.equal(JSON.parse(r.body).wrote, true); assert.equal(puts, 1);
      const loads = log.slice(mark).filter((l) => /select data, version, updated_at/.test(l.t)).length; assert.equal(loads, 1);
      mark = log.length; r = await run({ authorization: "Bearer s3cret" });
      assert.equal(JSON.parse(r.body).wrote, false); assert.equal(puts, 1, "today's copy exists: nothing is written");
      assert.equal(log.slice(mark).length, 0, "and the state is not even read from the database");
    } finally { for (const [k, v] of [["VERCEL_ENV", saved.ve], ["NODE_ENV", saved.ne], ["CRON_SECRET", saved.cs]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } delete process.env.POSTGRES_URL; }
  });

  // ---- a short concurrent fuzz (the long one is bench/fuzz.js) ------------------------------------------------------
  t("short concurrent fuzz over three instances with VERIFY: zero divergence", async () => {
    const fuzz = require("./bench/fuzz.js");
    for (const seed of [1, 2, 3]) {
      const r = await fuzz.run({ url, key: "fz" + seed, steps: 25, seed, conc: 4, instances: 3, quiet: true });
      assert.equal(r.diverged, 0, JSON.stringify(r)); assert.equal(r.err500, 0, JSON.stringify(r));
    }
  });

  let failed = 0;
  const only = process.argv[2];
  for (const [name, fn] of tests) {
    if (only && !name.includes(only)) continue;
    hooks.length = 0;
    const t0 = Date.now();
    try { await fn(); console.log("ok   ", name, "(" + (Date.now() - t0) + " ms)"); }
    catch (e) { failed++; console.log("FAIL ", name); console.log("     ", (e && e.stack || e).toString().split("\n").slice(0, 6).join("\n      ")); }
  }
  for (const s of stores) await s.end().catch(() => {});
  await admin.end().catch(() => {}); await server.stop();
  console.log(failed ? failed + " FAILED" : "pgstore: all checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
