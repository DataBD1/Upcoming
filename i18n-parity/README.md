# i18n-parity

Checks that two language dictionaries in a JS file have the same keys, no empty strings and the same `{placeholders}`.

    node index.js public/app.js "var T = " bn en

Finds the object literal after the marker and evaluates it in an empty sandbox (plain data only), so it works on browser scripts you cannot `require()`. Exit code 1 and a list of problems on failure. No dependencies.

Extracted from DataBD1/DHK-Predicts (`test-i18n.js`).
