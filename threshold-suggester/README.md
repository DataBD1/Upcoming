# threshold-suggester

Pick the threshold for a daily "will X be above/below T" question so it opens between 30% and 70%.

    node index.js above 122.1 122.4 122.5 122.8 123.0 122.6 122.9
    # Suggested threshold: 122.5 (above it: about 57% on 7 recent values, median 122.6)

The chance is the share of recent values that were above (or below) T. A threshold outside the band is moved to the nearest value inside it; a flat series that cannot reach the band is an error. Needs 5+ values. No dependencies. `npm test`.

Extracted from DataBD1/DHK-Predicts (`tools/threshold.js`).
