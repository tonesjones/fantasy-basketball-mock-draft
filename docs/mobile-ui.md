# Mobile draft room

Phones at widths up to 700px use one main view with persistent Players,
My team, Analysis, and Punts navigation. The pick header (Pick N, Restart,
Undo pick), search, filters, and pagination remain reachable while the
player list scrolls. Styles live in `mobile.css`, `mobile-sheet.css`, and
`mobile-approved.css` (the 2026-10-02 refresh); all are scoped to phones.

## Tabs

- **Players:** the available list. Selecting a player opens the player sheet.
  A collapsed **Past ADP** row sits above the list when any available player
  is past their consensus ADP (top 8 by 2025–26 value, same rows as the
  desktop box). It opens as a drop-down over the list so the list keeps its
  height, sits beside Filters in landscape, and closes once you pick a player.
- **My team:** roster by position or pick order, a nine-category snapshot,
  and playoff games. **Board** opens the full draft board scrolled to your
  column, with the round column pinned; "Back to roster" returns.
- **Analysis:** once you have a pick, your grade (letter, rank of 12, team
  value), then one card per opponent with your category score and a
  per-category breakdown. Sort by team value, toughest matchup, or team number.
  Historical 2025–26 values, not win probabilities.
- **Punts:** the recommendation comes from `PuntCore.suggest`, the same rule
  as the desktop Punt advice box, so phone and desktop never disagree.
  Toggle up to three categories, then Commit; Clear punts resets. Below, the
  same riser lists as desktop: "Consider at pick #N" (`PuntCore.nearTermRisers`,
  unlikely to last to your following pick) and "Watch for later"
  (`PuntCore.laterRisers`), each with the rank change under the punt.

## Player sheet

A native dialog with the Pick coach advice, category strengths and
weaknesses, and 2025–26 per-game averages from `player-averages.js`
(display only; provenance in `scripts/data-provenance/2026-10-02-per-game/`).
That file loads the first time a sheet opens, so desktop never downloads it;
until it arrives the sheet says "Loading per-game averages…".
Close and the named Draft button stay reachable while advice scrolls.
Selection does not draft a player. Escape closes the dialog and restores
focus to the player row.

## Picks and completion

After a pick, a short "X drafted" toast appears above the tab bar; it does
not block taps, and Undo pick stays in the header. When the draft finishes,
the phone layout stays: it lands on My team with your grade and **Run it
back**, and every tab and Undo still work.

Positional scarcity is desktop-only; there is no room for it on phones.

View changes preserve each view's scroll position during the current
session. Desktop layouts above 700px are unchanged.

## Verification

`npm test` runs `test-mobile-views.js`, which covers the Analysis, Punts,
My team, Past ADP and player-stat markup: Punts recommends the same category
as `PuntCore.suggest` and lists the same risers as desktop, Past ADP matches
the desktop rows, Analysis waits for your first pick, and the sheet's
loading and unavailable states for the per-game averages.

`scripts/verify-mobile.cjs` is an optional real-browser check with
Playwright (bundled Chromium; `MOBILE_BROWSER_CHANNEL=msedge` for Edge). Run
`NODE_PATH=<dir containing playwright> node scripts/verify-mobile.cjs`.
`MOBILE_SCREENSHOT` can name a PNG output path. It covers 390×844, 320×568,
430×932, and 667×375: navigation, Past ADP, Board under My team (opening on
your column), the Analysis empty state, Punts commit/clear,
disabled-button styling, the pick toast's font and placement, drafting,
undo, scroll and focus restoration, a full 13-round draft to the finished
screen and Run it back, and resize to desktop. A separate 1280×900 page
checks that desktop never downloads `player-averages.js`, keeps scarcity,
and renders the toast in the app font.

Checks use local assets and the coach's unavailable-service fallback. They
do not verify the hosted coach service, physical-device keyboards, or
Safari. Before publishing, check iPhone Safari and Android Chrome.
