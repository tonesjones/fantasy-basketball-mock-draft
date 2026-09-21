# Fantasy Basketball Mock Draft Simulator

A static, single-page mock draft trainer for Yahoo-style fantasy basketball. Use it at **[tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev)** (Cloudflare Pages, `main`), or open `index.html` locally — no build step, server, or external dependency.

> **Nine-category leagues only.** Every rank, value, grade, and scarcity number in this app is computed from nine-category (PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, TO) production. It is not a points-league tool — points leagues score on a completely different formula and would need a different dataset, so do not use these ranks or grades for one.

## How to use

### Setup

On the setup screen, choose:

- **Draft position** — your slot in the 12-team snake (1–12).
- **Rounds** — roster size, 10–15 rounds.
- **Playoff window** — the three Yahoo weeks your league's fantasy playoffs cover (W18–20 through W21–23; W20–22 is Yahoo's public-league default). This drives the per-player playoff schedule badges and your roster's playoff-games summary.

Press **Start draft**. Your picks are marked; the 11 CPU teams draft automatically between your turns using Yahoo ADP as their market signal, with a small seeded variation so no two drafts are identical.

### During the draft

- **Available players** — search stays primary. Position filters and sort chips (Rank, ADP, last season, MPG, scarcity, Consensus) sit behind a progressive-disclosure panel so the list stays calm; pages of 50 with an honest filtered count.
- Each row shows the player's **MPG** (2025-26 minutes per game), Yahoo ADP, built-in rank, last-season nine-cat rank, position eligibility, team, a red **INJ** badge if currently injured (tap or hover for details), and a color-coded **playoff badge** (bad/ok/good) for games in your selected playoff window.
- **Preview only** ([tony-draft-lab-preview](https://tony-draft-lab-preview.pages.dev)): quiet **NEW** (team change) and **↑ role** / **↓ role** chips. Role chips are a heuristic (Yahoo/Fantrax ADP vs last-season rank), not projections — see `docs/movers-outlook.md`. **Not** on prod.
- Click a player on your turn to draft them. **Undo my last pick** reverses your most recent decision. An aria-live region announces your pick, CPU batches, and draft complete.
- **Category scarcity** is collapsed by default with a quiet hottest-cats summary; open it for the full green→red depletion gauge. Tap or keyboard a category chip for its top remaining contributors (not hover-only).
- **Draft board** and **Grades** tabs are available mid-draft (not only after the draft completes). Board: every pick, round by round. Green **+12** = value (picked 12 spots later than ADP); red **-8** = reach (picked 8 spots earlier); no number = at ADP or no ADP data.

### After the draft

- **My team** — your roster in Yahoo-style slots, your playoff-games summary, and a per-player playoff schedule table for your chosen window.
- **Draft board** — the full board with the value/reach legend underneath (same tab you can open mid-draft).
- **Grades** — all 12 teams scored by summing 2025-26 per-game category values across the full roster (players without 2025-26 data count at replacement level, marked †N), ranked 1–12 with letter grades (A+ to F). The **Category matchup** column shows your historical category-value tally against each CPU team (e.g. **7-2**) plus each category (FG% FT% 3PM PTS REB AST STL BLK TO) colored green (you win it), yellow (even), or red (they win it); hover for the exact values. This is a comparison of 2025-26 z-scores, not projected category totals.

### On mobile

The layout collapses to a single column with compact two-line player rows; filters, scarcity, INJ detail, tabs, and the draft board work the same as on desktop (tap targets for intel that used to be hover-only). Draft state saves in the browser via `localStorage`, so a refresh mid-draft resumes where you left off (browser saving can vary for local `file://` URLs — prefer the hosted app or serve the folder over HTTP). Use **Clear saved draft** or **Restart** to begin fresh.

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
- `player-data.js` — ADP, prior-season ranks, per-game category values (`cv`), and minutes per game (`mpg`) merged into the player pool on load.
- `movers-outlook.js` — phase-1 overlay: real movers + heuristic `roleDelta` (preview only; 71 movers; no proj fields); see `docs/movers-outlook.md`.
- `playoff-data.js` — Yahoo weekly schedule snapshot (all 30 teams × weeks 18–23, Mar 1 – Apr 11, 2027).
- `playoff-core.js` — playoff game counts, totals, summaries, and the bad/ok/good quality rule.
- `data-health.js` — shared browser/Node audit logic.
- `audit-data.js` — reproducible audit of the actual bundled player, category, and ADP data.
- `test-draft-core.js`, `test-data-health.js`, `test-playoff-core.js`, `test-draft-grades.js`, `test-draft-simulation.js` — automated checks (run with `node <file>`).
- `scripts/` — `build-widget.py` (rebuilds the standalone in-chat widget), `build-playoff-data.py` and `import-playoff-schedule.py` (playoff schedule refresh).
- `CHANGELOG.md` — dated change log. `OPEN-ME.txt` / `desktop-changes.patch` — desktop handoff notes.

## Pick coach

Advisory-only **Pick coach** side tab (your turn only). Code is on `main`.
**Live TypeSafe/Jev** runs on preview **[tony-draft-lab-preview.pages.dev](https://tony-draft-lab-preview.pages.dev)** (`TYPESAFE_API_KEY` on that Pages project). It is **not** on prod **[tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev)** — do not treat prod as a live coach.

- Source labels: **Jev** | **Stub · offline** (`file://`) | **Unavailable** (soft fail / no secret on host)
- Never auto-drafts; never runs for CPU picks

See **`docs/pick-coach.md`** for secret setup, pinned model (`jev-1.13.0`), CORS, payload, and UX contract.

## Run it

Primary: **[https://tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev)** (deploys from `main`).

Local: open `index.html` directly, or serve this folder with any static server. Draft state is stored only in the browser that created it. A `DATA_VERSION` bump (most recently `2026-09-20`, when built-in ranks were reconciled to Yahoo ADP for buried outliers — see `CHANGELOG.md`) invalidates older saved drafts.

Run the logic checks with:

```bash
node test-draft-core.js
node test-data-health.js
node test-playoff-core.js
node test-draft-grades.js
```

## Data notes

`player-data.js` contains the data provenance and generation date. The app validates saved state against that date, so an old saved draft is not silently applied to a newly refreshed player data set.

The category-scarcity panel shows, for each of the nine categories, the share of draftable above-replacement per-game category value still on the board, color-coded green → red and updating live as picks happen. Each player's nine per-game category values (`cv`, stored in `player-data.js`) are BM-style z-scores against the frozen 225-player 2025-26 reference population (the 2026-09-12 derivation; the 26 players added 2026-09-13 who appeared in 2025-26 are z-scored on that same scale so every value stays comparable), in CATS9 order (PTS/REB/AST/STL/BLK/3PM/FG%/FT%/TO); FG%/FT% are volume-weighted and TO is inverted so positive means fewer turnovers. Replacement level is the mean `cv` of consensus ranks 150–170. It is a depletion gauge against last season's per-game production, not a projection model or a nine-category team evaluation.

## Recent on prod (2026-09-20)

- **ADP rank fix** — built-in pool order re-inserted players buried vs Yahoo ADP (`rank − round(ADP) ≥ 40`); pathological ≥100 gaps cleared. Details in `CHANGELOG.md`.
- **UX polish** — single mint dark theme; calmer live-draft density; mid-draft board + grades; aria-live turn status; tap-friendly INJ and scarcity intel. Engine and `PLAYERS` data unchanged in the UX PR.

## Recent on preview (2026-09-20)

Live at **[tony-draft-lab-preview.pages.dev](https://tony-draft-lab-preview.pages.dev)** — **not** on prod `tony-draft-lab.pages.dev`:

- **Pick coach** — advisory TypeSafe/Jev (see `docs/pick-coach.md`).
- **Movers / role outlook (phase 1)** — 71 real `teamPrev`→`teamCurr` movers; quiet NEW + ↑/↓ role chips (roleDelta is ADP-vs-last heuristic). No `projMpg`/`projRank`. See `docs/movers-outlook.md`.

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
