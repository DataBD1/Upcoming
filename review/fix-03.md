# Fix 03: i18n-parity

| ID | Result | Note / test |
|---|---|---|
| S1 sandbox escape | FIXED | `vm` removed; data-only parser, anything else exits 2. Test: mutants file, "hostile literals" (PWNED file never written; 4 variants) |
| S2 async OOM | FIXED | same (nothing is evaluated). Hostile case 3 |
| C1 used keys undefined | FIXED | `--used-in public/app.js` (in `check`). Mutants "t() key defined nowhere", double-quoted variant |
| C2 wrong object (marker in comment) | FIXED | marker found outside comments/strings, must be unique. Mutants: "marker appears twice", comment-above-T |
| C3 duplicate keys | FIXED | different text = problem, same text = warning (the existing `close` duplicate in bn lines 36/52 and en 104/120 has equal text, so it warns; delete the second `close` in app.js when convenient) |
| C4 untranslated / non-Bangla / mojibake / non-string | FIXED | non-string and mojibake are problems; identical values and `--bangla bn` no-Bangla values are warnings (counted), `--allow-same`, `--fail-on-same`. Tests in test-mutants.js |
| C5 PRIVACY/TERMS | FIXED | `--array-marker` x2 in `check`: sections, paragraphs per section, empty, `<b>` balance/count. 6 mutants |
| C6 server codes without `e_` | FIXED in tool; app.js NOT edited | `--codes-in core.js,social.js,lib/handler.js --codes-warn` (warn so `npm test` stays green until fix-06 adds keys; then drop `--codes-warn`). Test: "server error code without e_ key" |
| C7 call-site placeholder vars | DEFERRED | needs real JS parsing of call arguments; dict-side placeholder check (both directions, counted) is done |
| C8 parser fragility | FIXED | comments, escapes, templates, regex literals handled by the scanner; tests "comment with quote and brace", "template literal and escapes" |
| C9 unused keys | WON'T FIX | dynamic `t(x)` makes it unreliable |
| Exit codes / no stack traces | FIXED | 0 ok, 1 problems, 2 usage/parse; asserted in tests |
| Back-compat CLI | FIXED | `node index.js public/app.js "var T = " bn en` still works (tested) |

## Server codes with no `e_` key (exact list from the tool, 12)
no_market, login, no_shares, bad_outcome, not_resolved, no_dispute, bad_city, dup_action, try_again, use_post, too_large, bad_json.
The reviewer listed 9 (without login, use_post, too_large, bad_json; plus otp_send_failed, which my regex does not find because it is not emitted via `code()`/`err()` with a literal; fix-06 should grep for it). `login` is probably handled by the client's 401 path and the last three are transport-level; the owner of fix-06 decides which need text.

## Commands
- `cd i18n-parity && npm test` pass (test.js, test-mutants.js: 38 cases + extras). Before-state: the same mutant file run against the old index.js fails on its first defect case.
- Reviewer's 25 mutants (review/repro/03-mutants.js, extra flags): all real defects now caught except D9 (call-site vars, deferred), D4/D5/D24/D11/D15 are caught only as warnings or not at all (English left in bn: D4/D5 warn via identical-values, D24 warns with `--bangla bn`; D11 mojibake is caught when the text contains the typical sequences, my mutant used a different decoding; D15 English paragraph inside a bn paragraph is not detected).
- `cd dhk-predicts-features/app && npm test` pass (npm run check incl.).

## For the coordinator
- package.json `check` line changed (one line); other agents touching it must merge by hand. Final form: `... bn en --used-in public/app.js --array-marker "var PRIVACY = " --array-marker "var TERMS = " --codes-in core.js,social.js,lib/handler.js --codes-warn --bangla bn && node ../../size-budget/...`.
- After fix-06 adds the `e_` keys, remove `--codes-warn`.
- README for app: mention `npm run check` now also checks used keys, legal-text structure and error-code keys.
