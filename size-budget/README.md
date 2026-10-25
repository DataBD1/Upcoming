# size-budget

Fail CI when shipped files grow past a brotli size budget. No dependencies.

    node index.js [size-budget.json]

    { "files": { "public/app.js": 26, "core.js": 15 }, "total": 46, "excludeFromTotal": ["public/share.js"] }

Paths are relative to the config file; sizes are KB. Exit code 1 if any file or the total is over. In GitHub Actions: `- run: node size-budget/index.js`.

Extracted from DataBD1/DHK-Predicts (`tools/check-size.js`), generalized to a config file.
