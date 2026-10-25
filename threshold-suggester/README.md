# threshold-suggester

Suggests the threshold for a daily "will X be above/below/at least T" question so that tomorrow's outcome is as close to a coin flip as the recent history allows. It says nothing about the percentage the market opens at: daily markets open at 50% whatever the threshold is (`fromTemplate` sets `p0: 0.5`). The threshold only decides how uncertain the question is.

    node index.js --dir above --values 122.10,122.40,122.50,122.80,123.00,122.60,122.90,123.10,123.00,123.20
    node index.js --dir atleast -- 61 63 58 60 62 64 59 57 60 61      # values oldest first, last = latest reading
    node index.js --dir below -- -3 -1 0 2 1 4 0 1 2 3                # negative data is fine after `--`

`--dir` must be exactly `above` (reading > T: Q1, Q2, Q3, Q6), `below` (reading < T) or `atleast` (reading >= T: Q5 "reach"). Values are plain decimals (no blanks, hex, exponents, Infinity, NaN). At least **10** values are required (ten gives nine day-to-day changes; 30 is better; only the latest 30 are used). Any bad input prints a one-line `error: ...` and exits non-zero.

## Model

Tomorrow = latest value + one of the recent day-to-day **changes** (each equally likely, taken in both signs around their mean). The mean change counts as drift only as far as it stands out from noise (shrunk by `1 - 4/t^2`, nothing below t = 2). Predictions sit on the readings' own grid (whole degrees, 2-decimal taka, 4-decimal pounds), and the threshold is the grid value whose exact probability for the chosen operator, **ties included**, is nearest 50%. The output line shows that probability and the part of it that is "exactly equal". The threshold is printed in a form the app accepts (`/^\d+(\.\d+)?$/`, at most 12 characters); it never prints a negative or exponent form, and errors instead if the data would need one.

## Limits

- A rule of thumb from a handful of numbers, not a forecast. It cannot know about news, central-bank moves or weather fronts.
- It does not model mean reversion or seasons beyond the recent drift, so for noisy readings (daily temperatures) it is no better than "use yesterday's value".
- With 10 values the probabilities move in coarse steps (about 5 points).
- Integer readings tie a lot (10 to 25% at the threshold); for "above" a tie resolves NO, for "atleast" YES. Choose the operator to match the question template.

## Backtest (test.js, fixed seeds, 400 simulated histories x 300 next-day draws each)

Mean distance of the TRUE probability of YES from 50% (smaller is better), threshold rule vs "yesterday's value" vs the old share-of-past-values estimator. Window = number of values given.

| Simulated series | Window | This tool | Yesterday | Old |
|---|---|---|---|---|
| Random walk with drift (+0.15/day, 2 dp) | 10 / 30 | 12.7 / 7.1 pp | 46.5 / 46.5 pp | 50.0 / 50.0 pp |
| Taka crawl (+0.03/day, 2 dp) | 10 / 30 | 11.4 / 9.7 pp | 12.2 / 12.3 pp | 40.0 / 47.5 pp |
| GBP/USD random walk (4 dp) | 10 / 30 | 3.1 / 2.6 pp | 2.4 / 2.3 pp | 31.5 / 40.2 pp |
| Temperature, autumn (-0.18/day, whole degrees) | 10 / 30 | 15.9 / 16.4 pp | 16.2 / 17.0 pp | 23.4 / 33.3 pp |
| Temperature, spring (+0.15/day, 0.1 degree) | 10 / 30 | 15.0 / 14.8 pp | 15.0 / 14.8 pp | 21.7 / 30.2 pp |

Honest reading: far better than the old estimator everywhere; far better than yesterday's value when there is a steady drift; roughly equal to yesterday's value for driftless or noisy series (about 0.5 to 0.7 points worse on the pound). These are simulations with assumed parameters, not real data.
