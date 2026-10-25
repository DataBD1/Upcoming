// Run: node 06-window-lifecycle.js   (pure Core, time-travelled via `now`)
const Core = require('/home/user/upcoming/dhk-predicts-features/app/core.js');
const H = 36e5, t0 = Date.now();
const s = Core.seed(t0, { set: 'dhaka' });
Core.addUser(s, 'a1', 'A1', t0, { admin: true }); Core.addUser(s, 'a2', 'A2', t0, { admin: true });
Core.addUser(s, 'p', 'P', t0, {});
const mk = () => s.markets.find(m => m.status === 'open' && m.closes > t0);
const T = (f) => { try { return f(); } catch (e) { return 'ERR ' + (e.code || e.message); } };
const m = mk(); Core.act(s, 'p', 'buy', { id: m.id, side: 'y', amount: 100 }, t0);
console.log('propose 24h', T(() => Core.act(s, 'a1', 'propose', { id: m.id, outcome: 'y', hours: 24 }, t0)));
const inbox = (now) => Core.act(s, 'a2', 'inbox', {}, now).proposed[0];
console.log('T+17h soon?', inbox(t0 + 17 * H).soon, '| T+18h soon?', inbox(t0 + 18 * H).soon, '(6h boundary inclusive)');
const late = t0 + 24 * H + 30 * 24 * H; // 30 days after expiry
console.log('T+30d inbox row:', JSON.stringify(inbox(late)), '<- soon:true for an expired window, no "overdue" state');
Core.act(s, 'a2', 'home', {}, late); Core.act(s, 'p', 'home', {}, late);
const hm = s.markets.find(x => x.id === m.id);
console.log('after 30d of reads+other writes: status =', hm.status, ', player pts =', Math.floor(s.users.p.pts), '(never auto-settled)');
console.log('player dispute at T+24h exactly:', T(() => Core.act(s, 'p', 'dispute', { id: m.id, reason: 'last second' }, t0 + 24 * H)), '(allowed, now<=until)');
console.log('player dispute 1ms later (market still "proposed"):', T(() => Core.act(s, 'p', 'dispute', { id: m.id, reason: 'late late' }, t0 + 24 * H + 1)));
console.log('inbox disputes for this proposal visible to admin, but review():', T(() => Core.act(s, 'a2', 'review', { id: m.id, decision: 'n' }, t0 + 24 * H)), '(cannot act on disputes of a proposed market)');
console.log('settle before window w/o early (what UI "Settle now" sends):', T(() => Core.act(s, 'a2', 'resolve', { id: m.id }, t0 + 5 * H)));
console.log('settle by proposer himself (no 2nd admin):', T(() => Core.act(s, 'a1', 'resolve', { id: m.id }, late)), '| status', hm.status, '| disputed:', (hm.disputes||[]).length, 'dispute(s) silently overridden');
// hours edge cases
for (const h of [0, 72, 72.0001, -1, '', ' ', null, 'abc', 1e-9]) {
  const s2 = Core.seed(t0, { set: 'dhaka' }); Core.addUser(s2, 'a1', 'A', t0, { admin: true });
  const m2 = s2.markets.find(x => x.status === 'open');
  const r = T(() => Core.act(s2, 'a1', 'propose', { id: m2.id, outcome: 'y', hours: h }, t0));
  console.log('hours=' + JSON.stringify(h), '->', typeof r === 'string' ? r : 'window ' + (r.until - t0) / H + 'h');
}
// hours=0 : player can never dispute (admin settles same ms)? check window
{ const s3 = Core.seed(t0, { set: 'dhaka' }); Core.addUser(s3,'a1','A',t0,{admin:true}); Core.addUser(s3,'p','P',t0,{});
  const m3 = s3.markets.find(x=>x.status==='open'&&x.closes>t0); Core.act(s3,'p','buy',{id:m3.id,side:'y',amount:50},t0);
  Core.act(s3,'a1','propose',{id:m3.id,outcome:'n',hours:0},t0);
  const row = Core.act(s3,'a1','inbox',{},t0).proposed[0];
  console.log('hours=0 inbox row soon:', row.soon, '| player canDispute at +1s:', Core.act(s3,'p','market',{id:m3.id},t0+1000).canDispute);
  console.log('propose hours=0 then immediate resolve by same admin:', T(()=>Core.act(s3,'a1','resolve',{id:m3.id},t0)), '=> the dispute window/second-admin protection can be skipped by one admin'); }
// sort order
{ const s4 = Core.seed(t0, { set: 'dhaka' }); Core.addUser(s4,'a1','A',t0,{admin:true});
  const ms = s4.markets.filter(x=>x.status==='open').slice(0,3);
  [72, 1, 30].forEach((h,i)=>Core.act(s4,'a1','propose',{id:ms[i].id,outcome:'y',hours:h},t0));
  console.log('inbox order (hours left):', Core.act(s4,'a1','inbox',{},t0).proposed.map(p=>(p.until-t0)/H+'h'+(p.soon?'*':'')).join(', '), '(not sorted by urgency)'); }
