#!/usr/bin/env node
// Checks two language dictionaries inside a browser JS file. It NEVER executes the file: the dictionary literal is read by a small
// parser that accepts only data (objects, arrays, strings, numbers, true/false/null, comments) and refuses anything else.
//
//   node index.js public/app.js "var T = " bn en [options]
//
// Options (all optional):
//   --used-in <file[,file]>      keys used as t('key') / t("key") in these files must exist in BOTH languages
//   --codes-in <file[,file]>     server error codes found as code('x') / err('x') need an `e_x` key in both languages
//   --codes-warn                 report missing e_<code> keys as warnings instead of problems
//   --code-prefix <p>            prefix for error keys (default e_)
//   --array-marker <marker>      (repeatable) also compare a section structure like `var PRIVACY = { en: {sections:[[title,[para..]]..]}, bn: ... }`
//   --allow-same <k1,k2>         keys whose value may be identical in both languages
//   --allow-same-file <file>     same, one key per line
//   --bangla <lang>              warn about values of that language with letters but no Bangla character (U+0980-09FF)
//   --fail-on-same               identical / non-Bangla values are problems, not warnings
// Exit codes: 0 ok, 1 problems found, 2 usage error or the file cannot be parsed. Expected errors print one line, no stack trace.
'use strict';
const fs = require('fs');

class ParseError extends Error {}

// ---- lexical scan: state per character. 0 code, 1 comment, 2 string/template/regex content ----
function scan(src) {
  const n = src.length, st = new Uint8Array(n);
  const stack = [{ m: 'C', d: 0 }];
  let last = ''; // last significant code char, for the regex-vs-division guess
  let i = 0;
  while (i < n) {
    const top = stack[stack.length - 1], c = src[i];
    if (top.m === 'T') { // inside a template literal
      if (c === '\\') { st[i] = 2; if (i + 1 < n) st[i + 1] = 2; i += 2; continue; }
      if (c === '`') { stack.pop(); last = '`'; i++; continue; }
      if (c === '$' && src[i + 1] === '{') { st[i] = st[i + 1] = 2; stack.push({ m: 'C', d: 0 }); i += 2; continue; }
      st[i] = 2; i++; continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') st[i++] = 1; continue; }
    if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      while (i < j) st[i++] = 1; continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') { st[i] = 2; if (src[i] === '\\') { i++; if (i < n) st[i] = 2; } i++; }
      i++; last = c; continue;
    }
    if (c === '`') { stack.push({ m: 'T' }); i++; continue; }
    if (c === '/' && (last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last))) { // regex literal
      i++; let cls = false;
      while (i < n && src[i] !== '\n' && (cls || src[i] !== '/')) {
        st[i] = 2;
        if (src[i] === '\\') { i++; if (i < n) st[i] = 2; } else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false;
        i++;
      }
      i++; while (i < n && /[a-z]/i.test(src[i])) i++;
      last = '/'; continue;
    }
    if (c === '{') top.d++;
    else if (c === '}') { if (top.d === 0 && stack.length > 1) { stack.pop(); i++; continue; } top.d--; }
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return st;
}
const lineOf = (src, i) => { let l = 1; for (let k = 0; k < i && k < src.length; k++) if (src[k] === '\n') l++; return l; };
// Source with comments blanked (strings kept), for call-site scans.
function stripComments(src, st) { let o = ''; for (let i = 0; i < src.length; i++) o += st[i] === 1 && src[i] !== '\n' ? ' ' : src[i]; return o; }

// ---- marker: exactly one occurrence outside comments and string contents ----
function findMarker(src, marker, st) {
  st = st || scan(src);
  const hits = [];
  for (let i = src.indexOf(marker); i >= 0; i = src.indexOf(marker, i + 1)) {
    let ok = true;
    for (let k = i; k < i + marker.length; k++) if (st[k] === 1 || st[k] === 2) { ok = false; break; }
    if (ok && /\w/.test(marker[0]) && i > 0 && /[\w$]/.test(src[i - 1])) ok = false;
    if (ok) hits.push(i);
  }
  if (!hits.length) throw new ParseError('marker not found (outside comments and strings): ' + JSON.stringify(marker));
  if (hits.length > 1) throw new ParseError('marker appears ' + hits.length + ' times outside comments (lines ' + hits.map(h => lineOf(src, h)).join(', ') + '); it must be unique: ' + JSON.stringify(marker));
  return hits[0] + marker.length;
}

// ---- data-only literal parser. Objects keep every entry (with duplicates) so the checks can see them ----
function parseLiteral(src, pos, st) {
  const fail = (msg, at) => { throw new ParseError('line ' + lineOf(src, at == null ? p : at) + ': ' + msg); };
  let p = pos;
  const ws = () => { while (p < src.length && (st[p] === 1 || /\s/.test(src[p]))) p++; };
  const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  function str(q) {
    const start = p; p++; let out = '';
    for (;;) {
      if (p >= src.length) fail('unterminated string', start);
      const c = src[p];
      if (c === q) { p++; return out; }
      if (q !== '`' && c === '\n') fail('unterminated string', start);
      if (q === '`' && c === '$' && src[p + 1] === '{') fail('template literal with ${...} is not plain data', p);
      if (c !== '\\') { out += c; p++; continue; }
      const e = src[p + 1]; p += 2;
      if (e === 'x') { out += String.fromCharCode(parseInt(src.substr(p, 2), 16)); p += 2; }
      else if (e === 'u') {
        if (src[p] === '{') { const j = src.indexOf('}', p); out += String.fromCodePoint(parseInt(src.slice(p + 1, j), 16)); p = j + 1; }
        else { out += String.fromCharCode(parseInt(src.substr(p, 4), 16)); p += 4; }
      } else if (e === '\n') { /* line continuation */ }
      else if (e in ESC) out += ESC[e];
      else out += e;
    }
  }
  function value() {
    ws(); const c = src[p], at = p;
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === "'" || c === '"' || c === '`') return { t: 'str', v: str(c), line: lineOf(src, at) };
    let m = /^-?(0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(src.slice(p, p + 40));
    if (m) { p += m[0].length; return { t: 'num', v: Number(m[0]), line: lineOf(src, at) }; }
    m = /^[A-Za-z_$][\w$]*/.exec(src.slice(p, p + 80));
    if (m && ['true', 'false', 'null'].includes(m[0])) { p += m[0].length; return { t: m[0] === 'null' ? 'null' : 'bool', v: m[0] === 'true' ? true : m[0] === 'false' ? false : null, line: lineOf(src, at) }; }
    if (m) fail('identifier or expression "' + m[0] + '" is not plain data; the dictionary must contain only literals (not evaluated)', at);
    fail(c === undefined ? 'unexpected end of file' : 'unexpected character ' + JSON.stringify(c) + ' (spread, regex or other expression are not plain data)', at);
  }
  function after(close) { // after a value: expect , or the closer; anything else is an unsupported expression
    ws();
    if (src[p] === ',') { p++; return true; }
    if (src[p] === close) return false;
    fail('expected "," or "' + close + '" but found ' + (p >= src.length ? 'end of file' : JSON.stringify(src.slice(p, p + 12))) + ' (operators, calls and concatenation are not plain data)');
  }
  function array() {
    const line = lineOf(src, p); p++; const items = [];
    for (;;) { ws(); if (src[p] === ']') { p++; break; } items.push(value()); if (!after(']')) { p++; break; } }
    return { t: 'arr', items, line };
  }
  function object() {
    const line = lineOf(src, p); p++; const entries = [];
    for (;;) {
      ws(); if (src[p] === '}') { p++; break; }
      const at = p, c = src[p]; let key;
      if (c === "'" || c === '"') key = str(c);
      else { const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(src.slice(p, p + 80)); if (!m) fail('expected a key but found ' + JSON.stringify(src.slice(p, p + 12)), at); key = m[0]; p += key.length; }
      ws(); if (src[p] !== ':') fail('expected ":" after key "' + key + '" (shorthand properties and methods are not plain data)');
      p++;
      const v = value(); entries.push({ key, value: v, line: lineOf(src, at) });
      if (!after('}')) { p++; break; }
    }
    return { t: 'obj', entries, line };
  }
  ws(); if (src[p] !== '{') fail('the marker must be followed by an object literal "{"');
  return value();
}

// Parsed literal after the marker.
function load(src, marker) {
  const st = scan(src);
  return parseLiteral(src, findMarker(src, marker, st), st);
}
// Source text of the literal (kept for API compatibility).
function literalAfter(src, marker) {
  const st = scan(src); const s = findMarker(src, marker, st); const start = src.indexOf('{', s);
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (st[j]) continue;
    if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new ParseError('unbalanced braces after ' + marker);
}

const ph = s => (String(s).match(/\{\w+\}/g) || []).sort();
const count = a => { const m = {}; a.forEach(x => { m[x] = (m[x] || 0) + 1; }); return m; };
const phDiff = (a, b) => { const ca = count(a), cb = count(b), d = []; for (const k of new Set([...a, ...b])) if ((ca[k] || 0) !== (cb[k] || 0)) d.push(k + ' x' + (ca[k] || 0) + ' vs x' + (cb[k] || 0)); return d; };
const hasLetter = s => /\p{L}/u.test(s);

function langObj(root, name) {
  const e = root.entries.filter(x => x.key === name).pop();
  if (!e) throw new ParseError('need both language keys in the dictionary; missing "' + name + '"');
  if (e.value.t !== 'obj') throw new ParseError('"' + name + '" is not an object');
  return e.value;
}

// Flat dictionary checks. Returns key maps per language.
function checkDicts(root, a, b, opts, out) {
  const A = langObj(root, a), B = langObj(root, b), maps = {};
  for (const [l, o] of [[a, A], [b, B]]) {
    const m = new Map();
    for (const e of o.entries) {
      const prev = m.get(e.key);
      if (prev) { // later wins at runtime: harmless when the text is identical (warning), a bug when it differs (problem)
        const same = prev.value.t === e.value.t && prev.value.v === e.value.v;
        (same ? out.warnings : out.problems).push('duplicate key in ' + l + ': ' + e.key + ' (lines ' + prev.line + ' and ' + e.line + (same ? ', same text' : ', DIFFERENT text, the later one wins') + ')');
      }
      m.set(e.key, e);
    }
    maps[l] = m;
  }
  for (const k of maps[b].keys()) if (!maps[a].has(k)) out.problems.push('in ' + b + ' but not ' + a + ': ' + k);
  for (const k of maps[a].keys()) if (!maps[b].has(k)) out.problems.push('in ' + a + ' but not ' + b + ': ' + k);
  const noBn = [];
  for (const l of [a, b]) for (const [k, e] of maps[l]) {
    const v = e.value;
    if (v.t !== 'str') out.problems.push('non-string value (' + v.t + ') in ' + l + '.' + k + ' (line ' + e.line + ')');
    else if (!v.v.trim()) out.problems.push('empty: ' + l + '.' + k);
    else if (/\uFFFD|\u00e0\u00a6|\u00e0\u00a7|\u00c3./.test(v.v)) out.problems.push('mojibake (text decoded with the wrong encoding) in ' + l + '.' + k);
    else if (l === opts.bangla && hasLetter(v.v) && !/[\u0980-\u09FF]/.test(v.v)) noBn.push(k);
  }
  if (noBn.length) (opts.failOnSame ? out.problems : out.warnings).push(noBn.length + ' ' + opts.bangla + ' value(s) contain no Bangla character: ' + noBn.slice(0, 8).join(', ') + (noBn.length > 8 ? ', ...' : ''));
  let same = 0;
  for (const [k, ea] of maps[a]) {
    const eb = maps[b].get(k); if (!eb) continue;
    const va = ea.value, vb = eb.value;
    if (va.t !== 'str' || vb.t !== 'str') continue;
    const d = phDiff(ph(va.v), ph(vb.v));
    if (d.length) out.problems.push('placeholders differ: ' + k + ' (' + d.join('; ') + ')');
    if (va.v.trim() && va.v === vb.v && hasLetter(va.v) && !opts.allowSame.has(k)) {
      same++; if (opts.failOnSame) out.problems.push('identical in both languages: ' + k);
    }
  }
  if (same && !opts.failOnSame) out.warnings.push(same + ' value(s) identical in ' + a + ' and ' + b + ' (untranslated? silence real ones with --allow-same)');
  return maps;
}

// Section structure check: { en: { title, status, sections: [[title, [paragraphs]]] }, bn: {...} }
function checkSections(src, marker, a, b, out) {
  const root = load(src, marker), tag = marker.trim().replace(/^var\s+/, '').replace(/\s*=\s*$/, '');
  const get = l => {
    const o = langObj(root, l), s = o.entries.filter(x => x.key === 'sections').pop();
    if (!s || s.value.t !== 'arr') throw new ParseError(tag + '.' + l + ' has no "sections" array');
    return { o, secs: s.value.items };
  };
  const A = get(a), B = get(b), p = tag + ': ';
  for (const [l, o] of [[a, A.o], [b, B.o]]) for (const f of ['title', 'status']) {
    const e = o.entries.filter(x => x.key === f).pop();
    if (!e || e.value.t !== 'str' || !e.value.v.trim()) out.problems.push(p + l + '.' + f + ' missing or empty');
  }
  if (A.secs.length !== B.secs.length) out.problems.push(p + 'section count differs: ' + a + '=' + A.secs.length + ' ' + b + '=' + B.secs.length);
  const shape = (l, s, i) => {
    const w = p + l + ' section ' + (i + 1);
    if (s.t !== 'arr' || s.items.length !== 2 || s.items[0].t !== 'str' || s.items[1].t !== 'arr') { out.problems.push(w + ': expected [title, [paragraphs]]'); return null; }
    if (!s.items[0].v.trim()) out.problems.push(w + ': empty title');
    const paras = s.items[1].items;
    paras.forEach((x, j) => {
      if (x.t !== 'str' || !x.v.trim()) out.problems.push(w + ' paragraph ' + (j + 1) + ': empty or not a string');
      else if ((x.v.match(/<b>/g) || []).length !== (x.v.match(/<\/b>/g) || []).length) out.problems.push(w + ' paragraph ' + (j + 1) + ': unbalanced <b> tags');
    });
    return paras;
  };
  const n = Math.min(A.secs.length, B.secs.length);
  for (let i = 0; i < Math.max(A.secs.length, B.secs.length); i++) {
    const pa = i < A.secs.length ? shape(a, A.secs[i], i) : null, pb = i < B.secs.length ? shape(b, B.secs[i], i) : null;
    if (i >= n || !pa || !pb) continue;
    if (pa.length !== pb.length) out.problems.push(p + 'section ' + (i + 1) + ' paragraph count differs: ' + a + '=' + pa.length + ' ' + b + '=' + pb.length);
    const bt = x => x.map(y => y.t === 'str' ? (y.v.match(/<b>/g) || []).length : 0).reduce((s, v) => s + v, 0);
    if (bt(pa) !== bt(pb)) out.problems.push(p + 'section ' + (i + 1) + ' <b> count differs: ' + a + '=' + bt(pa) + ' ' + b + '=' + bt(pb));
  }
}

// Keys used in source as t('key') / t("key"); error codes as code('x') / err('x').
function usedKeys(src) {
  const s = stripComments(src, scan(src)), out = new Map(), re = /(?<![\w$.])t\(\s*(['"])([^'"\n\\]+)\1/g;
  for (let m; (m = re.exec(s));) if (!out.has(m[2])) out.set(m[2], lineOf(s, m.index));
  return out;
}
function usedCodes(src) {
  const s = stripComments(src, scan(src)), out = new Map(), re = /(?<![\w$.])(?:code|err)\(\s*(['"])([A-Za-z0-9_]+)\1/g;
  for (let m; (m = re.exec(s));) if (!out.has(m[2])) out.set(m[2], lineOf(s, m.index));
  return out;
}

// Returns { problems, warnings }.
function report(src, marker, a, b, opts) {
  opts = Object.assign({ allowSame: new Set(), failOnSame: false, used: [], codes: [], codesWarn: false, codePrefix: 'e_', arrayMarkers: [] }, opts || {});
  if (!(opts.allowSame instanceof Set)) opts.allowSame = new Set(opts.allowSame);
  const out = { problems: [], warnings: [], missingCodes: [] };
  const root = load(src, marker);
  const maps = checkDicts(root, a, b, opts, out);
  for (const f of opts.used) {
    for (const [k, line] of usedKeys(f.text)) {
      const miss = [a, b].filter(l => !maps[l].has(k));
      if (miss.length) out.problems.push('key used in ' + f.name + ':' + line + ' but not defined in ' + miss.join(' and ') + ': ' + k);
    }
  }
  for (const f of opts.codes) {
    for (const [c, line] of usedCodes(f.text)) {
      const k = opts.codePrefix + c, miss = [a, b].filter(l => !maps[l].has(k));
      if (miss.length && !out.missingCodes.includes(c)) {
        out.missingCodes.push(c);
        (opts.codesWarn ? out.warnings : out.problems).push('server error code "' + c + '" (' + f.name + ':' + line + ') has no ' + k + ' in ' + miss.join(' and '));
      }
    }
  }
  for (const am of opts.arrayMarkers) checkSections(src, am, a, b, out);
  return out;
}
function check(src, marker, a, b, opts) { return report(src, marker, a, b, opts).problems; }

// ---- CLI ----
function parseArgs(argv) {
  const pos = [], o = { used: [], codes: [], arrayMarkers: [], allowSame: new Set() };
  const readList = (s) => s.split(',').map(x => x.trim()).filter(Boolean);
  const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { throw new ParseError('cannot read ' + f + ': ' + e.code); } };
  for (let i = 0; i < argv.length; i++) {
    let x = argv[i];
    if (!x.startsWith('--')) { pos.push(x); continue; }
    let v; const eq = x.indexOf('='); if (eq > 0) { v = x.slice(eq + 1); x = x.slice(0, eq); }
    const need = () => { if (v == null) v = argv[++i]; if (v == null) throw new ParseError('option ' + x + ' needs a value'); return v; };
    switch (x) {
      case '--used-in': readList(need()).forEach(f => o.used.push({ name: f, text: rd(f) })); break;
      case '--codes-in': readList(need()).forEach(f => o.codes.push({ name: f, text: rd(f) })); break;
      case '--codes-warn': o.codesWarn = true; break;
      case '--code-prefix': o.codePrefix = need(); break;
      case '--array-marker': o.arrayMarkers.push(need()); break;
      case '--allow-same': readList(need()).forEach(k => o.allowSame.add(k)); break;
      case '--allow-same-file': rd(need()).split('\n').map(s => s.trim()).filter(s => s && s[0] !== '#').forEach(k => o.allowSame.add(k)); break;
      case '--fail-on-same': o.failOnSame = true; break;
      case '--bangla': o.bangla = need(); break;
      default: throw new ParseError('unknown option ' + x);
    }
  }
  return { pos, o };
}
function main(argv) {
  try {
    const { pos, o } = parseArgs(argv);
    if (pos.length !== 4) throw new ParseError('usage: node index.js <file> "<marker>" <lang1> <lang2> [--used-in f] [--codes-in f,f] [--codes-warn] [--array-marker "var X = "] [--allow-same k,k] [--fail-on-same]');
    const [file, marker, a, b] = pos;
    try { fs.readFileSync(file); } catch (e) { throw new ParseError('cannot read ' + file + ': ' + e.code); }
    const r = report(fs.readFileSync(file, 'utf8'), marker, a, b, o);
    r.warnings.forEach(w => console.log('warning: ' + w));
    if (r.problems.length) { console.error(r.problems.join('\n')); console.error(r.problems.length + ' problem(s)'); return 1; }
    console.log('i18n parity passed');
    return 0;
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    console.error('i18n-parity: ' + e.message);
    return 2;
  }
}
module.exports = { check, report, literalAfter, ParseError, scan, findMarker, parseLiteral, usedKeys, usedCodes };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
