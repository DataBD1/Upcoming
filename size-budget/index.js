#!/usr/bin/env node
// Fails when a shipped file (or a group of files) grows past its brotli budget. Config: size-budget.json (or argv[2]):
//   { "quality": 5,
//     "files":  { "public/app.js": 29.6, "core.js": 16.8 },
//     "groups": { "critical path": { "files": ["public/app.js", "core.js"], "max": 47 } } }
// Sizes are KB (1024 bytes) of brotli output at `quality` (default 5, closer to what CDNs use than q11).
// List only files that browsers really download. Raise a budget on purpose, in a commit that says why.
// Exit codes: 0 ok, 1 over budget, 2 bad config or missing file.
'use strict';
const fs = require('fs'), zlib = require('zlib'), path = require('path');

class ConfigError extends Error {}
const DEFAULT_QUALITY = 5;

function brotliKb(file, quality) {
  const q = quality == null ? DEFAULT_QUALITY : quality;
  return zlib.brotliCompressSync(fs.readFileSync(file), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q } }).length / 1024;
}
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const goodNum = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Throws ConfigError with a one-line message. Returns the normalised config.
function validate(config, root) {
  if (!isObj(config)) throw new ConfigError('config must be a JSON object');
  for (const k of Object.keys(config)) if (!['quality', 'files', 'groups'].includes(k)) throw new ConfigError('unknown config key "' + k + '"');
  let quality = DEFAULT_QUALITY;
  if (config.quality !== undefined) {
    if (!Number.isInteger(config.quality) || config.quality < 0 || config.quality > 11) throw new ConfigError('"quality" must be an integer 0-11');
    quality = config.quality;
  }
  if (!isObj(config.files) || !Object.keys(config.files).length) throw new ConfigError('"files" must be a non-empty object');
  const files = [], seen = new Map();
  for (const [f, max] of Object.entries(config.files)) {
    if (!goodNum(max)) throw new ConfigError('budget for "' + f + '" must be a number > 0');
    const abs = path.resolve(root, f);
    if (seen.has(abs)) throw new ConfigError('"' + f + '" and "' + seen.get(abs) + '" are the same file');
    seen.set(abs, f);
    let st;
    try { st = fs.statSync(abs); } catch (e) { throw new ConfigError('cannot read ' + f + ' (' + (e.code || e.message) + ')'); }
    if (!st.isFile()) throw new ConfigError(f + ' is not a regular file');
    files.push({ file: f, abs, max });
  }
  const groups = [];
  if (config.groups !== undefined) {
    if (!isObj(config.groups)) throw new ConfigError('"groups" must be an object');
    for (const [name, g] of Object.entries(config.groups)) {
      if (!isObj(g)) throw new ConfigError('group "' + name + '" must be an object');
      if (!goodNum(g.max)) throw new ConfigError('group "' + name + '" max must be a number > 0');
      if (!Array.isArray(g.files) || !g.files.length) throw new ConfigError('group "' + name + '" files must be a non-empty array');
      const members = new Set();
      for (const f of g.files) {
        if (typeof f !== 'string' || !(f in config.files)) throw new ConfigError('group "' + name + '" lists "' + f + '" which is not in "files"');
        members.add(f);
      }
      groups.push({ name, files: [...members], max: g.max });
    }
  }
  return { quality, files, groups };
}

// Returns { quality, rows: [{file, kb, kb11, max, over}], groups: [{name, kb, kb11, max, over}], failed }.
function check(config, root) {
  const c = validate(config, root);
  const rows = c.files.map(x => ({ file: x.file, kb: brotliKb(x.abs, c.quality), kb11: brotliKb(x.abs, 11), max: x.max }));
  for (const r of rows) r.over = r.kb > r.max;
  const by = new Map(rows.map(r => [r.file, r]));
  const groups = c.groups.map(g => {
    const kb = g.files.reduce((a, f) => a + by.get(f).kb, 0), kb11 = g.files.reduce((a, f) => a + by.get(f).kb11, 0);
    return { name: g.name, kb, kb11, max: g.max, over: kb > g.max };
  });
  const failed = rows.filter(r => r.over).length + groups.filter(g => g.over).length;
  return { quality: c.quality, rows, groups, failed };
}
module.exports = { check, validate, brotliKb, ConfigError };

if (require.main === module) {
  try {
    const cfgPath = path.resolve(process.argv[2] || 'size-budget.json');
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) { throw new ConfigError('cannot read config ' + process.argv[2] + ' (' + (e.code || e.message) + ')'); }
    const r = check(cfg, path.dirname(cfgPath));
    console.log('brotli quality ' + r.quality + ' (q11 shown for reference)');
    const line = (over, name, kb, kb11, max) => (over ? 'OVER ' : 'ok   ') + name.padEnd(26) + kb.toFixed(1).padStart(6) + ' KB / ' + max + ' KB   (q11 ' + kb11.toFixed(1) + ')';
    for (const x of r.rows) console.log(line(x.over, x.file, x.kb, x.kb11, x.max));
    for (const g of r.groups) console.log(line(g.over, g.name, g.kb, g.kb11, g.max));
    if (r.failed) { console.error('size-budget: ' + r.failed + ' budget(s) exceeded'); process.exit(1); }
  } catch (e) {
    if (e instanceof ConfigError) { console.error('size-budget: ' + e.message); process.exit(2); }
    throw e;
  }
}
