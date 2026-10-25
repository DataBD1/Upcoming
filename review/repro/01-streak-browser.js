// NODE_PATH=$(npm root -g) node 01-streak-browser.js   (starts its own server on :8101)
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs');
const APP = '/home/user/upcoming/dhk-predicts-features/app'; const dir = '/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/01'; fs.mkdirSync(dir, { recursive: true });
try { fs.unlinkSync(dir + '/data.json'); } catch (e) {}
const srv = spawn('node', ['server.js'], { cwd: APP, env: { ...process.env, PORT: '8101', DATA_FILE: dir + '/data.json', ADMIN_PHONES: '01711000000' }, stdio: 'ignore' });
(async () => {
  await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto('http://localhost:8101/#groups'); await p.waitForTimeout(800);
  console.log('logged-out groups page shows login form:', await p.locator('input[type=password], input[type=tel], form').count() > 0);
  // sign up through API and inject token
  const r = await (await fetch('http://localhost:8101/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'signup', phone: '01811111111', pin: 'secret12', name: 'Alice', adult: true, consent: true }) })).json();
  await p.evaluate(t => { localStorage.setItem('dp-token', t); localStorage.setItem('dp-lang', 'bn'); }, r.token);
  await p.goto('http://localhost:8101/#groups'); await p.reload(); await p.waitForTimeout(1000);
  console.log('card text (bn):', (await p.locator('.card').first().innerText()).replace(/\n/g, ' | '));
  console.log('cached keys:', await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dp-c:'))));
  // logout from profile
  await p.evaluate(() => { location.hash = 'me'; }); await p.waitForTimeout(500);
  const lo = p.locator('#logout'); if (await lo.count()) { await lo.click(); await p.waitForTimeout(500); }
  console.log('after logout, token:', await p.evaluate(() => localStorage.getItem('dp-token')), 'cached keys still:', await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dp-c:'))));
  // log in as nobody, go offline, open groups -> stale copy of previous account?
  await ctx.setOffline(true);
  await ctx.setOffline(false);
  const r2 = await (await fetch('http://localhost:8101/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'signup', phone: '01822222222', pin: 'secret12', name: 'Bob', adult: true, consent: true }) })).json();
  const rA = await (await fetch('http://localhost:8101/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'login', phone: '01811111111', pin: 'secret12' }) })).json(); r.token = rA.token;
  // Alice makes a group first so her cached copy holds names
  await p.evaluate(t => localStorage.setItem('dp-token', t), r.token);
  await fetch('http://localhost:8101/api/gcreate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + r.token }, body: JSON.stringify({ name: 'AliceSecretGroup' }) });
  await p.goto('http://localhost:8101/#groups'); await p.reload(); await p.waitForTimeout(800); // caches Alice's social
  console.log('Alice cache has group:', await p.evaluate(() => (localStorage.getItem('dp-c:social:{}')||'').includes('AliceSecretGroup')));
  await p.evaluate(t => localStorage.setItem('dp-token', t), r2.token); // Bob logs in on the same browser
  await p.evaluate(() => { location.hash = 'home'; }); await p.reload(); await p.waitForTimeout(800);
  await p.route('**/api/**', r => r.abort()); // network drops after Bob logs in
  await p.evaluate(() => { location.hash = 'groups'; }); await p.waitForTimeout(1000);
  const txt = await p.locator('body').innerText();
  console.log('cache has group name:', await p.evaluate(() => (localStorage.getItem('dp-c:social:{}')||'').includes('AliceSecretGroup')), '| BODY:', txt.slice(0,250).replace(/\n/g,' / '));
  console.log("Bob offline on Alice's browser sees AliceSecretGroup:", txt.includes('AliceSecretGroup'));
  await b.close();
})().finally(() => { srv.kill(); });
