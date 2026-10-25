# size-budget

Fail CI when shipped files grow past a brotli size budget. No dependencies.

    node index.js [size-budget.json]

    { "quality": 5,
      "files":  { "public/app.js": 29.55, "core.js": 16.75 },
      "groups": { "critical path": { "files": ["public/app.js", "core.js"], "max": 47 } } }

- Paths are relative to the config file; sizes are KB (1024 B) of brotli output at `quality` (integer 0-11, default 5, closer to what CDNs use than q11). The q11 figure is printed next to each line for reference.
- List only files browsers really download. A group sums its member files (each must be in `files`) and has its own `max`; use groups for "critical path" and "first visit" totals.
- Validation is strict: budgets must be finite numbers > 0, `files` non-empty, every file must exist and be a regular file, unknown keys and duplicate paths are errors.
- Exit codes: 0 ok, 1 over budget, 2 bad config or missing file (one-line error, no stack trace).
- Set budgets from measured size plus about 5% so a real regression fails.
- Optional, not in `npm test`: `measure-wire.js` measures real bytes over the wire with Playwright against a running server.

Extracted from DataBD1/DHK-Predicts (`tools/check-size.js`), generalized to a config file.
