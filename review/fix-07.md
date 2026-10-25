# fix-07 threshold suggester

Reworked (not deleted): new goal, model and strict CLI. Scope: threshold-suggester/ only (+ this file).

| ID | Result | Note / test |
|---|---|---|
| F1 Critical (opens at 50% always) | FIXED | README/CLI/comments no longer mention the opening percentage; goal is "coin-flip outcome". test.js CLI output check |
| F2 High (worse than yesterday) | FIXED for drifting series, WASH otherwise | new change-based model; backtest asserts new < yesterday on drift and taka families, new < old everywhere, within 1pp of yesterday elsewhere. Pound random walk is 0.3-0.7pp worse than yesterday, temperatures tie. Stated in README |
| F3 High (in-sample band only) | FIXED | band logic removed; README reports out-of-sample backtest |
| F4 High (negatives/exponent rejected by app) | FIXED | output matches /^\d+(\.\d+)?$/, <=12 chars, errors if impossible; 3000-case fuzz in test.js |
| F5 Medium (ties/Q5 >=) | FIXED | `--dir atleast`; exact tie mass reported; test "grid, ties, operators" |
| F6 Medium (precision) | FIXED | grid from decimals as written (max 4), toFixed output, integer data gives integer thresholds |
| F7 Medium (silent coercion) | FIXED | strict token regex, direction exact; test "input handling" |
| F8 Medium (CLI parsing) | FIXED | `--dir`, `--values`, `--`; `-3` works; test CLI block |
| F9 Low (stack overflow, flat series throws) | FIXED | no spread over big arrays except decimals (window capped to 30); flat series returns an answer with its tie mass |
| F10 Low (weak tests) | FIXED | test.js: input, fuzz, ties, CLI, backtest |

Order of values now matters (changes are computed in order; documented "oldest first").

Commands: `cd threshold-suggester && npm test` -> pass. Before-failure: new test.js against the old index.js fails immediately (`s is not a function`, old exports differ; old CLI exited 0 on `-3 -1 ...`).
Did not run the app suite (no app files touched). `legacy-estimator.js` is the old code kept only for the backtest comparison.

## Coordinator: claims elsewhere to correct
- dhk-predicts-features/app/README.md "Thresholds are placeholders ... 30% and 70%": daily markets always open at 50% (`fromTemplate` p0 0.5); the threshold only sets how uncertain the question is. Reword.
- core.js comment above `betaSeed` ("sets it from the latest published value so it opens near 50%") is also wrong about opening; not edited.
- Business docs/gtm notes that say the suggester makes markets "open between 30% and 70%" (grep "30%" / "70%" / "threshold" in business/, gtm/): replace with "threshold chosen so tomorrow's outcome is near a coin flip; opening price is 50%".
- Decision: if `open` should really start at the suggester's probability, that is an app change (`p0` from `a.p`), out of scope here.
