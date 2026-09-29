# Draft Lab visual update checkpoint

## Current design

- Pick Coach keeps the pick moment card and on-clock cue from the first visual pass.
- The draft board uses its existing readable table. The 3D board and Value field tab were removed after review.
- Pick Coach now shows **Past ADP and still available**, up to eight available players past consensus ADP, ordered by historical nine-category value. The list notes that this is not a 2026–27 projection.
- The punt chart is an SVG with one spoke and point marker per labeled category. Punt chips redraw the chart. It no longer loads three.js.

## Verified

- All 18 test files pass, including the Yahoo user-pick card check.
- Local browser check: no Value field tab or 3D board; Pick Coach shows the Past ADP list at pick 43; expanded punt chart has nine labels, spokes, and points aligned by category.

## Review and release boundary

- The earlier foundation preview and PR show the superseded 3D radar. Review the revised branch instead.
- This work descends from `test/yahoo-draft-copilot`, which has development changes not in `main`. Review against that base. Do not merge directly into `main` as a standalone visual change.
- A real Yahoo draft has not been tested end to end for this revision. No production merge has been made.
