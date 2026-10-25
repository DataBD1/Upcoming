// Resolution tests ported from the main build (main-app/tests) to rival A's core.js API.
// Run from rival-a/: node test-resolution.js
const assert = require('node:assert/strict');
const Core = require('./core.js');

const T0 = Date.parse('2026-10-16T06:00:00Z');
// buy() returns shares rounded to 2 decimals, so allow a hundredth of a point.
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg || ''} ${a} != ${b}`);
const pts = (s, id) => s.users[id].pts;
const debt = (s, id) => s.users[id].debt || 0;
const total = (s, id) => pts(s, id) - debt(s, id);

function world() {
  const s = Core.seed(T0, { set: 'dhaka' });
  Core.addUser(s, 'adm1', 'Rahim', T0, { admin: true });
  Core.addUser(s, 'adm2', 'Karim', T0, { admin: true });
  for (const [id, n] of [['a', 'Ayesha'], ['b', 'Bashir'], ['c', 'Chandni']]) Core.addUser(s, id, n, T0);
  return s;
}
const act = (s, uid, name, args, t = T0 + 1000) => Core.act(s, uid, name, args, t);
const M = 'onion-100-thu';
// Two-admin rule: one admin proposes a correction, a different admin confirms it.
function review2(s, decision, t) {
  const r = act(s, 'adm1', 'review', { id: M, decision }, t);
  assert.equal(r.pending, true, 'first admin only proposes');
  return act(s, 'adm2', 'confirm', { id: M }, t + 1);
}

// 1. Buy then sell back returns the same points.
{
  const s = world();
  const { shares } = act(s, 'a', 'buy', { id: M, side: 'y', amount: 200 });
  act(s, 'a', 'sell', { id: M, side: 'y', shares: 'all' });
  near(pts(s, 'a'), 1000, 'round trip');
  assert.ok(shares > 0);
}

// 2. Cannot overspend, oversell, trade negative, or trade a settled market.
{
  const s = world();
  assert.throws(() => act(s, 'a', 'buy', { id: M, side: 'y', amount: 5000 }), /no_points/);
  assert.throws(() => act(s, 'a', 'sell', { id: M, side: 'n', shares: 1 }), /no_shares/);
  assert.throws(() => act(s, 'a', 'buy', { id: M, side: 'y', amount: -5 }), /bad_amount/);
  act(s, 'adm1', 'resolve', { id: M, outcome: 'n' });
  assert.throws(() => act(s, 'a', 'buy', { id: M, side: 'y', amount: 10 }), /closed/);
}

// 3. YES/NO settlement pays 1 point per winning share, nothing to losers.
{
  const s = world();
  const { shares } = act(s, 'a', 'buy', { id: M, side: 'y', amount: 100 });
  act(s, 'b', 'buy', { id: M, side: 'n', amount: 100 });
  act(s, 'adm1', 'resolve', { id: M, outcome: 'y' });
  near(pts(s, 'a'), 900 + shares, 'winner');
  near(pts(s, 'b'), 900, 'loser');
}

// 4. N/A refund for players who never sold puts everyone back where they started.
{
  const s = world();
  act(s, 'a', 'buy', { id: M, side: 'y', amount: 150 });
  act(s, 'b', 'buy', { id: M, side: 'n', amount: 200 });
  act(s, 'adm1', 'resolve', { id: M, outcome: 'na' });
  near(pts(s, 'a'), 1000, 'a'); near(pts(s, 'b'), 1000, 'b');
}

// 5. N/A for a player who sold part of their position at a profit: the refund is their net
//    spend (buys minus sale proceeds), so they end exactly where they started.
{
  const s = world();
  const { shares } = act(s, 'c', 'buy', { id: M, side: 'y', amount: 100 });
  act(s, 'b', 'buy', { id: M, side: 'y', amount: 400 }); // price rises, c's shares gain value
  act(s, 'c', 'sell', { id: M, side: 'y', shares: shares / 2 });
  assert.ok(pts(s, 'c') > 900 + 50, 'c sold half for more than half the cost');
  act(s, 'adm1', 'resolve', { id: M, outcome: 'na' });
  near(pts(s, 'c'), 1000, 'c back to the start'); near(pts(s, 'b'), 1000, 'b back to the start');
}

// 6. Re-settling reverses old payouts exactly: YES -> NO -> N/A -> YES.
{
  const s = world();
  const ya = act(s, 'a', 'buy', { id: M, side: 'y', amount: 150 }).shares;
  const nb = act(s, 'b', 'buy', { id: M, side: 'n', amount: 200 }).shares;
  act(s, 'adm1', 'resolve', { id: M, outcome: 'y' });
  act(s, 'b', 'dispute', { id: M, reason: 'TCB list shows 95 taka', link: 'https://tcb.gov.bd' }, T0 + 2000);
  review2(s, 'n', T0 + 3000);
  near(total(s, 'a'), 850, 'a after flip'); near(pts(s, 'b'), 800 + nb, 'b after flip');
  review2(s, 'na', T0 + 4000);
  near(total(s, 'a'), 1000, 'a after NA'); near(total(s, 'b'), 1000, 'b after NA');
  review2(s, 'y', T0 + 5000);
  near(total(s, 'a'), 850 + ya, 'a back to YES'); near(total(s, 'b'), 800, 'b back to YES');
}

// 7. A15: spent winnings become a shortfall; open positions are not sold; leaderboard counts it.
{
  const s = world();
  const ya = act(s, 'a', 'buy', { id: M, side: 'y', amount: 500 }).shares;
  act(s, 'adm1', 'resolve', { id: M, outcome: 'y' });
  act(s, 'a', 'buy', { id: 'mrt1', side: 'y', amount: Math.floor(pts(s, 'a')) - 5 }, T0 + 1500);
  const left = pts(s, 'a');
  act(s, 'b', 'buy', { id: 'mrt1', side: 'n', amount: 1 }, T0 + 1600); // b isn't a holder of M
  assert.throws(() => act(s, 'b', 'dispute', { id: M, reason: 'not a holder' }, T0 + 2000), /not_holder/);
  Core.act(s, 'a', 'dispute', { id: M, reason: 'checking the rule, self-dispute' }, T0 + 2000);
  review2(s, 'n', T0 + 3000);
  near(pts(s, 'a'), 0, 'points in hand taken first');
  near(debt(s, 'a'), ya - left, 'rest is a shortfall');
  assert.ok(s.pos.a.mrt1.y > 0, 'open position kept');
  assert.equal(s.users.a.notices.length, 1, 'player notified');
  assert.ok((s.audit || []).some((x) => x.action === 'clawback' && x.args.user === 'a'), 'clawback audited');
  const lead = Core.act(s, 'a', 'leaders', {}, T0 + 3000).top.find((r) => r.id === 'a');
  const m = s.markets.find((x) => x.id === 'mrt1');
  near(lead.worth, Math.round(pts(s, 'a') - debt(s, 'a') + Core.proceedsFor(m, 'y', s.pos.a.mrt1.y)), 'leaderboard = points - shortfall + sell-back value');
  assert.ok(lead.worth < 1000 + 1, 'leaderboard worth includes the shortfall');
}

// 8. A15: daily top-up repays half, keeps at least 50 playable, once per site day.
{
  const s = world();
  s.users.a.debt = 120; s.users.a.lastBonus = '2000-01-01';
  const r = act(s, 'a', 'bonus', {}, T0);
  assert.equal(r.added, 50); assert.equal(r.repaid, 50); near(debt(s, 'a'), 70);
  assert.throws(() => act(s, 'a', 'bonus', {}, T0 + 60e3), /bonus_taken/);
  // Next site day starts at 00:00 UTC (site clock is fixed UTC+0 for the diaspora beta).
  const nextDay = Date.parse('2026-10-17T00:00:01Z');
  act(s, 'a', 'bonus', {}, nextDay); near(debt(s, 'a'), 20);
  // New winnings pay the rest of the shortfall before becoming playable.
  const ya = act(s, 'a', 'buy', { id: M, side: 'y', amount: 100 }, nextDay + 1000).shares;
  const before = pts(s, 'a');
  act(s, 'adm1', 'resolve', { id: M, outcome: 'y' }, nextDay + 2000);
  near(debt(s, 'a'), 0); near(pts(s, 'a'), before + ya - 20);
}

// 9. Dispute window closes after 48 hours; one dispute per player.
{
  const s = world();
  act(s, 'a', 'buy', { id: M, side: 'y', amount: 50 });
  act(s, 'adm1', 'resolve', { id: M, outcome: 'n' }, T0 + 1000);
  act(s, 'a', 'dispute', { id: M, reason: 'first complaint here' }, T0 + 2000);
  assert.throws(() => act(s, 'a', 'dispute', { id: M, reason: 'second complaint' }, T0 + 3000), /already_disputed/);
  const s2 = world();
  act(s2, 'a', 'buy', { id: M, side: 'y', amount: 50 });
  act(s2, 'adm1', 'resolve', { id: M, outcome: 'n' }, T0 + 1000);
  assert.throws(() => act(s2, 'a', 'dispute', { id: M, reason: 'too late now' }, T0 + 1000 + 48 * 3600e3 + 1), /dispute_over/);
}

// 10. Only admins settle or review.
{
  const s = world();
  assert.throws(() => act(s, 'a', 'resolve', { id: M, outcome: 'y' }), /forbidden/);
  act(s, 'a', 'buy', { id: M, side: 'y', amount: 50 });
  act(s, 'adm1', 'resolve', { id: M, outcome: 'n' });
  act(s, 'a', 'dispute', { id: M, reason: 'wrong result' }, T0 + 2000);
  assert.throws(() => act(s, 'a', 'review', { id: M, decision: 'y' }), /forbidden/);
}

// 11. Points are conserved across a full life cycle: what the market maker took in,
//     minus what it paid out, equals the change in all players' totals.
{
  const s = world();
  act(s, 'a', 'buy', { id: M, side: 'y', amount: 300 });
  act(s, 'b', 'buy', { id: M, side: 'n', amount: 250 });
  act(s, 'c', 'buy', { id: M, side: 'y', amount: 120 });
  act(s, 'c', 'sell', { id: M, side: 'y', shares: 'all' });
  act(s, 'adm1', 'resolve', { id: M, outcome: 'y' });
  const m = s.markets.find((x) => x.id === M);
  const paid = Object.values(m.paid).reduce((x, y) => x + y, 0);
  const players = ['a', 'b', 'c'].reduce((x, id) => x + total(s, id) - 1000, 0);
  near(players, paid - (300 + 250 + 120) + (pts(s, 'c') - 880), 'conservation');
}

// 12. Settling twice is refused; review needs an open dispute.
{
  const s = world();
  act(s, 'adm1', 'resolve', { id: M, outcome: 'y' });
  assert.throws(() => act(s, 'adm1', 'resolve', { id: M, outcome: 'n' }), /closed/);
  assert.throws(() => act(s, 'adm1', 'review', { id: M, decision: 'n' }), /no_dispute/);
}

// 13. Two-admin rule: a correction needs a second, different admin; keeping the result doesn't.
{
  const s = world();
  act(s, 'a', 'buy', { id: M, side: 'y', amount: 100 });
  act(s, 'adm1', 'resolve', { id: M, outcome: 'y' });
  act(s, 'a', 'dispute', { id: M, reason: 'checking two admins' }, T0 + 2000);
  assert.equal(act(s, 'adm1', 'review', { id: M, decision: 'n' }, T0 + 3000).pending, true);
  assert.throws(() => act(s, 'adm1', 'confirm', { id: M }, T0 + 3001), /same_admin/);
  assert.equal(s.markets.find((x) => x.id === M).outcome, 'y', 'nothing changes on one admin');
  act(s, 'adm2', 'confirm', { id: M, accept: false }, T0 + 3002);
  assert.equal(s.markets.find((x) => x.id === M).outcome, 'y', 'rejected proposal changes nothing');
  assert.throws(() => act(s, 'adm2', 'confirm', { id: M }, T0 + 3003), /no_pending/);
  act(s, 'adm2', 'review', { id: M, decision: 'na' }, T0 + 3004);
  act(s, 'adm1', 'confirm', { id: M }, T0 + 3005);
  assert.equal(s.markets.find((x) => x.id === M).outcome, 'na');
  assert.deepEqual(s.markets.find((x) => x.id === M).review.by, ['adm2', 'adm1']);
  near(pts(s, 'a'), 1000, 'N/A after correction refunds a');
}

// 14. Leaderboard can't be pumped by one big buy: worth stays at what the player could sell for.
{
  const s = world();
  act(s, 'c', 'buy', { id: 'mrt1', side: 'y', amount: 990 });
  const w = Core.act(s, 'c', 'leaders', {}, T0 + 2000).top.find((r) => r.id === 'c').worth;
  assert.ok(w <= 1000, `worth ${w} should not exceed the 1,000 the player started with`);
}

console.log('14 resolution tests passed');
