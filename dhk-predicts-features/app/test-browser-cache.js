'use strict';
// Optional (npm run test:browser): real Chromium. Proves per-user/admin caches are gone after logout and delete, and the CSV has a BOM.
// Needs Playwright: NODE_PATH=$(npm root -g) npm run test:browser
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8205, B = 'http://localhost:' + PORT;
const DATA = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dp-bc-')), 'data.json');
const srv = spawn('node', ['server.js'], { cwd: __dirname, env: { ...process.env, PORT, ADMIN_PHONES: '01711000000', DATA_FILE: DATA }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dpc = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.indexOf('dp-c:') === 0));
(async () => {
  await sleep(1000);
  const call = async (name, body, tok) => (await fetch(B + '/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) })).json();
  const t = (await call('auth', { mode: 'signup', phone: '01711000000', pin: 'secret12', name: 'বাংলা Admin', adult: true, consent: true })).token;
  const t2 = (await call('auth', { mode: 'signup', phone: '01811111111', pin: 'secret12', name: 'Rahim', adult: true, consent: true })).token;
  const browser = await chromium.launch(); const ctx = await browser.newContext({ acceptDownloads: true }); const page = await ctx.newPage();
  try {
    await page.addInitScript((tok) => { if (!localStorage.getItem('dp-token') && !sessionStorage.getItem('x')) localStorage.setItem('dp-token', tok); sessionStorage.setItem('x', '1'); }, t);
    await page.goto(B + '/#admin'); await page.waitForSelector('#auditcsv', { state: 'attached', timeout: 8000 });
    const keys = await dpc(page);
    assert.ok(!keys.some((k) => /auditall|inbox|metrics|users|account|:me|social/.test(k)), 'admin/per-user reads must not be cached: ' + keys);
    // seed a stale cache as an older build would have left it, then log out
    await page.evaluate(() => { localStorage.setItem('dp-c:auditall:{}', '{"audit":[1]}'); localStorage.setItem('dp-c:me:{}', '{"phone":"x"}'); });
    const dl = page.waitForEvent('download'); await page.evaluate(() => document.getElementById('auditcsv').click()); const d = await dl;
    const buf = fs.readFileSync(await d.path());
    assert.deepStrictEqual([...buf.slice(0, 3)], [0xEF, 0xBB, 0xBF], 'CSV starts with a UTF-8 BOM');
    assert.ok(buf.toString('utf8').includes('admin_uid'), 'CSV has admin_uid column');
    await page.goto(B + '/#me'); await page.waitForSelector('#logout', { state: 'attached', timeout: 8000 });
    await page.evaluate(() => document.getElementById('logout').click());
    await page.waitForFunction(() => !localStorage.getItem('dp-token'));
    assert.deepStrictEqual((await dpc(page)).filter((k) => /auditall|inbox|metrics|:me|account/.test(k)), [], 'no per-user caches after logout');
    // 401 path: a dead token clears caches too
    await page.evaluate(() => { localStorage.setItem('dp-c:inbox:{}', '{"x":1}'); localStorage.setItem('dp-token', 'dead'); });
    await page.goto(B + '/#account'); await page.reload(); await sleep(1500);
    assert.deepStrictEqual((await dpc(page)).filter((k) => /inbox/.test(k)), [], 'caches cleared on 401');
    console.log('browser cache tests: passed');
  } finally { await browser.close(); srv.kill(); }
})().catch((e) => { console.error(e); try { srv.kill(); } catch (_) {} process.exit(1); });
