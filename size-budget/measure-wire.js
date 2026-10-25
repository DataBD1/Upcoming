#!/usr/bin/env node
// Optional, NOT part of npm test: bytes over the wire for a first visit, measured by Chromium against a running server.
//   (cd dhk-predicts-features/app && PORT=8102 node server.js &)   then   NODE_PATH=$(npm root -g) node size-budget/measure-wire.js http://localhost:8102
// Page-level requests only (CDP on the page does not see service-worker fetches, so share.js/icon/manifest precache is not counted); /api/* is listed separately. Note server.js compresses at brotli q11, a CDN will send more.
'use strict';
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2] || 'http://localhost:' + (process.env.PORT || 8102);
  const b = await chromium.launch(), ctx = await b.newContext(), p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
  const rows = {};
  cdp.on('Network.responseReceived', e => { rows[e.requestId] = Object.assign(rows[e.requestId] || {}, { url: e.response.url, ce: e.response.headers['content-encoding'] || '-' }); });
  cdp.on('Network.loadingFinished', e => { rows[e.requestId] = Object.assign(rows[e.requestId] || {}, { enc: e.encodedDataLength }); });
  await p.goto(base + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); await b.close();
  let files = 0, api = 0;
  for (const r of Object.values(rows)) {
    if (!r.url || r.enc == null) continue;
    const isApi = new URL(r.url).pathname.startsWith('/api/'); if (isApi) api += r.enc; else files += r.enc;
    console.log(String(r.enc).padStart(7), r.ce.padEnd(5), r.url.replace(base, ''));
  }
  console.log('first visit, static files, page requests only: ' + (files / 1024).toFixed(1) + ' KB; api calls: ' + (api / 1024).toFixed(1) + ' KB (wire bytes incl. headers)');
})().catch(e => { console.error('measure-wire: ' + e.message); process.exit(2); });
