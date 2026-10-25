// Main build's resolution test cases (main-app/tests/settlement, a15, engine), rewritten
// against rival A's engine as extra checks on N/A, disputes, the two-admin rule and A15.
// Run: node test-disputes.js
const C = require('./core.js'), assert = require('assert');
const near = (a, b, msg) => assert(Math.abs(a - b) < 0.01, // shares are reported to 2 decimals
  `${msg || ''} ${a} != ${b}`);
const T0 = Date.parse('2026-10-15T12:00:00Z'), H = 3600e3, M = 'onion-120';
let n = 0; const test = (name, fn) => { fn(); n++; console.log('ok', n, name); };

function setup() {
  const s = C.seed(T0, { set: 'dhaka' });
  for (const [id, name] of [['a', 'Ayesha'], ['b', 'Bashir'], ['c', 'Chandni']]) C.addUser(s, id, name, T0);
  C.addUser(s, 'rahim', 'Rahim', T0, { admin: true }); C.addUser(s, 'karim', 'Karim', T0, { admin: true });
  const ya = C.act(s, 'a', 'buy', { id: M, side: 'y', amount: 150 }, T0).shares;
  C.act(s, 'b', 'buy', { id: M, side: 'n', amount: 200 }, T0);
  const yc = C.act(s, 'c', 'buy', { id: M, side: 'y', amount: 100 }, T0).shares;
  C.act(s, 'c', 'sell', { id: M, side: 'y', shares: yc / 2 }, T0);
  return { s, ya, yc, cAfterSell: s.users.c.pts };
}
const pts = (s, id) => s.users[id].pts;
const correct = (s, to, t) => { C.act(s, 'rahim', 'review', { id: M, decision: to }, t); C.act(s, 'karim', 'confirm', { id: M }, t); };

test('N/A refunds every player\'s net stake, so balances return to the start', () => {
  const { s } = setup();
  C.act(s, 'rahim', 'resolve', { id: M, outcome: 'na' }, T0);
  for (const id of ['a', 'b', 'c']) near(pts(s, id), 1000, id);
});

test('resolution pays winners 1 point per share and stops trading', () => {
  const { s, ya } = setup();
  C.act(s, 'rahim', 'resolve', { id: M, outcome: 'y' }, T0);
  near(pts(s, 'a'), 850 + ya); near(pts(s, 'b'), 800);
  assert.throws(() => C.act(s, 'a', 'buy', { id: M, side: 'y', amount: 10 }, T0), /closed/);
  assert.throws(() => C.act(s, 'a', 'sell', { id: M, side: 'y', shares: 1 }, T0), /closed/);
});

test('re-resolving reverses old payouts and applies new ones (YES, then NO, then N/A)', () => {
  const { s, cAfterSell } = setup();
  C.act(s, 'rahim', 'resolve', { id: M, outcome: 'y' }, T0);
  C.act(s, 'b', 'dispute', { id: M, reason: 'TCB list was under 120' }, T0 + H);
  correct(s, 'n', T0 + 2 * H);
  near(pts(s, 'a'), 850); assert(pts(s, 'b') > 800); near(pts(s, 'c'), cAfterSell);
  C.act(s, 'a', 'dispute', { id: M, reason: 'the list was never published' }, T0 + 3 * H);
  correct(s, 'na', T0 + 4 * H);
  for (const id of ['a', 'b', 'c']) near(pts(s, id), 1000, id);
});

test('a correction needs two different admins', () => {
  const { s } = setup();
  C.act(s, 'rahim', 'resolve', { id: M, outcome: 'y' }, T0);
  C.act(s, 'b', 'dispute', { id: M, reason: 'TCB shows ৳115 that day', link: 'https://tcb.gov.bd' }, T0 + 1000);
  const a0 = pts(s, 'a');
  C.act(s, 'rahim', 'review', { id: M, decision: 'n' }, T0 + 3000);
  near(pts(s, 'a'), a0, 'nothing changes on a proposal');
  assert.throws(() => C.act(s, 'rahim', 'confirm', { id: M }, T0 + 4000), /same_admin/);
  assert.throws(() => C.act(s, 'a', 'confirm', { id: M }, T0 + 4000), /forbidden/);
  C.act(s, 'karim', 'confirm', { id: M }, T0 + 5000);
  const m = C.act(s, 'b', 'market', { id: M }, T0 + 5000);
  assert.equal(m.outcome, 'n'); assert.deepEqual(m.review.by, ['rahim', 'karim']); assert(pts(s, 'b') > 800);
});

test('a second admin can reject a proposed correction', () => {
  const { s } = setup();
  C.act(s, 'rahim', 'resolve', { id: M, outcome: 'y' }, T0);
  C.act(s, 'b', 'dispute', { id: M, reason: 'I think it was wrong' }, T0);
  const a0 = pts(s, 'a');
  C.act(s, 'rahim', 'review', { id: M, decision: 'n' }, T0);
  C.act(s, 'karim', 'confirm', { id: M, accept: false }, T0);
  near(pts(s, 'a'), a0); assert.equal(C.act(s, 'a', 'market', { id: M }, T0).outcome, 'y');
  assert.throws(() => C.act(s, 'karim', 'confirm', { id: M }, T0), /no_pending/);
});

test('the same player cannot dispute twice', () => {
  const { s } = setup();
  C.act(s, 'rahim', 'resolve', { id: M, outcome: 'y' }, T0);
  C.act(s, 'b', 'dispute', { id: M, reason: 'first complaint here' }, T0);
  assert.throws(() => C.act(s, 'b', 'dispute', { id: M, reason: 'again, same complaint' }, T0), /already_disputed/);
});

test('upheld dispute leaves balances alone; window closes after 48h', () => {
  const { s } = setup();
  C.act(s, 'rahim', 'resolve', { id: M, outcome: 'y' }, T0);
  const before = pts(s, 'a');
  C.act(s, 'b', 'dispute', { id: M, reason: 'I think the price list was wrong that day.' }, T0 + 10);
  C.act(s, 'rahim', 'review', { id: M, decision: 'keep' }, T0 + 20);
  near(pts(s, 'a'), before);
  assert.equal(C.act(s, 'a', 'market', { id: M }, T0).review.changed, false);
  assert.throws(() => C.act(s, 'c', 'dispute', { id: M, reason: 'Late complaint about it.' }, T0 + 48 * H + 1), /dispute_over/);
});

test('A15: corrected result claws back spent winnings into a shortfall', () => {
  const s = C.seed(T0, { set: 'dhaka' });
  C.addUser(s, 'a', 'Ayesha', T0); C.addUser(s, 'b', 'Bashir', T0);
  C.addUser(s, 'rahim', 'Rahim', T0, { admin: true }); C.addUser(s, 'karim', 'Karim', T0, { admin: true });
  const { shares } = C.act(s, 'a', 'buy', { id: M, side: 'y', amount: 500 }, T0);
  C.act(s, 'b', 'buy', { id: M, side: 'n', amount: 100 }, T0);
  C.act(s, 'rahim', 'resolve', { id: M, outcome: 'y' }, T0);
  C.act(s, 'a', 'buy', { id: 'aqi-jan', side: 'y', amount: 400 }, T0);
  C.act(s, 'a', 'buy', { id: 'mrt1', side: 'n', amount: Math.floor(pts(s, 'a')) }, T0);
  const left = pts(s, 'a');
  C.act(s, 'b', 'dispute', { id: M, reason: 'TCB list says under 120' }, T0 + H);
  C.act(s, 'rahim', 'review', { id: M, decision: 'n' }, T0 + H); C.act(s, 'karim', 'confirm', { id: M }, T0 + H);
  const u = s.users.a;
  assert(u.pts >= 0); near(u.debt, shares - left, 'shortfall');
  assert.equal(C.act(s, 'a', 'market', { id: 'aqi-jan' }, T0).status, 'open', 'open positions are never force-sold');
  assert(C.act(s, 'a', 'market', { id: 'aqi-jan' }, T0).mine.y > 0);
  assert.equal(u.notices[0].from, 'y'); assert.equal(u.notices[0].to, 'n');
  assert(C.act(s, 'a', 'leaders', {}, T0).top.find(r => r.id === 'a').worth < u.pts + 1000, 'leaderboard counts the shortfall');
  assert(C.act(s, 'rahim', 'inbox', {}, T0).audit.some(e => e.action === 'clawback' && e.args.user === 'a'), 'clawback audited');
  s.__owed = u.debt; module.exports.a15 = s;
});

test('A15/A37: top-up repays half, 50 stays playable, second claim same day refused', () => {
  const s = module.exports.a15, u = s.users.a, owed = s.__owed, before = u.pts;
  const r = C.act(s, 'a', 'bonus', {}, T0 + 2 * 24 * H);
  assert.equal(r.added, 50); near(u.pts, before + 50); near(u.debt, owed - 50);
  assert.throws(() => C.act(s, 'a', 'bonus', {}, T0 + 2 * 24 * H + 60e3), /bonus_taken/);
});

test('A15: new winnings repay the shortfall first', () => {
  const s = module.exports.a15, u = s.users.a, owed = u.debt;
  C.act(s, 'rahim', 'resolve', { id: 'mrt1', outcome: 'n' }, T0 + 3 * 24 * H);
  const paid = s.markets.find(m => m.id === 'mrt1').paid.a;
  assert(paid > owed); near(u.debt, 0); assert(u.pts > 0);
});

test('nobody ends with a negative points balance through all of the above', () => {
  for (const s of [module.exports.a15, setup().s]) for (const id in s.users) assert(s.users[id].pts >= -1e-9, id);
});

test('phone numbers are normalised to E.164; device farming is flagged at 3 accounts', () => {
  const { normPhone } = require('./lib/handler.js');
  assert.equal(normPhone('01712-345678'), '+8801712345678');
  assert.equal(normPhone('+880 1712 345678'), '+8801712345678');
  assert.equal(normPhone('12345'), null);
  // one account per number and the device flag are covered end to end in test-api.js
});

console.log(`all ${n} resolution tests passed`);
