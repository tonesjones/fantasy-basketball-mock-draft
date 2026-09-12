# Fantasy Basketball Mock Draft Simulator

A static, single-page mock draft trainer for Yahoo-style fantasy basketball. Open `index.html` in a browser; it has no build step, server, or external dependency.

## What it does

- Runs a 12-team snake draft with 10–15 rounds and a selectable draft position.
- Uses the bundled Yahoo ADP as the CPU market signal, falling back to the app’s built-in rank when an ADP is missing. Small seeded variation keeps drafts from being identical while making a saved draft replayable.
- Rejects duplicate or invalid draft selections in the engine.
- Assigns each roster with position-aware matching and reassignment, so eligible players fill the most specific open slot first. Any player beyond the configured slots appears under **Overflow** rather than disappearing.
- Shows the full available pool through 50-player pages, including an honest filtered result count.
- Provides search, position filters, rank/ADP/last-season sorting, a live draft board, next-pick distance, and undo for the most recent user decision.
- Saves a standalone browser session automatically using `localStorage`, including the draft setup, pick log, random state, and data version. Use **Clear saved draft** or **Restart** to begin a fresh session.

## Files

- `index.html` — UI, player pool, and draft flow.
- `draft-core.js` — dependency-free validation, roster matching, seeded random source, and CPU selection. It is also usable from Node for tests.
- `player-data.js` — ADP and prior-season rank data merged into the player pool on load.
- `test-draft-core.js` — focused automated checks for duplicate-pick rejection, roster reassignment, reproducible randomness, ADP-led CPU choices, and an empty player pool.

## Run it

Open `index.html` directly, or serve this folder with any static server. Draft state is stored only in the browser that created it.

Run the logic checks with:

```bash
node test-draft-core.js
```

## Data notes

`player-data.js` contains the data provenance and generation date. The app validates saved state against that date, so an old saved draft is not silently applied to a newly refreshed player data set.

The category-scarcity panel shows, for each of the nine categories, the share of draftable above-replacement per-game category value still on the board, color-coded green → red and updating live as picks happen. Each player's nine per-game category values (`cv`, stored in `player-data.js`) are BM-style z-scores across the 225 sim players who appeared in 2025-26, in CATS9 order (PTS/REB/AST/STL/BLK/3PM/FG%/FT%/TO); FG%/FT% are volume-weighted and TO is inverted so positive means fewer turnovers. Replacement level is the mean `cv` of consensus ranks 150–170. It is a depletion gauge against last season's per-game production, not a projection model or a nine-category team evaluation.

## Data health audit

The setup and draft screens include a **Data health** disclosure with coverage counts and limitations. Hovering a scarcity category chip lists the top three remaining contributors in that category.

A red **INJ** badge next to a player's name marks the 9 players currently injured (as of 12 September 2026, from current reporting). Hovering the badge shows the injury, evidence/context, expected return date, and source.

```bash
node audit-data.js
node audit-data.js --json
node test-data-health.js
node test-draft-simulation.js
```

The dependency-free audit checks duplicate player names (ignoring case/outer whitespace), positions, player/data record coverage, invalid numeric values, missing ADP/prior-season ranks, missing or invalid per-game category values (`cv`), placeholder teams, and built-in rank/ADP gaps of at least 40 picks. `--json` includes every flagged name and rank gap. Malformed values, duplicate players, and unmatched data records produce a nonzero exit code; missing values and rank disagreements remain reported limitations because they can be legitimate.

Data refresh (2026-09-12): Yahoo ADP, NBA team, and Yahoo position eligibility refreshed from Hashtag Basketball's 2026-27 ADP table (Yahoo columns, updated 11 September 2026) for all 237 players: **237 players; 155 ADPs changed (8 gained ADP, none lost); 104 teams changed; 94 position sets changed; 74 still without a published Yahoo ADP; 29 missing prior-season per-game ranks; 12 missing totals ranks; 12 missing category values; 0 placeholder teams**. Historical 2025-26 `last`, `lastTotal`, and `cv` fields were preserved untouched. These checks establish internal consistency only: they do not prove completeness against the NBA player universe.

- `data-health.js` — shared browser/Node audit logic.
- `audit-data.js` — reproducible audit of the actual bundled player, category, and ADP data.
- `test-data-health.js` — failure-case checks and bundled record coverage gate.
