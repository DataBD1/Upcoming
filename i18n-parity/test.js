const assert = require('assert'), { check } = require('./index.js');
const ok = "var x = 1; var T = { bn: { a: 'এক {n}', b: 'দুই \\'}\\'' }, en: { a: 'one {n}', b: 'two' } }; var y = {};";
assert.deepEqual(check(ok, 'var T = ', 'bn', 'en'), []);
const bad = "var T = { bn: { a: 'x', only_bn: 'y', e: '' }, en: { a: 'x', only_en: 'z', e: 'q' } };";
const r = check(bad, 'var T = ', 'bn', 'en');
assert(r.some(x => x.includes('only_bn')) && r.some(x => x.includes('only_en')) && r.some(x => x.includes('empty: bn.e')));
assert(check("var T = { bn: { a: '{n}' }, en: { a: '{m}' } };", 'var T = ', 'bn', 'en')[0].startsWith('placeholders differ'));
assert.throws(() => check('var Q = {}', 'var T = ', 'bn', 'en'), /marker not found/);
console.log('i18n-parity tests passed');
