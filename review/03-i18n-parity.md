# 03 i18n-parity (string parity check)

**Verdict: FIX FIRST, 4/10.** It passes today and catches the textbook case (key in one language only), but it runs repo text with a sandbox that is not one, and it misses most of what makes a Bangla UI break.

## What I ran
- `npm run check` in app/ -> "i18n parity passed". Read index.js and test.js (9 lines, one happy path, one bad case).
- `repro/03-sandbox.js <0-5>`: six hostile literals, one process each.
- `repro/03-mutants.js`: 26 mutated copies of app.js run through the real CLI.
- `repro/03-analyze.js`: independent audit of the current app.js (used keys, duplicates, call-site vars, server codes, PRIVACY/TERMS).

## Findings
| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 CONFIRMED | High (Medium if only the owner pushes) | `vm.runInNewContext` is not a security boundary. A literal in app.js runs arbitrary code in the checker's process: `(this.constructor.constructor('return process')().mainModule.require('fs').writeFileSync(...))` wrote a file; the tool returned `[]` (pass). Anyone who can land a PR on app.js gets code execution wherever `npm run check` runs (CI secrets, dev laptops). | `node 03-sandbox.js 0` -> "returned [] ... ESCAPED: file written" | Do not evaluate. Parse with a real parser (acorn, or a small JSON5-style reader) or have app.js export the dictionaries as JSON (`i18n.json`) and read that. If eval stays, run in a child process with `--max-old-space-size`, no secrets, killed on timeout. |
| S2 CONFIRMED | Medium | Timeout does not cover async work. `Promise.resolve().then(function f(){return Promise.resolve().then(f)})` returns "pass" in 2ms, then the microtask loop runs on after the check, grows the heap and kills the process with OOM (exit 134, ~35 s). Sync loops, ReDoS and a memory bomb ARE stopped at 1000 ms; string doubling throws cleanly. | `node 03-sandbox.js 4` -> exit 134 "heap out of memory" | Same as S1 (no eval). Also pass `microtaskMode:'afterEvaluate'`. |
| C1 CONFIRMED | High | Keys USED in code but defined in neither language are not checked. `t('nope_key')` added -> pass. The app then prints the raw key (`t()` returns `k`). | mutant D1 not caught | Add a scan of `t('literal'` call sites and fail if absent from either dict. Current app.js has 187 literal keys, 0 undefined, so this is latent, not live. |
| C2 CONFIRMED | High | **Wrong object checked.** `literalAfter` takes the FIRST occurrence of the marker, including one in a comment. With `// old: var T = { bn: {}, en: {} }` above the real T, a genuinely missing key (`top` renamed `topX` in en) still passes. | `d19.js` -> "i18n parity passed", exit 0 | Anchor the marker to line start (`^\s*var T = `), and require >= N keys. |
| C3 CONFIRMED | Medium | Duplicate keys in one language: later silently wins, not reported (object evaluation hides them). `close` is already duplicated in both bn (lines 36 and 52) and en (104, 120), harmless only because values are equal. | D2, D3 not caught; analyze: `dup_bn:[close]`, `dup_en:[close]` (281 raw vs 280 real) | Count keys from source text, or use a parser that reports duplicates. |
| C4 CONFIRMED | Medium | No check that bn is actually Bangla: English left in bn (`top:'Top'`, whole `app:'Dhaka Predicts'`), Latin-only values, mojibake (`à¦¸...`), number or object values all pass. Current file is clean (0 identical, 0 no-Bangla, 0 U+FFFD), so this is preventive. | D4, D5, D7, D8, D11, D24 not caught | Fail if a bn value has no U+0980-09FF char unless allow-listed; fail on non-string. |
| C5 CONFIRMED | Medium | **PRIVACY and TERMS are not checked at all.** Dropping a whole bn section, a whole en section, or blanking a paragraph passes. Today: PRIVACY 9/9 sections, paragraphs 1,3,1,1,1,1,1,1,1 in both; TERMS 11/11, 1,2,2,1,1,3,1,1,1,1,1 in both; 15 and 11 `[blank]` markers each; `<b>` counts match (9 / 2). So parity holds now; the tool would not notice if it broke. These are legal texts. | D12-D15 not caught | Run a second pass: same section count, same paragraph count per section, same `[blank]` and `<b>` counts, non-empty. |
| C6 CONFIRMED | Medium | Server error codes with no `e_` key fall to "Something went wrong": 9 codes (`no_market, no_shares, bad_outcome, not_resolved, no_dispute, bad_city, dup_action, try_again, otp_send_failed`) are emitted by core/social/handler with no translation in either language. Not the raw-key bug (errText guards it), but a player gets no reason. | analyze script over core.js/social.js/lib/*.js (regex-based, so SUSPECTED for reachability) | Add keys, and have the check compare server error codes to `e_*`. |
| C7 CONFIRMED | Low | Call-site placeholders never checked: `t('est',{q:...})` against `{w}` passes, and the page would show a literal `{w}`. `t()` also replaces only the first occurrence of a placeholder (`s.replace(string)`), no current key repeats one. | D9 not caught; app.js line 215 | Check vars object keys against dict placeholders. |
| C8 CONFIRMED | Low | Parser fragility: braces/quotes in comments, template `${}`, regex literals. `/* } */` inside T crashed with a confusing SyntaxError (fails loudly, OK); an apostrophe in a `//` comment passed by luck of pairing; template and regex literals evaluate fine. | D17-D21 | Real parser. |
| C9 CONFIRMED | Low | Unused-key detection absent. Candidates never referenced as literals: `closes, max, lost, paid, of, you, money, mark` (about 8, SUSPECTED; dynamic `t(x)` calls make exact counting impossible; the 40 `e_*` keys are used via `'e_'+code`). | analyze `unused` list, filtered by hand | Optional warning. |

**Defects present in current app.js that the check does not see: about 11.** 9 untranslated server codes, 2 latent duplicate `close` keys; plus up to 8 unused keys (low value). Live missing-translation bugs of the "raw key printed" kind: 0.
Tool-side blind spots measured: of 24 valid mutants, 5 were caught (key one-sided, empty, placeholder diff, missing key) and 19 were not.

## What holds up
- One-sided keys, empty or whitespace-only values (incl. nbsp), and bn/en placeholder differences are caught. Sync hangs, ReDoS and allocation loops are cut by the 1000 ms timeout. Unbalanced braces fail loudly.
- Current app.js: bn/en each 280 keys, no identical values, no non-string values, no mojibake, ASCII digits only in 3 legit values (`g_code`, `e_bad_phone`, `metrics`), HTML tag use matches across languages.

## Does this item matter?
Marginally as written. The cost is about 40 lines and it runs in `npm run check`, but a bilingual UI for a Bangla-first audience is where silent breakage happens, and the one-sided-key rule is the only part of that it covers. The real risks (undefined used keys, wrong-object parse, unchecked legal text) are untouched, and the eval is a genuine code-execution hole for a repo that takes outside PRs. For a single-owner repo, S1 is low in practice; fix it anyway by switching to a parser, then add C1, C2, C5 (about 30 more lines). Until then the "passed" line is weaker than it reads.

REPORT COMPLETE
