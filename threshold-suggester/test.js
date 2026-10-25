'use strict';
const assert = require('assert'), cp = require('child_process'), path = require('path');
const { suggestThreshold: s, parseValue } = require('./index.js');
const legacy = require('./legacy-estimator.js').suggestThreshold;
const APP = /^\d+(\.\d+)?$/;
const bad = (fn, re, msg) => assert.throws(fn, re, msg);
const ten = [122.1, 122.4, 122.5, 122.8, 123.0, 122.6, 122.9, 123.1, 123.0, 123.2];

// ---- input handling ------------------------------------------------------------------------------
bad(() => s(ten.slice(0, 9), 'above'), /at least 10/);
for (const d of ['abov', 'ABOVE', 'up', '', undefined, null, 'at least', 'atmost', 'below ']) bad(() => s(ten, d), /direction/, 'dir ' + d);
for (const v of ['', ' ', null, undefined, '0x10', '1e3', '1e-7', 'Infinity', NaN, Infinity, '-Infinity', true, [], '1,2', '--1', '12.', '.5', '١٢', '1'.repeat(13), '1.00001'])
  bad(() => s([...ten.slice(1), v], 'above'), /./, 'value ' + String(v));
bad(() => s('1 2 3', 'above'), /list/);
bad(() => s(ten, 'above', { minValues: 1 }), /minValues/);
assert.strictEqual(parseValue(' 5 ').n, 5);
// strings and numbers both work, negative data works as data (output must still be non-negative)
assert.strictEqual(s(ten.map(String), 'above').threshold, s(ten, 'above').threshold);
bad(() => s([-9, -8, -9, -10, -8, -9, -7, -9, -8, -9], 'above'), /non-negative|format/);

// ---- output is always accepted by the app (core.js: /^\d+(\.\d+)?$/, 12 chars) ------------------------
let seed = 12345; const u = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
let made = 0;
for (let i = 0; i < 3000; i++) {
  const d = Math.floor(u() * 5), top = u() < .2 ? 1e-3 : 10 ** Math.floor(u() * 6), n = 10 + Math.floor(u() * 40);
  const vals = Array.from({ length: n }, () => (u() * top).toFixed(Math.min(d, 4)));
  for (const dir of ['above', 'below', 'atleast']) {
    let r; try { r = s(vals, dir); } catch (e) { continue; }
    made++;
    assert(APP.test(r.threshold) && r.threshold.length <= 12 && !/e/i.test(r.threshold), r.threshold);
    assert(r.p >= 0 && r.p <= 1 && r.tie >= 0 && r.tie <= 1);
  }
}
assert(made > 5000, 'fuzz produced outputs: ' + made);

// ---- grid, ties, operators -----------------------------------------------------------------------
{ // whole-degree readings: threshold is a whole number and the reported P includes the tie mass for the operator
  const t = [10, 12, 11, 13, 12, 14, 13, 12, 11, 12, 13];
  for (const dir of ['above', 'below', 'atleast']) {
    const r = s(t, dir); assert(/^\d+$/.test(r.threshold), r.threshold);
    const T = +r.threshold, pred = t.slice(1).map((v, i) => 13 + v - t[i]);
    const p = pred.filter(v => dir === 'above' ? v > T : dir === 'below' ? v < T : v >= T).length / pred.length;
    assert(Math.abs(p - r.p) < 1e-12);
    assert(Math.abs(r.tie - pred.filter(v => v === T).length / pred.length) < 1e-12);
  }
}
{ // two-decimal rates keep two decimals, 4dp keep four
  assert(/^\d+\.\d\d$/.test(s(ten.map(v => v.toFixed(2)), 'above').threshold));
  assert(/^\d\.\d{4}$/.test(s([1.3012, 1.3044, 1.3001, 1.2988, 1.3020, 1.3033, 1.3051, 1.3040, 1.3009, 1.3022], 'above').threshold));
}
// a flat series still yields a valid answer (no throw), with the tie mass reported
{ const r = s([5, 5, 5, 5, 5, 5, 5, 5, 5, 5], 'atleast'); assert(APP.test(r.threshold) && r.tie > 0); }

// ---- CLI -----------------------------------------------------------------------------------------
const cli = (...a) => cp.spawnSync(process.execPath, [path.join(__dirname, 'index.js'), ...a], { encoding: 'utf8' });
let o = cli('--dir', 'below', '--', '-3', '-1', '0', '2', '1', '4', '0', '1', '2', '3');
assert.strictEqual(o.status, 0, o.stderr); assert(/^Suggested threshold: \d/.test(o.stdout));
o = cli('--dir', 'above', '--values', '1,2,3,4,5,4,3,4,5,6'); assert.strictEqual(o.status, 0, o.stderr);
for (const args of [[], ['above', '1', '2'], ['-3', '-1', '0', '2', '1', '4', '0'], ['--dir', 'up', '--values', '1,2,3,4,5,6,7,8,9,10'],
  ['--dir', 'above', '--values', '1,2,3'], ['--dir', 'above', '--values', '1,2,3,4,5,6,7,8,9,x'], ['--dir', 'above', '--values', '1,2,3,4,5,6,7,8,9,'],
  ['--dir', 'above', '--values', ''], ['--dir', 'above'], ['--dir', 'above', '--values', '1e3,2,3,4,5,6,7,8,9,10']]) {
  o = cli(...args); assert(o.status !== 0 && o.stdout === '' && /^error: [^\n]+\n$/.test(o.stderr), JSON.stringify(args) + ' -> ' + o.status + ' ' + o.stdout + o.stderr);
}

// ---- backtest ------------------------------------------------------------------------------------
// Simulated daily series (fixed seeds). For each history we ask: what is the TRUE probability (resampling the
// next day 300 times from the generating process) that the question resolves YES at the suggested threshold?
// A better rule has that probability closer to 50%. Compared with "yesterday's value" and the old estimator.
function backtest(name, M, W, N, K) {
  let s0 = 7; const r = () => (s0 = (s0 * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const rnd = (x, d) => Number(x.toFixed(d));
  let dev = { new: 0, naive: 0, old: 0 }, n = 0;
  for (let i = 0; i < N; i++) {
    const st = M.init(); for (let k = 0; k < 40; k++) M.step(st, gauss);
    const h = []; for (let k = 0; k < W; k++) h.push(rnd(M.step(st, gauss), M.d).toFixed(M.d));
    let T, Tn, To;
    try { T = Number(s(h, 'above').threshold); To = legacy(h, 'above').threshold; } catch (e) { continue; }
    Tn = Number(h[h.length - 1]);
    const c = { new: 0, naive: 0, old: 0 };
    for (let j = 0; j < K; j++) { const cl = JSON.parse(JSON.stringify(st)); const v = rnd(M.step(cl, gauss), M.d); if (v > T) c.new++; if (v > Tn) c.naive++; if (v > To) c.old++; }
    for (const k in c) dev[k] += Math.abs(c[k] / K - 0.5); n++;
  }
  for (const k in dev) dev[k] = dev[k] / n * 100;
  return { name, W, n, ...dev };
}
const models = {
  'random walk with drift (+0.15/d, sd 0.08, 2dp)': { d: 2, init: () => ({ x: 122.5 }), step: (st, g) => (st.x += 0.15 + 0.08 * g(), st.x) },
  'taka crawl (+0.03/d, sd 0.08, 2dp)': { d: 2, init: () => ({ x: 122.5 }), step: (st, g) => (st.x += 0.03 + 0.08 * g(), st.x) },
  'GBP/USD random walk (sd 0.5%, 4dp)': { d: 4, init: () => ({ x: 1.30 }), step: (st, g) => (st.x *= 1 + 0.005 * g(), st.x) },
  'seasonal temperature, autumn to winter (-0.18C/d, 0dp)': { d: 0, init: () => ({ day: 0, e: 0 }), step: (st, g) => (st.day++, st.e = 0.6 * st.e + 2.4 * g(), 15 - 0.18 * st.day + st.e) },
  'seasonal temperature, spring (+0.15C/d, 1dp)': { d: 1, init: () => ({ day: 0, e: 0 }), step: (st, g) => (st.day++, st.e = 0.6 * st.e + 2.4 * g(), 8 + 0.15 * st.day + st.e) },
};
const rows = [];
for (const W of [10, 30]) for (const k in models) {
  const b = backtest(k, models[k], W, 400, 300); rows.push(b);
  console.log(`W=${W} ${k}: mean |true P(YES)-50%| new ${b.new.toFixed(1)}pp, yesterday ${b.naive.toFixed(1)}pp, old estimator ${b.old.toFixed(1)}pp (n=${b.n})`);
  // Drifting series: clearly closer to a coin flip than "yesterday". Driftless or noise-dominated series (GBP,
  // temperatures): no rule can do better than about yesterday's value, so only require "within 1pp of it".
  if (/drift|taka/.test(k)) assert(b.new < b.naive, 'new beats yesterday: ' + JSON.stringify(b));
  else assert(b.new < b.naive + 1, 'new within 1pp of yesterday: ' + JSON.stringify(b));
  assert(b.new < b.old, 'new beats old estimator: ' + JSON.stringify(b));
}
console.log('threshold tests passed');
