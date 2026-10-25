// node 01-streak-core.js   (each block prints PASS/FAIL; FAIL = bug reproduced)
const APP = '/home/user/upcoming/dhk-predicts-features/app/';
const Core = require(APP + 'core.js'); require(APP + 'social.js').install(Core);
const DAY = 864e5; let bad = 0;
const check = (name, ok, info) => { if (!ok) bad++; console.log((ok ? 'HELD  ' : 'BUG   ') + name + (info ? '  -> ' + info : '')); };
function fresh(now) { const s = Core.seed(now); Core.addUser(s, 'A', 'A', now, {}); return s; }

// 1. Sign-up day: card says "Take today's 100 points to start a streak" but the bonus is already marked taken.
{ const t0 = Date.UTC(2026, 9, 25, 10); const s = fresh(t0);
  const me = Core.act(s, 'A', 'me', {}, t0); const so = Core.act(s, 'A', 'social', {}, t0);
  let refused = null; try { Core.act(s, 'A', 'bonus', {}, t0); } catch (e) { refused = e.code; }
  check('1 sign-up day: streak_none prompt (streak=0) is shown while bonus is NOT claimable', !(so.streak === 0 && (me.me||me).bonusReady === false && refused === 'bonus_taken'),
    'streak=' + so.streak + ' bonusReady=' + (me.me||me).bonusReady + ' bonus->' + refused); }

// 2. Midnight boundary: 23:59:59 then 00:00:01 next day = 2; refused claim doesn't change anything.
{ const t0 = Date.UTC(2026, 9, 25, 10); const s = fresh(t0); s.users.A.lastBonus = '';
  let t = Date.UTC(2026, 9, 26, 23, 59, 59); Core.act(s, 'A', 'bonus', {}, t);
  try { Core.act(s, 'A', 'bonus', {}, t + 500); } catch (e) {}
  t = Date.UTC(2026, 9, 27, 0, 0, 1); Core.act(s, 'A', 'bonus', {}, t);
  check('2 23:59:59 -> 00:00:01 counts 2, refused claim neutral', Core.act(s, 'A', 'social', {}, t).streak === 2); }

// 3. Migration from the Dhaka clock: claims made under Dhaka days, then the v4 migration flips to UTC.
{ const t0 = Date.UTC(2026, 9, 20, 10); const s = fresh(t0); s.users.A.lastBonus = '';
  s.site.utcOffset = 360; s.site.tz = 'Asia/Dhaka'; s.v = 4; // simulate running on the old Dhaka clock (migration not yet applied)
  // claims at 19:00 UTC = 01:00 Dhaka next day, for 4 days
  for (let i = 0; i < 4; i++) Core.act(s, 'A', 'bonus', {}, Date.UTC(2026, 9, 21 + i, 19));
  const u = s.users.A; const before = { streak: u.streak, streakDay: u.streakDay, lastBonus: u.lastBonus, pts: u.pts };
  s.v = 3; // old state file is loaded by the new code
  const t1 = Date.UTC(2026, 9, 24, 19, 30); // 30 min after the last claim
  const sl = Core.act(s, 'A', 'social', {}, t1).streak;
  let second = false; try { Core.act(s, 'A', 'bonus', {}, t1); second = true; } catch (e) {}
  const after = { streak: Core.act(s, 'A', 'social', {}, t1).streak, pts: s.users.A.pts };
  console.log('   before migration', before, 'streak read right after migration:', sl, 'after', after, 'second bonus paid:', second);
  check('3a streak shown right after migration is not lost', sl >= before.streak, 'streak ' + before.streak + ' -> ' + sl);
  check('3b no second 100-pt bonus 30 min after the migration', !second, 'bonus paid again'); }

// 4. Admin changes site offset mid-streak (city action): streak jumps/lost.
{ const t0 = Date.UTC(2026, 9, 25, 10); const s = fresh(t0); s.users.A.lastBonus = '';
  let t = Date.UTC(2026, 9, 25, 22); Core.act(s, 'A', 'bonus', {}, t); // streak 1, day 10-25
  s.site.utcOffset = 480; t += 8 * 3600e3; // 06:00 next local day, 8 hours later
  Core.act(s, 'A', 'bonus', {}, t);
  check('4 changing site offset does not credit a streak day after 8h', Core.act(s, 'A', 'social', {}, t).streak === 1, 'streak=' + Core.act(s, 'A', 'social', {}, t).streak); }

// 6. Group co-members see each other's streak + internal ids in the API (UI doesn't show them).
{ const t0 = Date.UTC(2026, 9, 25, 10); const s = fresh(t0); Core.addUser(s, 'B', 'B', t0, {});
  const g = Core.act(s, 'A', 'gcreate', { name: 'Grp' }, t0); Core.act(s, 'B', 'gjoin', { code: g.code }, t0);
  const m = Core.act(s, 'A', 'social', {}, t0).groups[0].members.find(x => !x.me);
  check('6 other members rows expose only name/worth/week (no streak, no id)', !('streak' in m) && !('id' in m), JSON.stringify(m)); }
process.exit(bad ? 1 : 0);
