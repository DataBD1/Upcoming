// Streak regression tests (review/01-streak): migration, sign-up day, row privacy.
'use strict';
const assert = require('assert');
const Core = require('./core.js'); require('./social.js').install(Core);
const T = Date.UTC(2026, 9, 24, 19, 30); // 19:30 UTC = 01:30 Dhaka next day

// S1: state saved under the Dhaka clock, loaded by the UTC build 30 minutes after the last claim
{
  const s = Core.seed(T - 864e5); Core.addUser(s, 'A', 'A', T - 864e5, {}); s.users.A.lastBonus = '';
  s.site.utcOffset = 360; s.site.tz = 'Asia/Dhaka';
  for (let i = 0; i < 4; i++) Core.act(s, 'A', 'bonus', {}, Date.UTC(2026, 9, 21 + i, 19));
  s.v = 3;
  const real = Date.now; Date.now = () => T;
  let m; try { m = Core.migrate ? Core.migrate(s) : s; } finally { Date.now = real; }
  assert.strictEqual(m.site.utcOffset, 0);
  assert.strictEqual(Core.act(m, 'A', 'social', {}, T).streak, 4, 'streak survives migration');
  assert.throws(() => Core.act(m, 'A', 'bonus', {}, T), e => e.code === 'bonus_taken', 'no second bonus');
}
// S1 clamp: a future streakDay still counts
{
  const s = Core.seed(T); Core.addUser(s, 'A', 'A', T, {});
  s.users.A.streak = 3; s.users.A.streakDay = '2026-10-25';
  assert.strictEqual(Core.act(s, 'A', 'social', {}, T).streak, 3);
}
// S2: sign-up day cannot claim -> read says bonusReady false; next day true
{
  const s = Core.seed(T); Core.addUser(s, 'A', 'A', T, {});
  assert.strictEqual(Core.act(s, 'A', 'social', {}, T).bonusReady, false);
  assert.strictEqual(Core.act(s, 'A', 'social', {}, T + 864e5).bonusReady, true);
}
// S5/S6: co-members see no id or streak
{
  const s = Core.seed(T); Core.addUser(s, 'A', 'A', T, {}); Core.addUser(s, 'B', 'B', T, {});
  const g = Core.act(s, 'A', 'gcreate', { name: 'Group' }, T); Core.act(s, 'B', 'gjoin', { code: g.code }, T);
  const ms = Core.act(s, 'A', 'social', {}, T).groups[0].members;
  const o = ms.find(x => !x.me), me = ms.find(x => x.me);
  assert(!('id' in o) && !('streak' in o)); assert.strictEqual(me.id, 'A'); assert('streak' in me);
}
console.log('test-streak OK');
