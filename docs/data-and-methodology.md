# Data, methodology and feature notes

Moved out of the README so it can stay focused on using and running the app. Content unchanged.

## Data notes

`player-data.js` contains the data provenance and generation date. The app validates saved state against that date, so an old saved draft is not silently applied to a newly refreshed player data set.

The category-scarcity panel shows, for each of the nine categories, the share of draftable above-replacement per-game category value still on the board, color-coded green → red and updating live as picks happen. Each player's nine per-game category values (`cv`, stored in `player-data.js`) are BM-style z-scores against the frozen 225-player 2025-26 reference population (the 2026-09-12 derivation; the 26 players added 2026-09-13 who appeared in 2025-26 are z-scored on that same scale so every value stays comparable), in CATS9 order (PTS/REB/AST/STL/BLK/3PM/FG%/FT%/TO); FG%/FT% are volume-weighted and TO is inverted so positive means fewer turnovers. Replacement level is the mean `cv` of consensus ranks 150–170. It is a depletion gauge against last season's per-game production, not a projection model or a nine-category team evaluation.

## Recent on prod (2026-09-20)

- **ADP rank fix** — built-in pool order re-inserted players buried vs Yahoo ADP (`rank − round(ADP) ≥ 40`); pathological ≥100 gaps cleared. Details in `CHANGELOG.md`.
- **UX polish** — single mint dark theme; calmer live-draft density; mid-draft board + grades; aria-live turn status; tap-friendly INJ and scarcity intel. Engine and `PLAYERS` data unchanged in the UX PR.

## Recent on preview (2026-09-20)

Live at **[tony-draft-lab-preview.pages.dev](https://tony-draft-lab-preview.pages.dev)** — **not** on prod `tony-draft-lab.pages.dev`:

- **Pick coach** — advisory TypeSafe/Jev with **lean** band (TEMPORARY 0.25–0.45 outline chips); softFail / unavailable still shows mover/role (and vacated) why; `feat-*` soft-fails may use labeled **Stub** (never as Jev). See `docs/pick-coach.md`.
- **Movers / role outlook (phase 1)** — 71 real `teamPrev`→`teamCurr` movers; quiet NEW + ↑/↓ role chips (roleDelta is ADP-vs-last heuristic). No `projMpg`/`projRank`. See `docs/movers-outlook.md`.
- **Vacated usage (phase 2)** — curated `vacatedGainers` for **22** high-ADP movers; one quiet Pick coach line `Vacates usage → …` (also on softFail). Not a BM scrape. See `docs/vacated-usage.md`.

## Feature notes

- **Minutes per game** — every available-player row shows the player's 2025-26 MPG from Basketball-Reference (250 of 269 players; 19 show "—": injured stars and players who did not appear in 2025-26, e.g. incoming draft prospects).
- **Draft grades** — the Grades tab scores every team by summing 2025-26 per-game category values (`cv`) across the full roster (players without 2025-26 data, e.g. injured stars and prospects, count at replacement level — the mean `cv` of consensus ranks 150–170 — and are flagged †N), ranks 1–12, and assigns letter grades by standard deviation from the mean. The **Category matchup** column compares each CPU team to your roster category-by-category on 2025-26 z-scores (not projected totals): green = you win the category, yellow = even (within 0.5), red = they win it, with a wins-losses tally. Bench and starters are weighted equally; injuries, playoff schedule, and projected 2026-27 role changes are not factored in.

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

Pool expansion (2026-09-13): 32 add-candidate players with Yahoo ADPs from Hashtag Basketball's 2026-27 table (Yahoo columns, updated 11 September 2026) joined the pool (237 → 269). Teams cross-checked against second sources (15 moved/returning players verified, e.g. Lillard POR, Holiday POR, McCollum ATL, Kuminga MIN). For the 26 who appeared in 2025-26, `cv`/`lastTotal` were derived against the frozen 2026-09-12 reference population and `last` taken from Basketball Monster's NBA 25-26 per-game ranks; the 6 DNP/prospects carry nulls per the existing convention. Insertion rule: positional merge by Yahoo ADP (built-in rank = round-half-up ADP; ties broken by lower ADP then candidate-list order; existing players keep relative order). Audit after expansion: **269 players; 0 errors; 74 missing ADP (unchanged); 35 missing per-game ranks; 18 missing totals ranks; 18 missing category values; 19 missing MPG; 10 untagged; 0 placeholder teams**. These checks establish internal consistency only: they do not prove completeness against the NBA player universe.

Data refresh (2026-09-12): Yahoo ADP, NBA team, and Yahoo position eligibility refreshed from Hashtag Basketball's 2026-27 ADP table (Yahoo columns, updated 11 September 2026) for all 237 players: **237 players; 155 ADPs changed (8 gained ADP, none lost); 104 teams changed; 94 position sets changed; 74 still without a published Yahoo ADP; 29 missing prior-season per-game ranks; 12 missing totals ranks; 12 missing category values; 0 placeholder teams**. Historical 2025-26 `last`, `lastTotal`, and `cv` fields were preserved untouched. These checks establish internal consistency only: they do not prove completeness against the NBA player universe.

- `data-health.js` — shared browser/Node audit logic.
- `audit-data.js` — reproducible audit of the actual bundled player, category, and ADP data.
- `test-data-health.js` — failure-case checks and bundled record coverage gate.
