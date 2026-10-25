#!/usr/bin/env node
// Fails when a shipped file grows past its brotli budget. Config: size-budget.json (or the path given as argv[2]):
//   { "files": { "public/app.js": 26, "core.js": 15 }, "total": 46, "excludeFromTotal": ["public/share.js"] }
// Sizes are in KB. Raise a budget on purpose, in a commit that says why.
'use strict';
const fs = require('fs'), zlib = require('zlib'), path = require('path');

function brotliKb(file) {
  return zlib.brotliCompressSync(fs.readFileSync(file), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length / 1024;
}
// Returns { rows: [{file, kb, max, over}], total, totalMax, failed }.
function check(config, root) {
  const skip = new Set(config.excludeFromTotal || []);
  const rows = Object.entries(config.files).map(([f, max]) => { const kb = brotliKb(path.join(root, f)); return { file: f, kb, max, over: kb > max }; });
  const total = rows.filter(r => !skip.has(r.file)).reduce((a, r) => a + r.kb, 0);
  const totalMax = config.total == null ? null : config.total;
  const failed = rows.filter(r => r.over).length + (totalMax != null && total > totalMax ? 1 : 0);
  return { rows, total, totalMax, failed };
}
module.exports = { check, brotliKb };

if (require.main === module) {
  const cfgPath = path.resolve(process.argv[2] || 'size-budget.json');
  const r = check(JSON.parse(fs.readFileSync(cfgPath, 'utf8')), path.dirname(cfgPath));
  for (const x of r.rows) console.log((x.over ? 'OVER ' : 'ok   ') + x.file.padEnd(24) + x.kb.toFixed(1).padStart(6) + ' KB / ' + x.max + ' KB');
  if (r.totalMax != null) console.log((r.total > r.totalMax ? 'OVER ' : 'ok   ') + 'total'.padEnd(24) + r.total.toFixed(1).padStart(6) + ' KB / ' + r.totalMax + ' KB');
  if (r.failed) { console.error(r.failed + ' size budget(s) exceeded'); process.exit(1); }
}
