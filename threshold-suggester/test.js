const assert = require('assert'), { suggestThreshold } = require('./index.js');
let t = suggestThreshold([122.1, 122.4, 122.5, 122.8, 123.0, 122.6, 122.9], 'above');
assert(t.chance >= 30 && t.chance <= 70 && t.threshold >= 122.1 && t.threshold <= 123.0);
t = suggestThreshold([-3, -1, 0, 2, 1, 4, 0], 'below'); assert(t.chance >= 30 && t.chance <= 70);
assert.throws(() => suggestThreshold([1, 2, 3], 'above'), /at least 5/);
assert.throws(() => suggestThreshold([5, 5, 5, 5, 5, 5], 'above'), /no threshold/);
assert(suggestThreshold(['13', '12', '14', '15', '11'], 'above').chance >= 30);
console.log('threshold tests passed');
