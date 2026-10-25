// Concurrent bonus claims on two serverless instances over real Postgres: exactly one must pay, streak must be 1.
// Run (non-root): export TMPDIR=/tmp/pgrun; setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp/pgrun TMPDIR=/tmp/pgrun PATH=$PATH node 01-streak-pg-race.js
const APP = "/home/user/upcoming/dhk-predicts-features/app/";
process.chdir(APP);
const fs = require("fs"), path = require("path"), http = require("http");
const EmbeddedPostgres = require("module").createRequire(APP + "x.js")("embedded-postgres").default;
const { Client } = require("module").createRequire(APP + "x.js")("pg");
(async () => {
  const dir = "/tmp/pgrun/01-pg"; fs.mkdirSync(dir, { recursive: true }); fs.chmodSync(dir, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: fs.mkdtempSync(path.join(dir, "d-")), user: "t", password: "t", port: 54401, persistent: false, onLog: () => {} });
  await pg.initialise(); await pg.start();
  const url = "postgres://t:t@localhost:54401/postgres";
  process.env.POSTGRES_URL = url; process.env.ADMIN_PHONES = "01711000000";
  let code = 0;
  try {
    const fn1 = require(APP + "api/index.js");
    for (const k of Object.keys(require.cache)) if (k.includes(APP) && !k.includes("node_modules")) delete require.cache[k];
    const fn2 = require(APP + "api/index.js");
    [fn1, fn2].forEach((fn, i) => http.createServer(fn).listen(8190 + i));
    const call = async (port, name, body, token, method = "POST") => {
      const r = await fetch(`http://localhost:${port}/api/${name}` + (method === "GET" && body ? "?" + new URLSearchParams(body) : ""),
        { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: method === "POST" ? JSON.stringify(body || {}) : undefined });
      return [r.status, await r.json()];
    };
    let [st, r] = await call(8190, "auth", { mode: "signup", phone: "01811111111", pin: "secret12", name: "Racer", adult: true, consent: true });
    const tok = r.token; [st, r] = await call(8190, "me", {}, tok, "GET"); const uid = r.me.id;
    const c = new Client({ connectionString: url }); c.on("error", () => {}); await c.connect();
    // pretend the player signed up yesterday and has a 5-day streak ending yesterday
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    await c.query("update app_shards set data = data || $2::jsonb where coll='users' and k=$1", [uid, JSON.stringify({ lastBonus: y, streak: 5, streakDay: y, bestStreak: 5 })]);
    await c.query("update app_state set version = version + 1");
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => call(8190 + (i % 2), "bonus", {}, tok)));
    const ok = res.filter(([s]) => s === 200).length, taken = res.filter(([s, j]) => j.error === "bonus_taken").length;
    [st, r] = await call(8191, "social", {}, tok, "GET");
    const [, me] = await call(8190, "me", {}, tok, "GET");
    console.log("claims accepted:", ok, "refused bonus_taken:", taken, "streak:", r.streak, "best:", r.best, "pts:", me.me.pts);
    if (ok !== 1 || r.streak !== 6 || me.me.pts !== 1100) { console.log("BUG"); code = 1; } else console.log("HELD");
  } catch (e) { console.log("ERR", e); code = 2; }
  try { await pg.stop(); } catch (e) {}
  process.exit(code);
})();
