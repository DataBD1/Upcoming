// Runs rival A's API against a real Postgres through lib/pgstore.js, the way api/index.js does on Vercel.
// Needs devDependency embedded-postgres (downloads a throwaway Postgres from npm). Run: node test-pg.js
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const EmbeddedPostgres = require("embedded-postgres").default;
const { Client } = require("pg");
(async () => {
  const pg = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), "ra-")), user: "t", password: "t", port: 54331, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = "postgres://t:t@localhost:54331/postgres";
  process.env.POSTGRES_URL = url; process.env.ADMIN_PHONES = "01711000000";
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
    const c = new Client({ connectionString: url }); await c.connect();
    await c.query("insert into app_state_history (key, version, data) select key, version, data from app_state where key='rival-a'");
    const before = (await c.query("select data from app_state where key='rival-a'")).rows[0].data;
    await c.query("update app_state set data = '{}'::jsonb where key='rival-a'");
    [st] = await call(3200, "home", {}, tokens[3], "GET"); assert.notEqual(st, 200, "damaged state should break");
    await c.query(`update app_state s set data = h.data, version = s.version + 1 from
      (select data from app_state_history where key='rival-a' order by id desc limit 1) h where s.key='rival-a'`);
    [st, r] = await call(3200, "me", {}, tokens[3], "GET"); assert.equal(r.me.pts, 1000, "restored");
    assert.deepEqual((await c.query("select data from app_state where key='rival-a'")).rows[0].data, before);
    const size = (await c.query("select pg_column_size(data) b, length(data::text) t from app_state where key='rival-a'")).rows[0];
    console.log("state size after 21 users / 100 trades:", size);
    await c.end(); servers.forEach((s) => s.close());
    console.log("rival A on Postgres: all checks passed (2 instances, 100 concurrent buys, sessions, rate limit, N/A, restore)");
  } finally { await pg.stop(); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
