// Real first-load bytes via Playwright vs size-budget claim; also brotli quality/gzip sweep.
const { chromium } = require('playwright'); const zlib = require('zlib'), fs = require('fs'), path = require('path');
const APP = '/home/user/upcoming/dhk-predicts-features/app';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
  const rows = {}; cdp.on('Network.loadingFinished', e => { rows[e.requestId] = rows[e.requestId] || {}; rows[e.requestId].enc = e.encodedDataLength; });
  cdp.on('Network.responseReceived', e => { rows[e.requestId] = Object.assign(rows[e.requestId] || {}, { url: e.response.url, status: e.response.status, ce: e.response.headers['content-encoding'], fromSW: e.response.fromServiceWorker }); });
  await p.goto('http://localhost:8102/', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  let tot = 0, totNoApi = 0; for (const r of Object.values(rows)) { if (!r.url) continue; console.log(String(r.enc).padStart(7), r.status, r.ce || '-', r.fromSW ? 'SW' : '', r.url.replace('http://localhost:8102','')); tot += r.enc || 0; }
  console.log('TOTAL wire bytes (incl. headers, SW precache, api):', (tot / 1024).toFixed(1), 'KB');
  await b.close();
  const files = ['public/index.html','public/app.css','core.js','social.js','public/app.js','public/share.js','public/icon.svg','public/manifest.webmanifest','public/sw.js'];
  console.log('\nfile                         raw   br11   br5    br4   gzip9  gzip6');
  const sum = { br11:0, br5:0, br4:0, gz9:0, gz6:0 }; const inPage = ['public/index.html','public/app.css','core.js','public/app.js'];
  for (const f of files) { const d = fs.readFileSync(path.join(APP, f)); const q = n => zlib.brotliCompressSync(d, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: n } }).length;
    const v = { br11:q(11), br5:q(5), br4:q(4), gz9: zlib.gzipSync(d,{level:9}).length, gz6: zlib.gzipSync(d,{level:6}).length };
    console.log(f.padEnd(28), String(d.length).padStart(6), ...Object.values(v).map(x => String((x/1024).toFixed(1)).padStart(6)));
    if (inPage.includes(f)) for (const k in sum) sum[k]+=v[k]; }
  console.log('critical path (html+css+core+app):', Object.entries(sum).map(([k,v])=>k+'='+(v/1024).toFixed(1)).join(' '));
})();
