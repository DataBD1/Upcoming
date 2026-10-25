# upcoming

Small standalone tools, one folder each. No dependencies, Node 18+. Run `npm test` inside a folder.

| Folder | What it does |
|---|---|
| `threshold-suggester/` | Picks a threshold for an above/below question so it opens between 30% and 70% |
| `size-budget/` | Fails CI when files grow past a brotli size budget |
| `i18n-parity/` | Checks two language dictionaries have the same keys and placeholders |

Also `dhk-predicts-features/`: a runnable copy of the DHK-Predicts app with six new features (`cd dhk-predicts-features/app && npm start`). It uses the three tools above for its checks.

Extracted from DataBD1/DHK-Predicts.
