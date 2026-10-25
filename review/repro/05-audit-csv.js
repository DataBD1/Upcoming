// Repro for review 05: drives the REAL public/app.js auditCsv() in headless Chromium, parses the CSV, probes access control and caches.
// Run: NODE_PATH=$(npm root -g) node 05-audit-csv.js
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const APP = '/home/user/upcoming/dhk-predicts-features/app', PORT = 8105, B = 'http://localhost:' + PORT;
const TMP = '/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/05';
const DATA = path.join(TMP, 'data.json'); try { fs.unlinkSync(DATA); } catch {}
const srv = spawn('node', ['server.js'], { cwd: APP, env: { ...process.env, PORT, ADMIN_PHONES: '01711000000,+12125550123', DATA_FILE: DATA }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(name, args, tok, method) {
  method = method || 'POST';
  const url = B + '/api/' + name + (method === 'GET' && args && Object.keys(args).length ? '?' + new URLSearchParams(args) : '');
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: method === 'POST' ? JSON.stringify(args || {}) : undefined });
  return [r.status, await r.json().catch(() => null), r];
}
const signup = async (phone, name) => (await call('auth', { mode: 'signup', phone, pin: 'secret12', name, adult: true, consent: true }))[1].token;
function parseCsv(t) { const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows; }
(async () => {
  await sleep(800);
  const out = {}; const log = (k, v) => { out[k] = v; console.log(k.padEnd(34), typeof v === 'string' ? v : JSON.stringify(v)); };
  const adm = await signup('01711000000', 'Admin1'), adm2 = await signup('+12125550123', 'Admin2'), player = await signup('01811111111', 'Rahim');
  const me = (await call('home', {}, player, 'GET'))[1].me, pid = me.id;
  // ---- access control
  log('auditall guest GET', (await call('auditall', {}, null, 'GET')).slice(0, 2));
  log('auditall player GET', (await call('auditall', {}, player, 'GET')).slice(0, 2));
  log('auditall admin GET', (await call('auditall', {}, adm, 'GET'))[0]);
  log('auditall admin POST', (await call('auditall', {}, adm, 'POST'))[0]);
  const r = (await call('auditall', {}, adm, 'GET'))[2]; log('auditall Cache-Control', r.headers.get('cache-control'));
  // forged/stale token -> ?
  log('auditall bogus token', (await call('auditall', {}, 'nope', 'GET')).slice(0, 2));
  // ---- nasty names + args
  const names = ['=1+1', '+1+1', '-2+3', '@SUM(1,1)', '\t=1+1', '\r=1+1', ' =1+1', '\n=1+1', "'=1+1", '＝1+1', '=HYPERLINK("http://e.x","c")', 'বাংলা,"নাম"'];
  for (const n of names) {
    await call('rename', { name: n }, adm);
    await call('adjust', { user: pid, amount: 1, reason: 'বাংলা reason, "quoted"\n=cmd|\' /C calc\'!A0 ok ' + n }, adm);
  }
  await call('rename', { name: 'Admin1' }, adm);
  await call('adjust', { user: pid, amount: '=1+1x', reason: 'raw amount ' }, adm); // 400 expected
  await call('sponsor', { en: '=SUM(1)', url: 'https://a.b/?x=1,2' }, adm);
  // ---- real browser CSV
  const br = await chromium.launch(); const ctx = await br.newContext({ acceptDownloads: true }); const pg = await ctx.newPage();
  await pg.addInitScript(t => localStorage.setItem('dp-token', t), adm);
  await pg.goto(B + '/#admin'); await pg.waitForSelector('#auditcsv', { state: 'attached' });
  await pg.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); });
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#auditcsv')]);
  const file = path.join(TMP, 'audit.csv'); await dl.saveAs(file);
  const buf = fs.readFileSync(file); log('csv bytes / BOM', { bytes: buf.length, bom: buf[0] === 0xEF && buf[1] === 0xBB });
  const text = buf.toString('utf8'); const rows = parseCsv(text);
  log('csv rows (incl header)', rows.length);
  const dangerous = rows.filter(r => /^[=+\-@\t\r]/.test(r[1] || '') || /^[=+\-@\t\r]/.test(r[3] || '') || /^[=+\-@\t\r]/.test(r[2] || ''));
  log('cells STILL starting with formula char', dangerous.map(r => r[1]));
  log('name cells (as Excel would read)', rows.slice(1).map(r => JSON.stringify(r[1])).slice(0, 14));
  const trimmedStart = rows.slice(1).filter(r => /^\s+[=+\-@]/.test(r[1])).map(r => JSON.stringify(r[1])); log('leading-space/newline then formula', trimmedStart);
  log('apostrophe visible in cell (data corrupted)', rows.slice(1).filter(r => r[1].startsWith("'")).map(r => r[1]));
  log('raw (unsliced) amount kept?', rows.filter(r => /1\+1x/.test(r[3])).length);
  // Excel w/o BOM reads as cp1252: show mojibake for Bangla
  const bn = rows.find(r => /বাংলা/.test(r[3])); log('as cp1252 (Excel w/o BOM)', buf.toString('latin1').split('\n').find(l => l.includes('reason')).slice(60, 190));
  log('details col is JSON (starts {)', rows.slice(1).every(r => r[3][0] === '{'));
  log('uid column present?', rows[0].join('|'));
  // ---- localStorage after logout
  await pg.evaluate(() => document.getElementById('logout') && 0);
  await pg.goto(B + '/#me'); await pg.waitForTimeout(600);
  const hasLogout = await pg.$('#logout');
  if (hasLogout) { await hasLogout.click(); await pg.waitForTimeout(500); }
  const ls = await pg.evaluate(() => Object.keys(localStorage).map(k => [k, localStorage.getItem(k).length]));
  log('localStorage after logout', ls);
  const aud = await pg.evaluate(() => { const k = Object.keys(localStorage).find(k => k.startsWith('dp-c:auditall')); return k ? localStorage.getItem(k).slice(0, 160) : null; });
  log('auditall plaintext after logout', aud);
  const cached = await pg.evaluate(() => Object.keys(localStorage).filter(k => /dp-c:(inbox|auditall|users|metrics)/.test(k)));
  log('admin caches left after logout', cached);
  // offline as nobody -> auditall served from cache?
  await ctx.setOffline(true);
  const off = await pg.evaluate(async () => { try { const t = localStorage.getItem('dp-c:auditall:{}'); return t ? 'cached copy readable by any script/user on this browser: ' + JSON.parse(t).audit.length + ' entries' : 'none'; } catch (e) { return String(e); } });
  log('offline readback', off);
  await br.close();
  // ---- scale: 5000 entries
  const st = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const big = []; for (let i = 0; i < 5000; i++) big.push({ at: Date.now() - i * 1e3, by: 'x', name: 'Admin1', action: 'adjust', args: { user: 'u' + i, amount: 50, reason: 'x'.repeat(190) } });
  st.audit = big; fs.writeFileSync(DATA, JSON.stringify(st));
  srv.kill(); await sleep(300);
  const srv2 = spawn('node', ['server.js'], { cwd: APP, env: { ...process.env, PORT, ADMIN_PHONES: '01711000000,+12125550123', DATA_FILE: DATA }, stdio: 'ignore' }); await sleep(800);
  const adm3 = (await call('auth', { mode: 'login', phone: '01711000000', pin: 'secret12' }))[1].token; const t0 = Date.now(); const rr = await fetch(B + '/api/auditall', { headers: { Authorization: 'Bearer ' + adm3, 'Accept-Encoding': 'gzip' } }); const body = await rr.text();
  log('5000 entries auditall', { status: rr.status, bytes: body.length, ms: Date.now() - t0, enc: rr.headers.get('content-encoding') });
  const inbox = await (await fetch(B + '/api/inbox', { headers: { Authorization: 'Bearer ' + adm3 } })).text(); log('inbox bytes (50 shown)', inbox.length);
  log('cache size if stored in localStorage (chars, quota ~5M)', body.length);
  srv2.kill();
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
