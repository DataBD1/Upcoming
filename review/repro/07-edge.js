const { suggestThreshold: s } = require('/home/user/upcoming/threshold-suggester/index.js');
const Core = require('/home/user/upcoming/dhk-predicts-features/app/core.js');
const T = (n, f) => { try { console.log(n, '=>', JSON.stringify(f())); } catch (e) { console.log(n, '=> THROW', e.message); } };
// 1. does threshold affect opening probability?
const a = Core.act ? null : null;
let st = Core.seed(Date.now());
const adm = Core.addUser ? null : null;
T('p0 for two thresholds via fromTemplate (open action)', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const s0 = Core.seed(now);
  const u = Object.keys(s0.users)[0];
  return { users: Object.keys(s0.users).length, markets_q: s0.markets.filter(m => m.tpl).map(m => [m.id, m.hist[0][1]]) };
});
// 2. input handling
const base = [1,2,3,4,5,6,7];
T('empty strings (Number("")=0)', () => s(['','','','','','','1','2','3'], 'above'));
T('nulls -> 0', () => s([null,null,null,null,null,1,2,3], 'above'));
T('booleans/arrays', () => s([true,false,[],[],[5],1,2], 'above'));
T('hex strings 0x10', () => s(['0x10','0x20','0x30','0x40','0x50'], 'above'));
T('1e3', () => s(['1e3','2e3','3e3','4e3','5e3'], 'above'));
T('Infinity dropped silently', () => s([1,2,3,Infinity,Infinity,Infinity,Infinity,4], 'above'));
T('NaN strings dropped silently (garbage 5 -> 3 real)', () => s(['a','b','1','2','3','4','5'], 'above'));
T('negative zero', () => s([-0,0,0,0,0,1,-1], 'above'));
T('dir typo "abov" silently above', () => s(base, 'abov'));
T('dir BELOW uppercase', () => s(base, 'BELOW'));
T('precision: decimals via exponent 1e-7', () => s([1e-7,2e-7,3e-7,4e-7,5e-7], 'above'));
T('precision: 0.1+0.2 style', () => s([0.1,0.2,0.30000000000000004,0.4,0.5,0.6], 'above'));
T('mixed decimals 122.1 & 122.45', () => s([122.1,122.45,122.5,122.8,123,122.6,122.9], 'above'));
T('integers temps (even n -> midpoint .5 rounding to 0 dec)', () => s([10,11,12,13,14,15], 'above'));
T('integers, ties', () => s([13,13,13,14,14,14,15,15], 'above'));
T('huge array 2e6 perf', () => { const a=[];for(let i=0;i<20000;i++)a.push(i%97);const t=Date.now();const r=s(a,'above');return {r,ms:Date.now()-t}; });
T('Math.max(...) stack on 200k values', () => { const a=Array.from({length:200000},(_,i)=>i%50); return s(a,'above'); });
T('negatives vs core regex', () => { const r = s([-3,-1,0,2,1,4,0],'below'); let ok; try { Core.act; ok='n/a'; } catch(e){} return {r, regexAccepts: /^\d+(\.\d+)?$/.test(String(r.threshold)), cases: [-2,'-0.5','1e-7',0.0000001].map(v=>[String(v), /^\d+(\.\d+)?$/.test(String(v))]) }; });
T('threshold string form of tiny/large', () => [String(s([1e21,2e21,3e21,4e21,5e21],'above').threshold)]);
