const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const { check, ConfigError } = require('./index.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
fs.writeFileSync(path.join(dir, 'a.js'), 'x'.repeat(10));
fs.writeFileSync(path.join(dir, 'b.js'), Array.from({ length: 4000 }, (_, i) => Math.random().toString(36) + i).join(''));
fs.mkdirSync(path.join(dir, 'sub'));
const grp = (max, files) => ({ g: { files: files || ['a.js', 'b.js'], max } });
let r = check({ files: { 'a.js': 1, 'b.js': 100 }, groups: grp(100) }, dir); assert.equal(r.failed, 0); assert.equal(r.quality, 5);
r = check({ files: { 'a.js': 1, 'b.js': 1 } }, dir); assert.equal(r.failed, 1, 'one file over');
r = check({ files: { 'a.js': 1, 'b.js': 100 }, groups: grp(1) }, dir); assert.equal(r.failed, 1, 'group over');
r = check({ files: { 'a.js': 1, 'b.js': 100 }, groups: grp(1, ['a.js']) }, dir); assert.equal(r.failed, 0, 'group only counts its members');
// quality is configurable and q11 is reported
const q1 = check({ files: { 'b.js': 100 }, quality: 1 }, dir), q11 = check({ files: { 'b.js': 100 }, quality: 11 }, dir);
assert.equal(q1.quality, 1); assert.ok(q1.rows[0].kb > q11.rows[0].kb, 'lower quality is bigger');
assert.equal(q1.rows[0].kb11, q11.rows[0].kb); assert.equal(q11.rows[0].kb, q11.rows[0].kb11);
// strict validation: each of these must throw ConfigError
const bad = {
  'string budget': { files: { 'a.js': 'abc' } }, 'zero budget': { files: { 'a.js': 0 } }, 'negative budget': { files: { 'a.js': -1 } },
  'null budget': { files: { 'a.js': null } }, 'NaN-ish budget': { files: { 'a.js': 1e999 } }, 'empty files': { files: {} }, 'no files': {},
  'files array': { files: ['a.js'] }, 'not an object': [], 'null config': null, 'unknown key': { files: { 'a.js': 1 }, total: 5 },
  'bad quality': { files: { 'a.js': 1 }, quality: 12 }, 'float quality': { files: { 'a.js': 1 }, quality: 4.5 },
  'missing file': { files: { 'missing.js': 1 } }, 'directory': { files: { sub: 1 } },
  'same file twice': { files: { 'a.js': 1, './a.js': 1 } },
  'group string max': { files: { 'a.js': 1 }, groups: grp('x', ['a.js']) }, 'group zero max': { files: { 'a.js': 1 }, groups: grp(0, ['a.js']) },
  'group empty files': { files: { 'a.js': 1 }, groups: grp(5, []) }, 'group typo member': { files: { 'a.js': 1 }, groups: grp(5, ['c.js']) },
  'groups array': { files: { 'a.js': 1 }, groups: [] },
};
for (const [name, cfg] of Object.entries(bad)) assert.throws(() => check(cfg, dir), ConfigError, name);
// CLI exit codes and one-line errors
const run = cfg => { const p = path.join(dir, 'cfg.json'); fs.writeFileSync(p, typeof cfg === 'string' ? cfg : JSON.stringify(cfg)); return spawnSync(process.execPath, [path.join(__dirname, 'index.js'), p], { encoding: 'utf8' }); };
let p = run({ files: { 'a.js': 1 } }); assert.equal(p.status, 0); assert.match(p.stdout, /q11/);
p = run({ files: { 'a.js': 0.001 } }); assert.equal(p.status, 1, 'over budget is 1'); assert.match(p.stderr, /exceeded/);
for (const cfg of [{ files: { 'a.js': 'abc' } }, { files: {} }, { files: { 'nope.js': 1 } }, { files: { sub: 1 } }, '{bad json', '[]']) {
  p = run(cfg); assert.equal(p.status, 2, JSON.stringify(cfg)); assert.equal(p.stderr.trim().split('\n').length, 1, 'one-line error'); assert.ok(!/\n\s+at /.test(p.stderr), 'no stack trace');
}
p = spawnSync(process.execPath, [path.join(__dirname, 'index.js'), path.join(dir, 'no-such.json')], { encoding: 'utf8' }); assert.equal(p.status, 2); assert.match(p.stderr, /^size-budget: cannot read config/);
console.log('size-budget tests passed');
