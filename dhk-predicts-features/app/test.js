// Run: node test.js
const C = require('./core.js'), assert = require('assert');
const now = Date.parse('2026-10-15T12:00:00Z');
const s = C.seed(now, { set: 'dhaka', bots: true });
C.addUser(s, 'u1', 'Test', now);
C.addUser(s, 'adm', 'Admin', now, { admin: true });
const m0 = C.act(s, 'u1', 'market', { id: 'aqi-jan' }, now);
assert(Math.abs(m0.p - 0.64) < 0.01, 'seed price');
const b = C.act(s, 'u1', 'buy', { id: 'aqi-jan', side: 'y', amount: 100 }, now);
assert(b.shares > 100 && b.p > 0.64 && b.pts === 900, 'buy');
const sl = C.act(s, 'u1', 'sell', { id: 'aqi-jan', side: 'y', shares: 'all' }, now);
assert(Math.abs(sl.points + 900 - 1000) <= 1 && Math.abs(sl.p - 0.64) < 0.001, 'round trip returns points');
assert.throws(() => C.act(s, 'u1', 'buy', { id: 'aqi-jan', side: 'y', amount: 5000 }, now), /no_points/);
assert.throws(() => C.act(s, 'u1', 'bonus', {}, now), /bonus_taken/);
assert.equal(C.act(s, 'u1', 'bonus', {}, now + 864e5).added, 100);
C.act(s, 'u1', 'buy', { id: 'cold-15', side: 'n', amount: 200 }, now);
const sh = C.act(s, 'u1', 'me', {}, now).rows[0].n;
assert.throws(() => C.act(s, 'u1', 'resolve', { id: 'cold-15', outcome: 'n' }, now), /forbidden/);
const before = s.users.u1.pts;
C.act(s, 'adm', 'resolve', { id: 'cold-15', outcome: 'n' }, now);
assert(Math.abs(s.users.u1.pts - before - sh) < 0.01, 'payout');
assert.throws(() => C.act(s, 'u1', 'buy', { id: 'cold-15', side: 'y', amount: 10 }, now), /closed/);
// extreme trade stays finite
C.addUser(s, 'w', 'Whale', now); s.users.w.pts = 1e6;
assert.throws(() => C.act(s, 'w', 'buy', { id: 'usd-125', side: 'y', amount: 1e6 }, now), /too_big/);
assert(C.act(s, 'w', 'buy', { id: 'usd-125', side: 'y', amount: 500 }, now).p < 0.99, 'whale');
console.log('all engine tests passed; leaderboard top:', C.act(s, 'u1', 'leaders', {}, now).top[0].name);

// ---- disputes, N/A, feedback ----
{
  const s = C.seed(now, { set: 'dhaka', bots: true });
  C.addUser(s, 'a', 'A', now); C.addUser(s, 'b', 'B', now); C.addUser(s, 'adm', 'Admin', now, { admin: true }); C.addUser(s, 'adm2', 'Admin 2', now, { admin: true });
  C.act(s, 'a', 'buy', { id: 'onion-100-thu', side: 'y', amount: 300 }, now);
  C.act(s, 'b', 'buy', { id: 'onion-100-thu', side: 'n', amount: 200 }, now);
  const a0 = s.users.a.pts, b0 = s.users.b.pts;
  C.act(s, 'adm', 'resolve', { id: 'onion-100-thu', outcome: 'y', note: '৳155', link: 'https://tcb.gov.bd' }, now);
  const aWin = s.users.a.pts - a0; assert(aWin > 300 && s.users.b.pts === b0, 'yes payout');
  assert.throws(() => C.act(s, 'adm', 'dispute', { id: 'onion-100-thu', reason: 'not a holder' }, now), /not_holder/);
  assert.throws(() => C.act(s, 'b', 'dispute', { id: 'onion-100-thu', reason: 'late' }, now + 49 * 3600e3), /dispute_over/);
  C.act(s, 'b', 'dispute', { id: 'onion-100-thu', reason: 'TCB list showed ৳145', link: 'https://tcb.gov.bd/x' }, now + 3600e3);
  assert.equal(C.act(s, 'adm', 'inbox', {}, now).disputes.length, 1);
  C.act(s, 'adm', 'review', { id: 'onion-100-thu', decision: 'na' }, now);
  assert.throws(() => C.act(s, 'adm', 'confirm', { id: 'onion-100-thu' }, now), /same_admin/);
  C.act(s, 'adm2', 'confirm', { id: 'onion-100-thu' }, now);
  assert(Math.abs(s.users.a.pts - (a0 + 300)) < 0.01 && Math.abs(s.users.b.pts - (b0 + 200)) < 0.01, 'N/A refunds exactly');
  C.act(s, 'adm', 'review', { id: 'onion-100-thu', decision: 'n' }, now); C.act(s, 'adm2', 'confirm', { id: 'onion-100-thu' }, now);
  assert(Math.abs(s.users.a.pts - a0) < 0.01 && s.users.b.pts > b0 + 200, 're-resolve recalcs');
  const mine = C.act(s, 'a', 'me', {}, now).rows.find(r => r.id === 'onion-100-thu');
  assert(mine && mine.value === 0, 'lost bet stays in portfolio');
  C.act(s, null, 'feedback', { text: 'app is slow on my Symphony phone', page: 'home' }, now);
  C.act(s, 'a', 'feedback', { text: 'love it' }, now);
  const ib = C.act(s, 'adm', 'inbox', {}, now);
  assert(ib.feedback.length === 2 && ib.feedback[1].name === 'guest');
  C.act(s, 'adm', 'fbstatus', { fid: ib.feedback[0].id, status: 'closed' }, now);
  assert.throws(() => C.act(s, 'a', 'inbox', {}, now), /forbidden/);
  console.log('dispute / N/A / feedback tests passed');
}

// ---- admin create + audit ----
{
  const s = C.seed(now, { set: 'dhaka', bots: true });
  C.addUser(s, 'adm', 'Admin', now, { admin: true }); C.addUser(s, 'a', 'A', now);
  const r = C.act(s, 'adm', 'create', { en: 'Will it rain in Dhaka tomorrow?', bn: 'কাল কি ঢাকায় বৃষ্টি হবে?', srcEn: 'BMD', closes: '2026-10-20', p: 40, cat: 'weather' }, now);
  assert(Math.abs(C.act(s, 'a', 'market', { id: r.id }, now).p - 0.4) < 0.01, 'created market price');
  assert.throws(() => C.act(s, 'a', 'create', { en: 'x' }, now), /forbidden/);
  assert.throws(() => C.act(s, 'adm', 'create', { en: 'Will it rain in Dhaka tomorrow?', bn: 'কাল বৃষ্টি?', srcEn: 'BMD', closes: '2020-01-01' }, now), /bad_date/);
  C.act(s, 'adm', 'resolve', { id: r.id, outcome: 'na' }, now);
  const log = C.act(s, 'adm', 'inbox', {}, now).audit;
  assert(log.length === 2 && log[0].action === 'resolve', 'audit log');
  // nobody can go negative
  for (const id of Object.keys(s.users)) assert(s.users[id].pts >= 0);
  console.log('admin create / audit tests passed');
}

// ---- A15: correction after winnings were spent ----
{
  const s = C.seed(now, { set: 'dhaka', bots: true });
  C.addUser(s, 'adm', 'Admin', now, { admin: true }); C.addUser(s, 'adm2', 'Admin 2', now, { admin: true }); C.addUser(s, 'w', 'Winner', now);
  C.act(s, 'w', 'buy', { id: 'aqi-250-wk', side: 'y', amount: 400 }, now);
  C.act(s, 'adm', 'resolve', { id: 'aqi-250-wk', outcome: 'y' }, now);
  const won = s.users.w.pts - 600; assert(won > 400, 'won');
  C.act(s, 'w', 'buy', { id: 'mrt1', side: 'n', amount: Math.floor(s.users.w.pts) - 10 }, now); // spends almost everything
  const inHand = s.users.w.pts;
  C.act(s, 'w', 'dispute', { id: 'aqi-250-wk', reason: 'wrong station used' }, now);
  C.act(s, 'adm', 'review', { id: 'aqi-250-wk', decision: 'n' }, now); C.act(s, 'adm2', 'confirm', { id: 'aqi-250-wk' }, now);
  const u = s.users.w;
  assert(u.pts === 0 && Math.abs(u.debt - (won - inHand)) < 0.01, 'full clawback, shortfall = rest');
  assert(u.notices.length === 1 && Math.abs(u.notices[0].amount + won) < 1, 'notice');
  const lb = C.act(s, 'w', 'leaders', {}, now).top.find(r => r.id === 'w');
  assert(lb.worth < 1000, 'leaderboard counts the shortfall');
  const d0 = u.debt, bo = C.act(s, 'w', 'bonus', {}, now + 864e5);
  assert(bo.added === 50 && Math.abs(u.debt - (d0 - 50)) < 0.01, 'half the top-up repays, 50 playable');
  assert(C.act(s, 'adm', 'inbox', {}, now).audit.some(x => x.action === 'clawback'), 'clawback audited');
  // new winnings go to the shortfall first
  C.act(s, 'adm', 'resolve', { id: 'mrt1', outcome: 'n' }, now);
  assert(u.debt === 0 && u.pts > 0, 'winnings clear the shortfall');
  console.log('A15 clawback tests passed');
}

// ---- A34: city, timezone and source are data ----
{
  const s = C.seed(now, { set: 'dhaka', bots: true });
  C.addUser(s, 'adm', 'Admin', now, { admin: true }); C.addUser(s, 'a', 'A', now);
  const h = C.act(s, 'a', 'home', {}, now);
  assert(h.site.name.en === 'Dhaka Predicts' && h.markets.every(m => m.city === 'dhaka' && m.utcOffset === 360 && m.tz === 'Asia/Dhaka'));
  assert.equal(new Date(h.markets.find(m => m.id === 'aqi-jan').closes).toISOString(), '2027-01-31T17:59:00.000Z', 'closes 23:59 Dhaka time');
  // switch the first market to another city purely with data
  C.act(s, 'adm', 'city', { id: 'kolkata', en: 'Kolkata', bn: 'কলকাতা', tz: 'Asia/Kolkata', utcOffset: 330, home: true, siteEn: 'Kolkata Predicts', siteBn: 'কলকাতা প্রেডিক্টস' }, now);
  const r = C.act(s, 'adm', 'create', { en: 'Will Kolkata get 20 mm of rain on 1 Nov?', bn: 'কলকাতায় ১ নভেম্বর কি ২০ মিমি বৃষ্টি হবে?', srcEn: 'IMD Alipore', closes: '2026-11-01', p: 30, cat: 'weather', city: 'kolkata' }, now);
  const m = C.act(s, 'a', 'market', { id: r.id }, now);
  assert(m.city === 'kolkata' && m.utcOffset === 330 && m.site.name.en === 'Kolkata Predicts');
  assert.equal(new Date(m.closes).toISOString(), '2026-11-01T18:29:00.000Z', 'closes 23:59 Kolkata time');
  // an old v1 state migrates
  const old = JSON.parse(JSON.stringify(C.seed(now, { set: 'dhaka', bots: true }))); old.v = 1; delete old.site; delete old.cities; old.markets.forEach(x => { delete x.city; delete x.tz; delete x.utcOffset; });
  C.addUser(old, 'z', 'Z', now);
  assert(C.act(old, 'z', 'home', {}, now).markets[0].city === 'dhaka' && old.v === 4, 'migration');
  // A37: 100 once per site day, no build-up
  const u = s.users.a, p0 = u.pts;
  assert.throws(() => C.act(s, 'a', 'bonus', {}, now), /bonus_taken/);
  C.act(s, 'a', 'bonus', {}, now + 5 * 864e5);
  assert.equal(u.pts - p0, 100, 'missed days do not build up');
  console.log('A34 city / A37 top-up tests passed');
}

// ---- liquidity (Risk M2) and prototype names ----
{
  const s = C.seed(now, { set: 'dhaka', bots: true }); C.addUser(s, 'u', 'U', now); s.users.u.pts = 1000;
  const m = s.markets.find(x => x.id === 'onion-100-thu'), p0 = C.priceYes(m.b, m.qy, m.qn);
  const r = C.act(s, 'u', 'buy', { id: m.id, side: 'y', amount: 1000 }, now);
  assert(r.p - p0 <= 0.16, 'full starting balance moves the % by at most ~15 points: ' + (r.p - p0));
  for (const n of ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__']) {
    assert.throws(() => C.act(s, null, n, {}, now), e => e.code === 'unknown');
    assert.strictEqual(C.isWrite(n), false);
  }
  console.log('liquidity / prototype-name tests passed');
}

// ---- Rival C ports: one-side sell N/A, trader count, propose-then-settle, user lookup/adjust ----
{
  const T = { set: 'dhaka' };
  let s = C.seed(now, T); C.addUser(s, 'a', 'A', now); C.addUser(s, 'adm', 'Admin', now, { admin: true });
  C.act(s, 'a', 'buy', { id: 'aqi-jan', side: 'y', amount: 100 }, now);
  C.act(s, 'a', 'buy', { id: 'aqi-jan', side: 'n', amount: 100 }, now);
  C.act(s, 'a', 'sell', { id: 'aqi-jan', side: 'y', shares: 'all' }, now);
  C.act(s, 'adm', 'resolve', { id: 'aqi-jan', outcome: 'na', note: 'x' }, now);
  assert(Math.abs(s.users.a.pts - 1000) < 1, 'N/A refund after one-side sell');
  const tr0 = s.markets.find(m => m.id === 'mrt1').traders;
  C.act(s, 'a', 'buy', { id: 'mrt1', side: 'y', amount: 10 }, now); C.act(s, 'a', 'sell', { id: 'mrt1', side: 'y', shares: 'all' }, now); C.act(s, 'a', 'buy', { id: 'mrt1', side: 'y', amount: 10 }, now);
  assert.equal(s.markets.find(m => m.id === 'mrt1').traders, tr0 + 1, 'trader counted once');
  // propose -> trading stops -> dispute -> window -> retract / settle
  s = C.seed(now, T); C.addUser(s, 'a', 'A', now); C.addUser(s, 'adm', 'Admin', now, { admin: true });
  C.act(s, 'a', 'buy', { id: 'usd-125', side: 'n', amount: 100 }, now);
  C.act(s, 'adm', 'propose', { id: 'usd-125', outcome: 'y', hours: 24 }, now);
  assert.throws(() => C.act(s, 'a', 'buy', { id: 'usd-125', side: 'y', amount: 10 }, now), /closed/);
  C.act(s, 'a', 'dispute', { id: 'usd-125', reason: 'rate was 124.9' }, now + 3600e3);
  assert.throws(() => C.act(s, 'adm', 'resolve', { id: 'usd-125' }, now + 2 * 3600e3), /window_open/);
  C.act(s, 'adm', 'retract', { id: 'usd-125' }, now + 2 * 3600e3);
  C.act(s, 'adm', 'propose', { id: 'usd-125', outcome: 'n', hours: 0 }, now + 3 * 3600e3);
  const p0 = s.users.a.pts; C.act(s, 'adm', 'resolve', { id: 'usd-125' }, now + 3 * 3600e3);
  assert(s.users.a.pts > p0 && !s.users.a.debt, 'settles proposed outcome');
  assert.throws(() => C.act(s, 'adm', 'propose', { id: 'mrt1', outcome: '__proto__' }, now), /bad_outcome/);
  // lookup + audited adjust
  const u = C.act(s, 'adm', 'users', { q: 'a' }, now).users.find(x => x.id === 'a'); assert(u);
  assert.throws(() => C.act(s, 'adm', 'adjust', { user: 'a', amount: 50, reason: 'x' }, now), /need_reason/);
  C.act(s, 'adm', 'adjust', { user: 'a', amount: 50, reason: 'bug #3 refund' }, now);
  assert(C.act(s, 'adm', 'inbox', {}, now).audit.some(x => x.action === 'adjust'));
  assert.throws(() => C.act(s, 'a', 'adjust', { user: 'a', amount: 50, reason: 'self service' }, now), /forbidden/);
  // daily templates (A0) and repeat
  s = C.seed(now); C.addUser(s, 'adm', 'Admin', now, { admin: true });
  assert(s.markets.filter(m => m.tpl).length === 3 && s.markets.every(m => m.closes > now), 'beta seed opens Q1-Q3, all open');
  assert(!Object.values(s.users).some(x => x.bot), 'no sample players outside the demo');
  const q2 = s.markets.find(m => m.tpl === 'q2');
  const r = C.act(s, 'adm', 'open', { repeat: q2.id, date: new Date(now + 3 * 864e5).toISOString().slice(0, 10), x: '14' }, now);
  const m2 = C.act(s, 'adm', 'market', { id: r.id }, now);
  assert(/above 14 °C/.test(m2.q.en) && /১৪ °C/.test(m2.q.bn) && m2.city === 'uk');
  assert.throws(() => C.act(s, 'adm', 'open', { tpl: 'q1', x: 'abc', date: '2026-12-01' }, now), /bad_threshold/);
  assert.throws(() => C.act(s, 'adm', 'open', { tpl: 'constructor', x: '1', date: '2026-12-01' }, now), /bad_template/);
  console.log('rival C ports / templates tests passed');
}
