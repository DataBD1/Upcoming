// Sequential cost of single operations on ONE server copy (no concurrency, no simulated latency) for a seeded key.  node 10-ops.js n100000
const APP = '/home/user/upcoming/dhk-predicts-features/app', key = process.argv[2];
const { createStore } = require(APP + '/lib/pgstore.js'), H = require(APP + '/lib/handler.js');
(async () => {
  process.env.ADMIN_PHONES = '01711000000';
  const s = createStore({ url: 'postgres://t:t@localhost:54410/postgres', key, seed: () => ({}) });
  const call = (name, body, token, method = 'POST') => H.handleApi(s, { method, name, body: body || {}, token, ua: 'x', country: 'GB', ip: '1.1.1.1' });
  const T = async (label, f, n = 5) => { const a = []; for (let i = 0; i < n; i++) { const t = process.hrtime.bigint(); await f(i); a.push(Number(process.hrtime.bigint() - t) / 1e6); } a.sort((x, y) => x - y); console.log(label.padEnd(34), 'median', a[a.length >> 1].toFixed(1).padStart(8), 'ms  max', a[a.length - 1].toFixed(1).padStart(8), 'ms'); };
  await s.read();
  const tok = (await call('auth', { mode: 'signup', phone: '+44790' + String(process.pid).padStart(7, '0'), pin: 'secret12', name: 'Ops', adult: true, consent: true }))[1].token;
  const open = (await call('home', {}, null, 'GET'))[1].markets.find(m => m.status === 'open').id;
  await T('home (guest)', () => call('home', {}, null, 'GET'));
  await T('leaders (all players ranked)', () => call('leaders', {}, tok, 'GET'));
  await T('league week (all players)', () => call('league', { kind: 'week' }, tok, 'GET'));
  await T('buy', () => call('buy', { id: open, side: 'y', amount: 1 }, tok));
  await T('feedback', i => call('feedback', { text: 'x' + i }, tok));
  await T('login (scrypt inside the write lock)', () => call('auth', { mode: 'login', phone: '+44790' + String(process.pid).padStart(7, '0'), pin: 'secret12' }), 3);
  await s.transact(d => { d.week = { id: '2000-01-02' }; });
  await T('FIRST write of a new week (roll)', () => call('buy', { id: open, side: 'n', amount: 1 }, tok), 1);
  await T('refused write right after (bonus_taken)', () => call('bonus', {}, tok), 1);
  await s.transact(d => { d.week = { id: '2000-01-02' }; });
  await T('REFUSED first write of week', () => call('bonus', {}, tok), 3);
  await s.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
