// Run from rival-a/: node regression-test.js  (move into test-api.js once it passes)
'use strict';
const assert = require('assert');
const Core = require('./core.js'), { handleApi } = require('./lib/handler.js');
const s = Core.seed(Date.now(), { set: 'dhaka' });
s.auth = { '+8801711000000': { uid: 'u1', salt: 'SALT_MARKER', hash: 'HASH_MARKER' } };
s.sessions = { SESSION_MARKER: 'u1' };
const store = { read: async () => s, transact: async (f) => f(structuredClone(s)) };
const names = [...Object.getOwnPropertyNames(Object.prototype), 'prototype', '__proto__', 'then', 'auth', 'sessions', 'attempts', '../auth', 'constructor/x', ''];
(async () => {
  const bad = [];
  for (const name of names) for (const method of ['GET', 'POST']) for (const token of ['', 'bogus']) {
    const [st, body] = await handleApi(store, { method, name, body: {}, token, ua: 't' });
    const j = JSON.stringify(body) || '';
    if (/SALT_MARKER|HASH_MARKER|SESSION_MARKER/.test(j) || st === 200 || st >= 500) bad.push(`${method} /api/${name} -> ${st} ${j.slice(0, 50)}`);
  }
  assert.deepStrictEqual(bad, [], 'unsafe responses:\n' + bad.join('\n'));
  console.log('prototype-name regression: passed');
})().catch((e) => { console.error(e.message); process.exit(1); });
