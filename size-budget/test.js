const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { check } = require('./index.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
fs.writeFileSync(path.join(dir, 'a.js'), 'x'.repeat(10)); fs.writeFileSync(path.join(dir, 'b.js'), Array.from({ length: 4000 }, (_, i) => Math.random().toString(36) + i).join(''));
let r = check({ files: { 'a.js': 1, 'b.js': 100 }, total: 100 }, dir); assert.equal(r.failed, 0);
r = check({ files: { 'a.js': 1, 'b.js': 1 }, total: 100 }, dir); assert.equal(r.failed, 1, 'one file over');
r = check({ files: { 'a.js': 1, 'b.js': 100 }, total: 1 }, dir); assert.equal(r.failed, 1, 'total over');
r = check({ files: { 'a.js': 1, 'b.js': 100 }, total: 1, excludeFromTotal: ['b.js'] }, dir); assert.equal(r.failed, 0, 'excluded from total');
assert.throws(() => check({ files: { 'missing.js': 1 } }, dir));
console.log('size-budget tests passed');
