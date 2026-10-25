// Mutant test: a sample app file is copied with one defect each; the CLI must return the expected exit code.
// Also covers the sandbox escapes that the old vm-based version let through (the file must never be executed).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert');
const CLI = path.join(__dirname, 'index.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-mut-'));
const SAMPLE = `// sample app
(function () {
  // old: var T = { bn: {}, en: {} }
  var T = {
    bn: {
      app: 'ঢাকা প্রেডিক্টস', top: 'সেরা', close: 'বন্ধ', est: '{s} পয়েন্ট, {w} জন', note: "এটা {x}",
      e_bad_otp: 'ভুল কোড', e_other: 'কিছু ভুল হয়েছে', e_no_market: 'বাজার নেই'
    },
    en: {
      app: 'Dhaka Predicts', top: 'Top', close: 'Close', est: '{s} points, {w} people', note: "it's {x}",
      e_bad_otp: 'Wrong code', e_other: 'Something went wrong', e_no_market: 'No such market'
    }
  };
  var PRIVACY = {
    en: { title: 'Privacy', status: 'Draft', sections: [
      ['Who', ['We are <b>X</b>.']],
      ['What', ['One.', 'Two.']],
      ['Age', ['18+.']]
    ] },
    bn: { title: 'গোপনীয়তা', status: 'খসড়া', sections: [
      ['কারা', ['আমরা <b>X</b>।']],
      ['কী', ['এক।', 'দুই।']],
      ['বয়স', ['১৮+।']]
    ] }
  };
  function t(k, vars) { return k; }
  t('top'); t("close"); t('est', { s: 1, w: 2 }); t('note');
  function code(c) { return new Error(c); }
  function f() { throw code('bad_otp'); }
  function g() { throw code('no_market'); }
})();
`;
const SERVER = "function code(c){return new Error(c)}\nfunction f(){throw code('bad_otp')}\nfunction h(){throw err('no_market')}\n";
const rep = (a, b) => s => { if (!s.includes(a)) throw new Error('no anchor: ' + a); return s.replace(a, b); };
const serverFile = path.join(dir, 'server.js'); fs.writeFileSync(serverFile, SERVER);
const ARGS = (f) => [f, 'var T = ', 'bn', 'en', '--used-in', f, '--array-marker', 'var PRIVACY = ', '--codes-in', serverFile];
const MUT = [
  // [name, mutate, expected exit, stderr regex]
  ['baseline', s => s, 0],
  ['key only in bn', rep("top: 'সেরা',", "top: 'সেরা', only_bn: 'শুধু',"), 1, /in bn but not en: only_bn/],
  ['key only in en', rep("top: 'Top',", "top: 'Top', only_en: 'only',"), 1, /in en but not bn: only_en/],
  ['empty value', rep("top: 'Top'", "top: ''"), 1, /empty: en\.top/],
  ['nbsp-only value', rep("top: 'Top'", "top: '\\u00a0'"), 1, /empty: en\.top/],
  ['placeholder missing in en', rep("{s} points, {w} people", "{s} points, people"), 1, /placeholders differ: est/],
  ['placeholder missing in bn (other direction)', rep("{s} পয়েন্ট, {w} জন", "{s} পয়েন্ট, জন"), 1, /placeholders differ: est/],
  ['placeholder repeated count differs', rep("{s} points, {w} people", "{s} points, {w} {w} people"), 1, /placeholders differ: est/],
  ['t() key defined nowhere', rep("t('top');", "t('top'); t('nope_key');"), 1, /nope_key/],
  ['t("key") double quoted, defined only in en', s => rep("t('top');", "t('top'); t(\"only_en\");")(rep("top: 'Top',", "top: 'Top', only_en: 'x',")(s)), 1, /only_en/],
  ['duplicate key with different text (en)', rep("close: 'Close',", "close: 'Close', close: 'WRONG',"), 1, /duplicate key in en: close.*DIFFERENT/],
  ['duplicate key with different text (bn)', rep("close: 'বন্ধ',", "close: 'বন্ধ', close: 'ভুল',"), 1, /duplicate key in bn: close/],
  ['non-string value (number)', rep("top: 'সেরা'", "top: 5"), 1, /non-string value \(num\) in bn\.top/],
  ['non-string value (object)', rep("top: 'সেরা'", "top: { x: 'a' }"), 1, /non-string value \(obj\)/],
  ['marker inside a comment first, real T wrong', s => s.replace("top: 'Top',", "topX: 'Top',"), 1, /in bn but not en: top|in en but not bn: topX/],
  ['marker appears twice in code', s => s + "\nvar T = { bn: {}, en: {} };\n", 2, /appears 2 times/],
  ['quoted key variant still compared', rep("top: 'Top'", "'top': 'Top'"), 0],
  ['comment with quote and brace in T', rep("      app: 'ঢাকা প্রেডিক্টস',", "      // it's { broken\n      /* } */ app: 'ঢাকা প্রেডিক্টস',"), 0],
  ['template literal and escapes', rep("top: 'সেরা'", "top: `সেরা\\u0021`"), 0],
  ['server error code without e_ key', s => s, 1, /server error code "extra"/, { server: SERVER + "function z(){throw code('extra')}\n" }],
  ['e_ key present in en only', rep("e_bad_otp: 'ভুল কোড',", ""), 1, /e_bad_otp/],
  ['PRIVACY bn section removed', rep("      ['বয়স', ['১৮+।']]\n", ""), 1, /section count differs/],
  ['PRIVACY en section removed', rep(",\n      ['Age', ['18+.']]", ""), 1, /section count differs/],
  ['PRIVACY bn paragraph blanked', rep("['এক।', 'দুই।']", "['এক।', '']"), 1, /paragraph 2: empty/],
  ['PRIVACY paragraph count differs', rep("['এক।', 'দুই।']", "['এক।']"), 1, /paragraph count differs/],
  ['PRIVACY <b> lost in bn', rep("আমরা <b>X</b>।", "আমরা X।"), 1, /<b> count differs/],
  ['PRIVACY <b> unbalanced', rep("আমরা <b>X</b>।", "আমরা <b>X।"), 1, /unbalanced <b>/],
  // unparseable or not plain data: must be refused (2), never evaluated
  ['function call in value', rep("top: 'সেরা'", "top: String(1)"), 2, /not plain data/],
  ['concatenation in value', rep("top: 'সেরা'", "top: 'a' + 'b'"), 2, /plain data/],
  ['identifier in value', rep("top: 'সেরা'", "top: SOMEVAR"), 2, /not plain data/],
  ['spread in object', rep("top: 'সেরা',", "...OTHER, top: 'সেরা',"), 2, /expected a key|not plain data/],
  ['template with ${}', rep("top: 'সেরা'", "top: `${1}`"), 2, /\$\{/],
  ['unterminated string', rep("top: 'সেরা'", "top: 'সেরা"), 2, /unterminated|expected/],
  ['marker missing', s => s.replace("  var T = {\n", "  var U = {\n"), 2, /marker not found/],
];
let n = 0;
MUT.forEach(([name, fn, want, re, extra], i) => {
  const f = path.join(dir, 'm' + i + '.js'); fs.writeFileSync(f, fn(SAMPLE));
  if (extra && extra.server) fs.writeFileSync(serverFile, extra.server);
  const r = cp.spawnSync('node', [CLI, ...ARGS(f)], { encoding: 'utf8', timeout: 20000 });
  if (extra && extra.server) fs.writeFileSync(serverFile, SERVER);
  assert.strictEqual(r.status, want, name + ': exit ' + r.status + ' want ' + want + '\n' + r.stdout + r.stderr);
  if (re) assert(re.test(r.stderr), name + ': stderr did not match ' + re + '\n' + r.stderr);
  assert(!/\n\s+at /.test(r.stderr), name + ': stack trace leaked');
  n++;
});
// Hostile literals: the old tool evaluated these. Now: exit 2, nothing executed, nothing written.
const pwn = path.join(dir, 'PWNED');
const hostile = [
  "(this.constructor.constructor('return process')().mainModule.require('fs').writeFileSync(" + JSON.stringify(pwn) + ",'x'),'x')",
  "require('fs').writeFileSync(" + JSON.stringify(pwn) + ",'x')",
  "(function(){ require('fs').writeFileSync(" + JSON.stringify(pwn) + ",'x'); })()",
  "Promise.resolve().then(function f(){return Promise.resolve().then(f)})",
];
hostile.forEach((h, i) => {
  const f = path.join(dir, 'h' + i + '.js'); fs.writeFileSync(f, SAMPLE.replace("top: 'সেরা'", 'top: ' + h));
  const r = cp.spawnSync('node', [CLI, ...ARGS(f)], { encoding: 'utf8', timeout: 20000 });
  assert.strictEqual(r.status, 2, 'hostile ' + i + ' exit ' + r.status + r.stderr);
  assert(!fs.existsSync(pwn), 'hostile ' + i + ': code was executed');
  n++;
});
// Backwards-compatible plain invocation, and usage errors
let r = cp.spawnSync('node', [CLI, path.join(dir, 'm0.js'), 'var T = ', 'bn', 'en'], { encoding: 'utf8' });
assert.strictEqual(r.status, 0); assert(/i18n parity passed/.test(r.stdout));
r = cp.spawnSync('node', [CLI], { encoding: 'utf8' }); assert.strictEqual(r.status, 2); assert(!/\n\s+at /.test(r.stderr));
r = cp.spawnSync('node', [CLI, path.join(dir, 'nope.js'), 'var T = ', 'bn', 'en'], { encoding: 'utf8' }); assert.strictEqual(r.status, 2); assert(!/\n\s+at /.test(r.stderr));
// non-Bangla text in bn and mojibake
const lat = path.join(dir, 'lat.js'); fs.writeFileSync(lat, SAMPLE.replace("top: 'সেরা'", "top: 'Leaders'"));
r = cp.spawnSync('node', [CLI, lat, 'var T = ', 'bn', 'en', '--bangla', 'bn'], { encoding: 'utf8' }); assert.strictEqual(r.status, 0); assert(/1 bn value\(s\) contain no Bangla/.test(r.stdout));
r = cp.spawnSync('node', [CLI, lat, 'var T = ', 'bn', 'en', '--bangla', 'bn', '--fail-on-same'], { encoding: 'utf8' }); assert.strictEqual(r.status, 1);
const moj = path.join(dir, 'moj.js'); fs.writeFileSync(moj, SAMPLE.replace("top: 'সেরা'", "top: 'à¦¸à§‡à¦°à¦¾'"));
r = cp.spawnSync('node', [CLI, moj, 'var T = ', 'bn', 'en'], { encoding: 'utf8' }); assert.strictEqual(r.status, 1); assert(/mojibake/.test(r.stderr));
// identical values: warning by default, problem with --fail-on-same, silenced by --allow-same
const same = path.join(dir, 'same.js'); fs.writeFileSync(same, SAMPLE.replace("top: 'সেরা'", "top: 'Top'"));
r = cp.spawnSync('node', [CLI, same, 'var T = ', 'bn', 'en'], { encoding: 'utf8' }); assert.strictEqual(r.status, 0); assert(/warning: 1 value\(s\) identical/.test(r.stdout));
r = cp.spawnSync('node', [CLI, same, 'var T = ', 'bn', 'en', '--fail-on-same'], { encoding: 'utf8' }); assert.strictEqual(r.status, 1);
r = cp.spawnSync('node', [CLI, same, 'var T = ', 'bn', 'en', '--fail-on-same', '--allow-same', 'top,app'], { encoding: 'utf8' }); assert.strictEqual(r.status, 0, r.stderr);
fs.rmSync(dir, { recursive: true, force: true });
console.log('i18n-parity mutant tests passed (' + n + ' cases)');
