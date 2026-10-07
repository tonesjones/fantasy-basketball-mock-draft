# Draft Lab visual update checkpoint

This checkpoint records the current visual-update decisions, local verification,
and release status.

## Current design

- Pick Coach keeps the pick-moment card and on-clock cue from the first visual pass.
- The draft board uses its existing readable table. The 3D board and Value field tab were removed after review.
- Pick Coach now shows **Past ADP and still available**, up to eight available players past consensus ADP, ordered by historical nine-category value. The list notes that this is not a 2026–27 projection.
- The punt chart uses SVG. Each category has a labeled spoke and point marker.
  Changing the punt chips redraws the chart. The page no longer loads three.js.

## Verified

- All 18 test files pass, including the Yahoo user-pick card check.
- A local browser check confirmed that the page has no Value field tab or 3D
  board. At pick 43, Pick Coach shows the Past ADP list. The expanded punt
  chart has nine labels, with each spoke and point aligned to its category.

## Review and release boundary

- The earlier foundation preview and PR show the removed 3D radar. Review the
  revised branch.
- This work descends from `test/yahoo-draft-copilot`, which contains development
  changes that are not in `main`. Review against that branch. Do not merge this
  visual update directly into `main` as a standalone change.
- A real Yahoo draft has not been tested end to end for this revision. No production merge has been made.
