# i18n-parity

Checks that two language dictionaries in a JS file agree. The file is never executed: the literal after the marker is read by a small built-in parser (objects, arrays, strings, numbers, true/false/null, comments, template literals without `${}`). Function calls, identifiers, spreads or concatenation make it stop with exit 2 and a one-line message.

    node index.js public/app.js "var T = " bn en [options]

Checks (problems, exit 1): key in one language only; duplicate key with different text; empty value; non-string value; `{placeholder}` mismatch in either direction (counted); mojibake. Warnings: duplicate key with identical text, values identical in both languages (letters only), `--bangla` values with no Bangla character.

| Option | Meaning |
|---|---|
| `--used-in f[,f]` | every `t('key')` / `t("key")` in these files must exist in both languages |
| `--codes-in f[,f]` | every `code('x')` / `err('x')` (server error codes) needs `e_x` in both languages. Pass the server files, e.g. `core.js,social.js,lib/handler.js`. `--code-prefix` changes `e_` |
| `--codes-warn` | missing `e_` keys are warnings, not problems |
| `--array-marker "var PRIVACY = "` | repeatable. Compares `{en:{title,status,sections:[[title,[paras]]]}, bn:{...}}`: section count, paragraph count per section, empty paragraphs, `<b>` balance and count |
| `--allow-same k,k` / `--allow-same-file f` | keys that may be identical in both languages |
| `--bangla bn` | warn on values of that language with no Bangla character |
| `--fail-on-same` | identical and non-Bangla values become problems |

The marker must occur exactly once outside comments and strings. Exit codes: 0 ok, 1 problems, 2 usage error or unparseable input. Tests: `npm test` (includes `test-mutants.js`, 38+ defective copies of a sample app file and hostile literals that must never run). Not checked: variable names passed at call sites (`t('est',{q:1})`).

Extracted from DataBD1/DHK-Predicts (`test-i18n.js`).
