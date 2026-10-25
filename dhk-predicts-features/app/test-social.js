// Tests for social.js. Copy core.patch (applied), social.js and this file into rival-a/, then: node test-social.js
'use strict';
const assert = require('assert');
const Core = require('./core.js');
require('./social.js').install(Core);

const DAY = 864e5;
let now = Date.UTC(2026, 10, 22, 6); // Sun 22 Nov 2026, 12:00 Dhaka
const s = Core.seed(now);
const A = 'uA', B = 'uB', C = 'uC', D = 'uD';
[A, B, C, D].forEach((id, i) => Core.addUser(s, id, 'P' + i, now, {}));
const act = (uid, n, a) => Core.act(s, uid, n, a || {}, now);
const open = s.markets.find(m => m.status === 'open' && m.closes > now + 30 * DAY);

// groups: create, join by code (any case, with or without dash), leave
const g = act(A, 'gcreate', { name: '  Office adda <b> ' });
assert.match(g.code, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
assert.strictEqual(g.name, 'Office adda b');
assert.strictEqual(act(B, 'gjoin', { code: g.code.toLowerCase().replace('-', '') }).name, 'Office adda b');
assert.ok(act(B, 'gjoin', { code: g.code }).already);
act(C, 'gjoin', { code: g.code });
assert.throws(() => act(D, 'gjoin', { code: 'ZZZ-ZZZ' }), e => e.code === 'no_group');
assert.throws(() => act(A, 'gcreate', { name: 'x' }), e => e.code === 'bad_name');
assert.throws(() => act(D, 'gjoin', { code: 'constructor' }), e => e.code === 'no_group');

// A23: joining gives nobody anything
const ptsBefore = [A, B, C, D].map(id => s.users[id].pts);
act(D, 'gjoin', { code: g.code });
assert.deepStrictEqual([A, B, C, D].map(id => s.users[id].pts), ptsBefore);

// weekly league: baseline is taken on the first write of the week; gains follow trades
assert.strictEqual(s.week.id, '2026-11-22');
act(B, 'buy', { id: open.id, side: 'y', amount: 100 });
act(C, 'buy', { id: open.id, side: 'y', amount: 200 }); // pushes YES up, so B's holding is worth more
let lg = act(A, 'league', { kind: 'week' });
assert.ok(lg.top.length >= 4 && lg.myRank > 0);
const rowB = lg.top.find(r => r.id === B);
assert.ok(rowB.week > 0, 'B gained after the price moved their way');
assert.strictEqual(lg.top.find(r => r.id === A).week, 0, 'A did nothing this week');

// friends league = people in my groups only
lg = act(A, 'league', { kind: 'friends' });
assert.deepStrictEqual(lg.top.map(r => r.id).sort(), [A, B, C, D].sort());

// group league: ranks groups with >= 3 members; a 1-person group shows only to its member
const solo = act(D, 'gcreate', { name: 'Just me' });
let gl = act(A, 'league', { kind: 'groups' });
assert.ok(gl.top.some(x => x.code === g.code && x.rank === 1));
assert.ok(!gl.top.some(x => x.code === solo.code));
gl = act(D, 'league', { kind: 'groups' });
assert.ok(gl.top.some(x => x.code === solo.code && x.rank === null));

// new week resets the baseline
now += 7 * DAY;
act(C, 'rename', { name: 'P2b' });
assert.strictEqual(s.week.id, '2026-11-29');
assert.strictEqual(act(A, 'league', { kind: 'week' }).top.find(r => r.id === B).week, 0);

// streaks: consecutive top-ups count up, a missed day resets, top-up amount unchanged
const pay = () => { const before = s.users[A].pts; act(A, 'bonus'); return s.users[A].pts - before; };
s.users[A].lastBonus = '';
assert.strictEqual(pay(), Core.DAILY_BONUS);
assert.strictEqual(act(A, 'social').streak, 1);
now += DAY; assert.strictEqual(pay(), Core.DAILY_BONUS); assert.strictEqual(act(A, 'social').streak, 2);
now += DAY; pay(); assert.strictEqual(act(A, 'social').streak, 3);
now += DAY; assert.strictEqual(act(A, 'social').streak, 3, 'still alive the next day before checking in');
now += DAY; assert.strictEqual(act(A, 'social').streak, 0, 'missed a day');
pay(); const so = act(A, 'social');
assert.strictEqual(so.streak, 1); assert.strictEqual(so.best, 3);
assert.strictEqual(so.groups[0].members.length, 4);

// leaving: owner hands over; last one out deletes the group
act(A, 'gleave', { code: g.code });
assert.strictEqual(s.groups[g.code].owner, B);
act(D, 'gleave', { code: solo.code });
assert.ok(!(solo.code in s.groups));

// account deletion removes the player from groups and the week baseline
Core.deleteUser(s, B, now);
assert.ok(!s.groups[g.code].members.includes(B));
assert.ok(!(B in s.weekstart));

// state stays plain JSON (the pgstore / filestore round trip)
assert.deepStrictEqual(JSON.parse(JSON.stringify(s.groups)), s.groups);
console.log('social tests passed');
