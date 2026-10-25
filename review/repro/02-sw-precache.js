// Does first visit download share.js/icon.svg/manifest via SW precache? (not counted by size-budget total)
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage(); const seen = [];
  ctx.on('requestfinished', async r => { const s = await r.sizes().catch(()=>null); seen.push([r.url().replace('http://localhost:8102',''), s && s.responseBodySize, r.serviceWorker() ? 'SW' : '']); });
  await p.goto('http://localhost:8102/', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  console.log(seen.map(x => x.join('  ')).join('\n')); await b.close(); })();
