#!/usr/bin/env node
// Suggest a threshold for a daily "will X be above T" question so it opens between 30% and 70%.
//   node index.js above 122.1 122.4 122.5 122.8 123.0 ...   (recent values, oldest first)
//   node index.js below -3 -1 0 2 1 ...
// The chance is read off the recent values: for "above", the share of days the value was above T.
// Values are rounded to the data's own precision, and a threshold that would fall outside the
// 30% to 70% band is moved to the nearest value that lands inside it.
'use strict';

function decimals(vals) { return Math.min(4, Math.max(...vals.map(v => (String(v).split('.')[1] || '').length))); }

function chance(vals, t, dir) {
  const hit = vals.filter(v => dir === 'below' ? v < t : v > t).length;
  return hit / vals.length;
}

// Returns { threshold, chance, median, band } or throws on bad input.
function suggestThreshold(values, dir, opts) {
  const lo = (opts && opts.lo) || 0.3, hi = (opts && opts.hi) || 0.7;
  dir = dir === 'below' ? 'below' : 'above';
  const vals = (values || []).map(Number).filter(Number.isFinite);
  if (vals.length < 5) throw new Error('need at least 5 recent values');
  const d = decimals(vals), r = x => Number(x.toFixed(d));
  const sorted = vals.slice().sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  // Candidates: every recent value plus the gaps between neighbours, so even a flat series gets a threshold.
  const cand = new Set();
  sorted.forEach((v, i) => { cand.add(r(v)); if (i) cand.add(r((v + sorted[i - 1]) / 2)); });
  const inBand = [...cand].map(t => ({ t, p: chance(vals, t, dir) })).filter(x => x.p >= lo && x.p <= hi);
  if (!inBand.length) throw new Error('no threshold puts the chance between ' + lo * 100 + '% and ' + hi * 100 + '% (values may be too flat)');
  inBand.sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5) || Math.abs(a.t - mid) - Math.abs(b.t - mid));
  return { threshold: inBand[0].t, chance: Math.round(inBand[0].p * 100), median: r(mid), band: [lo, hi], n: vals.length };
}

module.exports = { suggestThreshold, chance };

if (require.main === module) {
  const [dir, ...vals] = process.argv.slice(2);
  try {
    const r = suggestThreshold(vals, dir);
    console.log('Suggested threshold: ' + r.threshold + ' (' + dir + ' it: about ' + r.chance + '% on ' + r.n + ' recent values, median ' + r.median + ')');
  } catch (e) { console.error(e.message); process.exit(1); }
}
