// Adds network latency to every database round trip, so the benchmarks show what a remote Postgres (Supabase) costs.
//   LAT_MS=10 node bench/soak.js 10000 60 40 3        every query waits 10 ms (+ up to 20% jitter) before it is sent
// Loaded by the benchmarks; it wraps pg's Client.query, so one call = one round trip, whatever the statement.
// A multi-statement message (like the store's "begin; select ... for update") is one round trip, as on a real network.
'use strict';
const ms = +process.env.LAT_MS || 0;
if (ms > 0 && !global.__latencyInstalled) {
  global.__latencyInstalled = true;
  const pg = require('pg'), orig = pg.Client.prototype.query, wait = () => new Promise(r => setTimeout(r, ms * (1 + 0.2 * Math.random())));
  pg.Client.prototype.query = function (...a) {
    const last = a[a.length - 1];
    if (typeof last === 'function') { wait().then(() => orig.apply(this, a)); return undefined; } // pool.query uses the callback form
    return wait().then(() => orig.apply(this, a));
  };
  console.log(`latency injection: every query round trip +${ms} ms (LAT_MS)`);
}
module.exports = ms;
