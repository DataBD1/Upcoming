// Dispute window lifecycle: auto-settle, overdue/soon, short windows, hours validation, disputes on proposals. Run: node test-window.js
'use strict';
const assert = require('assert'), C = require('./core.js');
const H = 36e5, t0 = Date.now();
let n = 0; const test = (name, f) => { f(); n++; console.log('ok -', name); };
const setup = () => {
  const s = C.seed(t0, { set: 'dhaka' });
  C.addUser(s, 'a1', 'A1', t0, { admin: true }); C.addUser(s, 'a2', 'A2', t0, { admin: true }); C.addUser(s, 'p', 'P', t0, {});
  const m = s.markets.find(x => x.status === 'open' && x.closes > t0);
  C.act(s, 'p', 'buy', { id: m.id, side: 'y', amount: 100 }, t0);
  return { s, m };
};
const code = f => { try { f(); return 'ok'; } catch (e) { return e.code || e.message; } };

test('time travel: expired undisputed proposal settles on the next write, audited by system', () => {
  const { s, m } = setup();
  C.act(s, 'a1', 'propose', { id: m.id, outcome: 'y', hours: 24 }, t0);
  const late = t0 + 24 * H + 30 * 24 * H, pts0 = s.users.p.pts;
  C.act(s, 'p', 'ack', {}, late); // any write
  assert.equal(m.status, 'resolved'); assert.equal(m.outcome, 'y'); assert(s.users.p.pts > pts0 + 100, 'player paid');
  const au = s.audit.filter(x => x.action === 'autosettle'); assert.equal(au.length, 1); assert.equal(au[0].by, 'system');
  C.act(s, 'p', 'ack', {}, late + 1); assert.equal(s.audit.filter(x => x.action === 'autosettle').length, 1, 'only once');
});
test('reads show the settled result before any write; no auto-settle with an open dispute', () => {
  const { s, m } = setup();
  C.act(s, 'a1', 'propose', { id: m.id, outcome: 'y', hours: 24 }, t0);
  const late = t0 + 25 * H;
  assert.equal(C.act(s, 'p', 'market', { id: m.id }, late).status, 'resolved');
  assert.equal(C.act(s, 'p', 'home', {}, late).markets.find(x => x.id === m.id).outcome, 'y');
  assert.equal(m.status, 'proposed', 'a read never mutates');
  C.act(s, 'p', 'dispute', { id: m.id, reason: 'last second' }, t0 + 24 * H);
  C.act(s, 'p', 'ack', {}, late);
  assert.equal(m.status, 'proposed', 'disputed proposal is not auto-settled');
  assert.equal(C.act(s, 'p', 'market', { id: m.id }, late).status, 'proposed');
});
test('inbox: overdue is not soon, 6h boundary, sorted overdue first then soonest', () => {
  const { s, m } = setup();
  const ms = s.markets.filter(x => x.status === 'open' && x.id !== m.id).slice(0, 3);
  C.act(s, 'a1', 'propose', { id: m.id, outcome: 'y', hours: 24 }, t0);
  [72, 2, 30].forEach((h, i) => C.act(s, 'a1', 'propose', { id: ms[i].id, outcome: 'y', hours: h }, t0));
  C.act(s, 'p', 'dispute', { id: m.id, reason: 'late but ok' }, t0 + H); // disputed: stays proposed after expiry
  const row = (now, id) => C.act(s, 'a2', 'inbox', {}, now).proposed.find(x => x.id === id);
  assert.equal(row(t0 + 17 * H, m.id).soon, false); assert.equal(row(t0 + 18 * H, m.id).soon, true);
  const late = t0 + 40 * H, r = row(late, m.id);
  assert.equal(r.overdue, true); assert.equal(r.soon, false); assert.equal(r.needs, 'review');
  const order = C.act(s, 'a2', 'inbox', {}, late).proposed;
  assert.deepEqual(order.map(x => x.overdue), [true, true, true, false], 'overdue first');
  const rest = C.act(s, 'a2', 'inbox', {}, t0 + H).proposed.filter(x => !x.overdue).map(x => x.until);
  assert.deepEqual(rest, rest.slice().sort((a, b) => a - b), 'soonest deadline first');
});
test('disputes on a proposed market are reviewable; resolve refuses while open; retract archives', () => {
  const { s, m } = setup();
  C.act(s, 'a1', 'propose', { id: m.id, outcome: 'y', hours: 24 }, t0);
  C.act(s, 'p', 'dispute', { id: m.id, reason: 'wrong source' }, t0 + H);
  assert.equal(code(() => C.act(s, 'a2', 'resolve', { id: m.id }, t0 + 25 * H)), 'has_disputes');
  assert.equal(code(() => C.act(s, 'a2', 'resolve', { id: m.id, early: true }, t0 + 5 * H)), 'has_disputes');
  assert.equal(C.act(s, 'a2', 'inbox', {}, t0 + 25 * H).disputes.length, 1);
  // a different result needs the second admin and only changes the proposal
  assert.equal(C.act(s, 'a2', 'review', { id: m.id, decision: 'n' }, t0 + 25 * H).pending, true);
  assert.equal(code(() => C.act(s, 'a2', 'confirm', { id: m.id }, t0 + 25 * H)), 'same_admin');
  C.act(s, 'a1', 'confirm', { id: m.id }, t0 + 25 * H);
  assert.equal(m.proposal.out, 'n'); assert.equal(m.status, 'proposed');
  C.act(s, 'a1', 'ack', {}, t0 + 26 * H); // sweep: disputes are closed, window over
  assert.equal(m.status, 'resolved'); assert.equal(m.outcome, 'n');
  // retract keeps the dispute text
  const x = setup();
  C.act(x.s, 'a1', 'propose', { id: x.m.id, outcome: 'y', hours: 24 }, t0);
  C.act(x.s, 'p', 'dispute', { id: x.m.id, reason: 'wrong source' }, t0 + H);
  C.act(x.s, 'a1', 'retract', { id: x.m.id }, t0 + 2 * H);
  assert.equal(x.m.disputes.length, 0); assert.equal(x.m.disputeLog.length, 1);
  assert(x.s.audit.some(e => e.action === 'retract_disputes' && e.args.n === 1));
  const d = C.act(x.s, 'a1', 'inbox', {}, t0 + 3 * H).disputes; assert.equal(d.length, 1); assert.equal(d[0].retracted, true);
});
test('window under 1h (incl. 0) needs a second admin; early settle needs a different admin', () => {
  const { s, m } = setup();
  C.act(s, 'a1', 'propose', { id: m.id, outcome: 'n', hours: 0 }, t0);
  assert.equal(code(() => C.act(s, 'a1', 'resolve', { id: m.id }, t0)), 'same_admin');
  C.act(s, 'p', 'ack', {}, t0 + 10 * H); assert.equal(m.status, 'proposed', 'short windows are never auto-settled');
  assert.equal(C.act(s, 'a2', 'inbox', {}, t0 + 10 * H).proposed[0].needs, 'approval');
  C.act(s, 'a2', 'resolve', { id: m.id }, t0 + 10 * H); assert.equal(m.status, 'resolved');
  const y = setup();
  C.act(y.s, 'a1', 'propose', { id: y.m.id, outcome: 'y', hours: 24 }, t0);
  assert.equal(code(() => C.act(y.s, 'a2', 'resolve', { id: y.m.id }, t0 + 5 * H)), 'window_open');
  assert.equal(code(() => C.act(y.s, 'a1', 'resolve', { id: y.m.id, early: true }, t0 + 5 * H)), 'same_admin');
  assert.equal(code(() => C.act(y.s, 'a2', 'resolve', { id: y.m.id, early: true }, t0 + 5 * H)), 'ok');
});
test('hours validation', () => {
  for (const h of ['', ' ', 1e-9, 'abc', -1, 73, 0.1, NaN, true, {}, []]) {
    const { s, m } = setup();
    assert.equal(code(() => C.act(s, 'a1', 'propose', { id: m.id, outcome: 'y', hours: h }, t0)), 'bad_window', JSON.stringify(h));
    assert.equal(m.status, 'open');
  }
  for (const h of [undefined, null, 0, 0.25, '2', 72]) {
    const { s, m } = setup();
    assert.equal(code(() => C.act(s, 'a1', 'propose', { id: m.id, outcome: 'y', hours: h }, t0)), 'ok', String(h));
  }
});
test('sweep() settles for the cron route and returns the count', () => {
  const { s, m } = setup();
  C.act(s, 'a1', 'propose', { id: m.id, outcome: 'y', hours: 1 }, t0);
  assert.equal(C.sweep(s, t0 + 30 * 60e3), 0); assert.equal(C.sweep(s, t0 + 2 * H), 1); assert.equal(m.status, 'resolved');
});
console.log(n + ' window tests passed');
