// Review 05: PII left in audit log / localStorage after account deletion (A31) and logout. Run: NODE_PATH=$(npm root -g) node 05-audit-pii.js
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const APP = '/home/user/upcoming/dhk-predicts-features/app', PORT = 8105, B = 'http://localhost:' + PORT;
const TMP = '/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/05'; const DATA = path.join(TMP, 'pii.json'); try { fs.unlinkSync(DATA); } catch {}
const srv = spawn('node', ['server.js'], { cwd: APP, env: { ...process.env, PORT, ADMIN_PHONES: '01711000000,+12125550123', DATA_FILE: DATA }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(name, args, tok) { const r = await fetch(B + '/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(args || {}) }); return [r.status, await r.json().catch(() => null)]; }
const signup = async (phone, name) => (await call('auth', { mode: 'signup', phone, pin: 'secret12', name, adult: true, consent: true }))[1].token;
(async () => {
  await sleep(800);
  const adm = await signup('01711000000', 'Karim'), tok = await signup('01822222222', 'Rahim Uddin');
  const pid = (await (await fetch(B + '/api/home', { headers: { Authorization: 'Bearer ' + tok } })).json()).me.id;
  await call('adjust', { user: pid, amount: 25, reason: 'Rahim Uddin 01822222222 emailed support: lost points' }, adm);
  // player deletes account through the real UI path (API) after browsing in a browser so caches exist
  const br = await chromium.launch(); const pg = await (await br.newContext()).newPage();
  await pg.addInitScript(t => localStorage.setItem('dp-token', t), tok);
  await pg.goto(B + '/#me'); await pg.waitForTimeout(800); await pg.goto(B + '/#account'); await pg.waitForTimeout(800);
  console.log('player localStorage keys before delete:', await pg.evaluate(() => Object.keys(localStorage)));
  console.log('delete ->', (await call('delete', { pin: 'secret12' }, tok)));
  await pg.reload(); await pg.waitForTimeout(500);
  const left = await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dp-c:')).map(k => [k, /01822222222|Rahim/.test(localStorage.getItem(k))]));
  console.log('after delete, dp-c caches still holding phone/name (key, hit):', JSON.stringify(left));
  await br.close();
  await sleep(500);
  const st = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  console.log('server audit after A31 delete:', JSON.stringify(st.audit.filter(x => x.action === 'adjust')));
  console.log('audit mentions phone/name still:', /01822222222|Rahim Uddin/.test(JSON.stringify(st.audit)));
  // not-audited actions
  const before = st.audit.length;
  await call('chphone', { pin: 'secret12', phone: '01933333333' }, adm); await call('rename', { name: 'Karim2' }, adm);
  await call('feedback', { text: 'hi there' }, adm);
  const st2 = JSON.parse(fs.readFileSync(DATA, 'utf8')); await sleep(400);
  const st3 = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  console.log('audit entries added by chphone+rename+feedback+login by admin:', st3.audit.length - before, '(admin phone change/rename/login are unlogged)');
  console.log('admin flag after chphone to non-ADMIN_PHONES number:', JSON.stringify(Object.values(st3.users).filter(u => u.name.startsWith('Karim')).map(u => !!u.admin)));
  srv.kill();
})().catch(e => { console.error(e); srv.kill(); });
