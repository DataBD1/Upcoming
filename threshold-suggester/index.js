#!/usr/bin/env node
// Suggest a threshold for a daily "will X be above T" question so tomorrow's outcome is close to a coin flip.
//
//   node index.js --dir above --values 122.10,122.40,122.50,122.80,123.00,122.60,122.90,123.10,123.00,123.20
//   node index.js --dir atleast -- 61 63 58 60 62 64 59 57 60 61     (values oldest first, last = latest reading)
//
// Model: tomorrow = latest value + one of the recent day-to-day CHANGES (each equally likely, in both signs around their
// mean; the mean change counts as drift only as far as it stands out from noise), put on the
// reading's grid (whole degrees, 2-decimal rates...). The threshold is the grid value whose exact probability
// under that model, ties included, is closest to 50% for the chosen operator:
//   above   : YES when reading >  T        (Q1, Q2, Q3, Q6)
//   below   : YES when reading <  T
//   atleast : YES when reading >= T        (Q5 "reach")
// It is a rule of thumb, not a forecast. Limits are in the README. The output always matches the app's
// threshold format (digits with an optional decimal part, no sign, no exponent, at most 12 characters).
'use strict';

const MIN_VALUES = 10;   // fewer recent values than this gives too few day-to-day changes to say anything
const WINDOW = 30;       // only the latest values are used
const MAX_DECIMALS = 4;  // Bank of England publishes 4 dp; the app stores 12 characters
const DIRS = ['above', 'below', 'atleast'];
const NUM = /^-?\d+(\.\d+)?$/;

// One token -> { n: number, dec: decimals as written }. Throws on anything that is not a plain decimal.
function parseValue(v) {
  let s;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('value is not a finite number: ' + v); s = String(v); }
  else if (typeof v === 'string') s = v.trim();
  else throw new Error('value is not a number: ' + String(v));
  if (!NUM.test(s)) throw new Error('not a plain decimal number: "' + s + '"');
  if (s.length > 12) throw new Error('too many digits: "' + s + '"');
  const dec = (s.split('.')[1] || '').length;
  if (dec > MAX_DECIMALS) throw new Error('more than ' + MAX_DECIMALS + ' decimals: "' + s + '"');
  return { n: Number(s), dec };
}

// P(YES) for a threshold t (grid units) over predictive grid values.
function prob(pred, t, dir) {
  let k = 0;
  for (const v of pred) if (dir === 'above' ? v > t : dir === 'below' ? v < t : v >= t) k++;
  return k / pred.length;
}

// opts: { minValues (default 10), window (default 30), decimals (override grid, default: most decimals seen) }
// Returns { threshold: '13', p, tie, dir, n, changes, last, decimals } where p is the model's exact P(YES)
// and tie the model's mass exactly on the threshold. Throws Error on bad input.
function suggestThreshold(values, dir, opts) {
  opts = opts || {};
  if (!DIRS.includes(dir)) throw new Error('direction must be exactly one of: ' + DIRS.join(', '));
  if (!Array.isArray(values)) throw new Error('values must be a list');
  const min = opts.minValues === undefined ? MIN_VALUES : opts.minValues;
  if (!Number.isInteger(min) || min < 3) throw new Error('minValues must be an integer of at least 3');
  if (values.length < min) throw new Error('need at least ' + min + ' recent values (10 is a good number), got ' + values.length);
  const parsed = values.map(parseValue);
  const win = opts.window === undefined ? WINDOW : opts.window;
  if (!Number.isInteger(win) || win < min) throw new Error('window must be an integer of at least ' + min);
  const used = parsed.slice(-win);
  let d = opts.decimals === undefined ? Math.max(...used.map(x => x.dec)) : opts.decimals;
  if (!Number.isInteger(d) || d < 0 || d > MAX_DECIMALS) throw new Error('decimals must be an integer from 0 to ' + MAX_DECIMALS);
  const scale = 10 ** d;
  const g = used.map(x => Math.round(x.n * scale));          // everything below is in whole grid units
  const last = g[g.length - 1];
  const changes = []; for (let i = 1; i < g.length; i++) changes.push(g[i] - g[i - 1]);
  // Drift: the mean change, shrunk toward zero by how clearly it stands out from noise (t = mean / std error;
  // shrink factor 1 - 4/t^2, so nothing is trusted below t = 2). The spread comes from the actual changes around
  // their mean, taken in both signs so a few lucky days cannot tilt the middle of the distribution.
  const m = changes.length, mean = changes.reduce((a, b) => a + b, 0) / m;
  const sd = Math.sqrt(changes.reduce((a, b) => a + (b - mean) ** 2, 0) / (m - 1));
  const tstat = sd > 0 ? Math.abs(mean) / (sd / Math.sqrt(m)) : (mean === 0 ? 0 : Infinity);
  const drift = mean * (tstat > 2 ? 1 - 4 / (tstat * tstat) : 0);
  const pred = []; for (const c of changes) { pred.push(Math.round(last + drift + (c - mean))); pred.push(Math.round(last + drift - (c - mean))); }
  // Candidates: every predicted grid value and its neighbours, so a tie-heavy or flat series still gets a threshold.
  const cand = new Set(); for (const p of pred) { cand.add(p - 1); cand.add(p); cand.add(p + 1); }
  const mid = Math.round(last + drift); cand.add(mid - 1); cand.add(mid); cand.add(mid + 1);
  // Pick the candidate whose exact P is closest to 50%. With only a handful of changes the empirical P moves in
  // coarse steps, so anything within one step (1/len) of the best is treated as equally good and the one closest
  // to the middle of the predictive distribution wins (then the lower value), instead of chasing sampling noise.
  const centre = last + drift, step = 1 / pred.length;
  const scored = [...cand].filter(t => t >= 0).map(t => ({ t, p: prob(pred, t, dir) }));   // the app accepts no minus sign
  const bestDev = Math.min(...scored.map(x => Math.abs(x.p - 0.5)));
  let best = null;
  for (const x of scored) {
    if (Math.abs(x.p - 0.5) > bestDev + step + 1e-12) continue;
    if (!best || Math.abs(x.t - centre) < Math.abs(best.t - centre) - 1e-12 || (Math.abs(x.t - centre) === Math.abs(best.t - centre) && x.t < best.t)) best = x;
  }
  if (!best) throw new Error('no non-negative threshold is possible for these values');
  const text = (best.t / scale).toFixed(d);
  if (!/^\d+(\.\d+)?$/.test(text) || text.length > 12) throw new Error('threshold ' + text + ' is not a format the app accepts');
  const tie = pred.filter(v => v === best.t).length / pred.length;
  return { threshold: text, p: best.p, tie, dir, n: used.length, changes: m, last: (last / scale).toFixed(d), decimals: d };
}

module.exports = { suggestThreshold, parseValue, MIN_VALUES, WINDOW, DIRS };

const USAGE = 'usage: node index.js --dir above|below|atleast --values v1,v2,... (oldest first)   or   --dir above -- v1 v2 ...';

function parseArgs(argv) {
  let dir, vals = [], seenValues = false, i = 0;
  const opts = {};
  const split = s => s.split(/[\s,]+/).filter(x => x !== '');
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { vals = vals.concat(argv.slice(i + 1)); seenValues = true; break; }
    else if (a === '--dir') { if (i + 1 >= argv.length) throw new Error('--dir needs a value'); dir = argv[++i]; }
    else if (a === '--values') { if (i + 1 >= argv.length) throw new Error('--values needs a value'); vals = vals.concat(split(argv[++i])); seenValues = true; }
    else if (a === '--min') { opts.minValues = Number(argv[++i]); }
    else if (a === '--decimals') { opts.decimals = Number(argv[++i]); }
    else throw new Error('unknown argument "' + a + '". ' + USAGE);
  }
  if (!seenValues) throw new Error('no values given. ' + USAGE);
  if (dir === undefined) throw new Error('--dir is required. ' + USAGE);
  return { dir, vals: vals.flatMap(v => (typeof v === 'string' && /[\s,]/.test(v.trim()) ? split(v) : [v])), opts };
}

if (require.main === module) {
  try {
    if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); }
    const { dir, vals, opts } = parseArgs(process.argv.slice(2));
    const r = suggestThreshold(vals, dir, opts);
    const word = { above: 'above', below: 'below', atleast: 'at least' }[r.dir];
    console.log('Suggested threshold: ' + r.threshold + ' (YES = reading ' + word + ' it; model P(YES) ' + (r.p * 100).toFixed(0) + '%, of which exactly-equal ' + (r.tie * 100).toFixed(0) + '%; latest ' + r.last + ', ' + r.changes + ' day-to-day changes)');
  } catch (e) { console.error('error: ' + e.message); process.exit(1); }
}
