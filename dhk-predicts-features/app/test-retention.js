// First-20 retention metrics (gtm/first-20-users.md section 4). Run: node test-retention.js
'use strict';
const assert = require('assert');
const Core = require('./core.js');
const DAY = 864e5;
let now = Date.UTC(2026, 9, 20, 6); // 12:00 on the Dhaka site clock
const s = Core.seed(now, { set: 'dhaka' });
Core.addUser(s, 'adm', 'Admin', now, { admin: true });
Core.addUser(s, 'uA', 'Asha', now, {}); Core.addUser(s, 'uB', 'Bilal', now, {});
const act = (uid, n, a) => Core.act(s, uid, n, a || {}, now);
const open = s.markets.filter(m => m.status === 'open');
const byCat = {}; open.forEach(m => { (byCat[m.cat] = byCat[m.cat] || []).push(m); });
const [c1, c2] = Object.keys(byCat);
const late = open.find(m => m.closes > now + 20 * DAY);

// Day 0: Asha predicts 3 times across 2 categories. Reloads the same day don't count as a return.
act('uA', 'track', { e: 'return_visit' });
act('uA', 'buy', { id: byCat[c1][0].id, side: 'y', amount: 10 });
act('uA', 'buy', { id: byCat[c1][0].id, side: 'n', amount: 10 });
act('uA', 'buy', { id: byCat[c2][0].id, side: 'y', amount: 10 });
act('uA', 'track', { e: 'return_visit' });
// Day 1: Asha opens the app (first open since sign-up, no earlier lastVisit) and sees a result.
now += DAY; act('uA', 'track', { e: 'return_visit' });
act('adm', 'resolve', { id: byCat[c1][0].id, outcome: 'y' });
act('uA', 'track', { e: 'resolution_seen', id: byCat[c1][0].id });
act('uA', 'track', { e: 'resolution_seen', id: byCat[c1][0].id }); // counted once
let k = act('adm', 'metrics');
let a = k.cohort.find(r => r.name === 'Asha'), b = k.cohort.find(r => r.name === 'Bilal');
assert.equal(k.cohort.length, 2, 'admins are not in the cohort');
assert.deepEqual([a.predictions_d7, a.categories_d7, a.saw_resolution_d7, a.activated], [3, 2, true, true]);
assert.strictEqual(a.returned_d1, null, 'day 1 not over yet');
assert.strictEqual(k.activated, 1);
// Day 8: Asha comes back and predicts in week 2. Bilal never returned.
now += 7 * DAY; act('uA', 'track', { e: 'return_visit' }); act('uA', 'buy', { id: late.id, side: 'y', amount: 10 });
now += 7 * DAY;
k = act('adm', 'metrics'); a = k.cohort.find(r => r.name === 'Asha'); b = k.cohort.find(r => r.name === 'Bilal');
assert.deepEqual([a.returned_d1, a.returned_d3, a.returned_d7, a.returned_d14, a.active_week2], [true, false, false, false, true]);
assert.deepEqual([b.returned_d1, b.predictions_d7, b.activated, b.first_prediction], [false, 0, false, null]);
assert.deepEqual(k.returns.returned_d1, { yes: 1, of: 2 });
assert.equal(a.signed_up, '2026-10-20');
assert(!JSON.stringify(k.cohort).match(/\+\d{6,}/), 'no phone numbers in the export');
// A31: a deleted player drops out of the cohort.
Core.deleteUser(s, 'uB', now);
assert.equal(act('adm', 'metrics').cohort.length, 1);
assert.throws(() => act('uA', 'metrics'), e => e.code === 'forbidden');
// Site clock is fixed UTC+0 (GTM, diaspora beta): the top-up resets at UK midnight, and a v3 state
// still on Dhaka time migrates. Markets keep their own city clock.
{
  const t = Date.UTC(2026, 9, 20, 23, 30), x = Core.seed(t);
  assert.equal(x.site.utcOffset, 0);
  Core.addUser(x, 'p', 'P', t - DAY, {}); x.users.p.lastBonus = '2000-01-01';
  Core.act(x, 'p', 'bonus', {}, t);
  assert.throws(() => Core.act(x, 'p', 'bonus', {}, t + 20 * 60e3), e => e.code === 'bonus_taken', 'same UK day');
  Core.act(x, 'p', 'bonus', {}, t + 31 * 60e3); // 00:01 UTC, a new day
  const old = Core.seed(t, { set: 'dhaka' }); old.v = 3; old.site.utcOffset = 360; old.site.tz = 'Asia/Dhaka';
  Core.migrate(old); assert.deepEqual([old.v, old.site.utcOffset, old.site.tz], [4, 0, 'UTC']);
  assert(old.markets.every(m => m.utcOffset === 360), 'Dhaka markets keep Dhaka time');
  const mine = Core.seed(t); mine.v = 3; mine.site.utcOffset = 330; Core.migrate(mine); assert.equal(mine.site.utcOffset, 330, 'an admin choice is kept');
}
console.log('retention metrics tests passed');
