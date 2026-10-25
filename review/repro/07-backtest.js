const { suggestThreshold: s } = require('/home/user/upcoming/threshold-suggester/index.js');
let seed = 7; const u = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const gauss = () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
const r2 = (x, d) => Number(x.toFixed(d));
// Each model: state step function returning next value given prior state (mutable), with rounding digits.
const models = {
  'taka crawl (drift +0.03/d, sd 0.08, 2dp)': { d: 2, init: () => ({ x: 122.5 }), step: st => (st.x += 0.03 + 0.08 * gauss(), st.x) },
  'taka fast depreciation (drift +0.15/d, sd 0.08, 2dp)': { d: 2, init: () => ({ x: 122.5 }), step: st => (st.x += 0.15 + 0.08 * gauss(), st.x) },
  'taka pegged-ish (drift 0, sd 0.02, 2dp)': { d: 2, init: () => ({ x: 122.5 }), step: st => (st.x += 0.02 * gauss(), st.x) },
  'GBP/USD random walk (sd 0.5%, 4dp)': { d: 4, init: () => ({ x: 1.30 }), step: st => (st.x *= 1 + 0.005 * gauss(), st.x) },
  'LHR Tmax autumn->winter (seasonal -0.18C/d, AR1 .6 sd 3, 0dp)': { d: 0, init: () => ({ day: 0, e: 0 }), step: st => (st.day++, st.e = 0.6 * st.e + 2.4 * gauss(), 15 - 0.18 * st.day + st.e) },
  'LHR Tmax spring (seasonal +0.15C/d, AR1 .6 sd 3, 1dp)': { d: 1, init: () => ({ day: 0, e: 0 }), step: st => (st.day++, st.e = 0.6 * st.e + 2.4 * gauss(), 8 + 0.15 * st.day + st.e) },
  'Dubai Tmax stable (seasonal -0.1, sd 1.5, 0dp)': { d: 0, init: () => ({ day: 0, e: 0 }), step: st => (st.day++, st.e = 0.5 * st.e + 1.3 * gauss(), 38 - 0.1 * st.day + st.e) },
};
function run(name, M, W) {
  const N = 3000, K = 300; let yes = 0, n = 0, devS = 0, devN = 0, inband = 0, thrown = 0, yesN = 0, tieS = 0, tieN = 0, outS = 0, outN = 0, wrongSide = 0;
  for (let i = 0; i < N; i++) {
    const st = M.init(); for (let k = 0; k < 40; k++) M.step(st); // burn in
    const h = []; for (let k = 0; k < W; k++) h.push(r2(M.step(st), M.d));
    let sug; try { sug = s(h, 'above'); } catch (e) { thrown++; continue; }
    const T = sug.threshold, Tn = h[h.length - 1]; // naive: yesterday's value
    // true P(next > T) by resampling next step from a cloned state
    let cs = 0, cn = 0, ts = 0, tn = 0;
    for (let j = 0; j < K; j++) { const c = JSON.parse(JSON.stringify(st)); const v = r2(M.step(c), M.d); if (v > T) cs++; if (v > Tn) cn++; if (v === T) ts++; if (v === Tn) tn++; }
    const pS = cs / K, pN = cn / K; n++;
    devS += Math.abs(pS - .5); devN += Math.abs(pN - .5);
    if (pS >= .3 && pS <= .7) inband++;
    if (pS < .2 || pS > .8) outS++; if (pN < .2 || pN > .8) outN++;
    tieS += ts / K; tieN += tn / K;
    if ((pS > .5) !== (sug.chance > 50) && Math.abs(pS - .5) > .1) wrongSide++;
  }
  console.log(`W=${W} ${name}: n=${n} thrown=${thrown} | mean|P(YES)-50%|: suggester ${(100 * devS / n).toFixed(1)}pp vs yesterday ${(100 * devN / n).toFixed(1)}pp | true P(YES) in 30-70 band: suggester ${(100 * inband / n).toFixed(0)}% | >80/<20 extreme: suggester ${(100 * outS / n).toFixed(0)}% yesterday ${(100 * outN / n).toFixed(0)}% | P(exact tie at T) suggester ${(100 * tieS / n).toFixed(1)}% yesterday ${(100 * tieN / n).toFixed(1)}%`);
}
for (const W of [7, 30]) for (const k in models) run(k, models[k], W);
