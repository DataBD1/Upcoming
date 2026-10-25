#!/usr/bin/env node
// Checks that two language dictionaries inside a JS file have the same keys, no empty values and the same {placeholders}.
//   node index.js public/app.js "var T = " bn en
// It takes the object literal after the marker (`{ bn: {...}, en: {...} }`), so it works on browser files that cannot be require()d.
'use strict';
const fs = require('fs'), vm = require('vm');

// Source text of the `{ ... }` after `marker`, found by walking braces and skipping quoted strings.
function literalAfter(src, marker) {
  let i = src.indexOf(marker); if (i < 0) throw new Error('marker not found: ' + marker);
  i = src.indexOf('{', i);
  let depth = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error('unbalanced braces after ' + marker);
}
// Returns a list of problem strings (empty = fine). The literal is evaluated in an empty sandbox, so it must be plain data.
function check(src, marker, a, b) {
  const T = vm.runInNewContext('(' + literalAfter(src, marker) + ')', {}, { timeout: 1000 });
  if (!T[a] || !T[b]) throw new Error('need both "' + a + '" and "' + b + '" in the dictionary');
  const bad = [], ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  for (const k of Object.keys(T[b])) if (!(k in T[a])) bad.push('in ' + b + ' but not ' + a + ': ' + k);
  for (const k of Object.keys(T[a])) if (!(k in T[b])) bad.push('in ' + a + ' but not ' + b + ': ' + k);
  for (const l of [a, b]) for (const k of Object.keys(T[l])) if (!String(T[l][k]).trim()) bad.push('empty: ' + l + '.' + k);
  for (const k of Object.keys(T[a])) if (k in T[b] && typeof T[a][k] === 'string' && typeof T[b][k] === 'string' && ph(T[a][k]) !== ph(T[b][k])) bad.push('placeholders differ: ' + k);
  return bad;
}
module.exports = { check, literalAfter };

if (require.main === module) {
  const [file, marker, a, b] = process.argv.slice(2);
  if (!file || !marker || !a || !b) { console.error('usage: node index.js <file> "<marker>" <lang1> <lang2>'); process.exit(2); }
  const bad = check(fs.readFileSync(file, 'utf8'), marker, a, b);
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  console.log('i18n parity passed');
}
