const { suggestThreshold: s, chance } = require('/home/user/upcoming/threshold-suggester/index.js');
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
let viol = 0, thrown = 0, ok = 0, dec = 0, nonNum = 0, outsideRange = 0, tieHeavy = 0, ex = [];
for (let i = 0; i < 200000; i++) {
  const n = 5 + Math.floor(rnd() * 30), d = Math.floor(rnd() * 4), k = 1 + Math.floor(rnd() * 12);
  const vals = Array.from({ length: n }, () => Number((Math.floor(rnd() * k) * (rnd() < .5 ? 1 : 1) / 10 ** d + (rnd() < .3 ? 100 : 0)).toFixed(d)));
  const dir = rnd() < .5 ? 'above' : 'below';
  let r; try { r = s(vals, dir); } catch (e) { thrown++; continue; }
  ok++;
  const p = chance(vals, r.threshold, dir);
  if (p < .3 - 1e-12 || p > .7 + 1e-12) { viol++; if (ex.length < 3) ex.push({ vals, dir, r, p }); }
  if (Math.round(p * 100) !== r.chance) dec++;
  if (!vals.includes(r.threshold)) outsideRange++;
}
console.log({ ok, thrown, bandViolations: viol, printedChanceMismatch: dec, thresholdNotAnObservedValue: outsideRange, ex });
// flat-ish series with a tie-heavy shape: 8 equal + 2 different
console.log('mostly flat', JSON.stringify([5,5,5,5,5,5,5,5,6,6]), (()=>{try{return s([5,5,5,5,5,5,5,5,6,6],'above')}catch(e){return e.message}})());
console.log('mostly flat below', (()=>{try{return s([5,5,5,5,5,5,5,5,6,6],'below')}catch(e){return e.message}})());
// 0.5 rounding collision
console.log('d=0 midpoint', s([1,2,2,3,3,3,4,4,4,4],'above'));
// Float: 122.1+122.2 mid
console.log('float', s([122.15,122.16,122.17,122.18,122.19],'above'));
