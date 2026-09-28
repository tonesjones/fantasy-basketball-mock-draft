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
- **Vacated usage (preview / branch):** for ~22 high-ADP movers, Pick coach shows one quiet line naming who on the old team likely gains touches/minutes (`docs/vacated-usage.md`). Curated — not a BM scrape. **Not** on prod.
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

- `index.html` — page shell: loads `styles.css` and the scripts below in order.
- `styles.css` — all styling; the final "Geist theme" layer sets the look (tokens at the top of that layer).
- `fonts/` — self-hosted Geist Sans and Geist Mono (SIL OFL, see `fonts/OFL.txt`), so the app still needs no network.
- `app.js` — UI: state, rendering, event wiring, save/restore.
- `player-pool.js` — the player pool (rank order, positions, teams, category tags) merged with `player-data.js`.
- `draft-analysis.js` — pure consensus rank, category replacement levels, draft grades and matchups (used by the app and tests).
- `draft-core.js` — dependency-free validation, roster matching, seeded random source, and CPU selection. It is also usable from Node for tests.
- `player-data.js` — ADP, prior-season ranks, per-game category values (`cv`), and minutes per game (`mpg`) merged into the player pool on load.
- `movers-outlook.js` — phase-1 overlay: real movers + heuristic `roleDelta` (preview only; 71 movers; no proj fields); see `docs/movers-outlook.md`.
- `vacated-usage.js` — phase-2 curated `vacatedGainers` for ~22 high-ADP movers (Pick coach quiet line); see `docs/vacated-usage.md`.
- `playoff-data.js` — Yahoo weekly schedule snapshot (all 30 teams × weeks 18–23, Mar 1 – Apr 11, 2027).
- `playoff-core.js` — playoff game counts, totals, summaries, and the bad/ok/good quality rule.
- `_worker.js` — Cloudflare Pages worker: serves the site and proxies `/api/pick-quality` to TypeSafe/Jev (origin check, body cap, per-IP rate limit).
- `data-health.js` — shared browser/Node audit logic.
- `audit-data.js` — reproducible audit of the actual bundled player, category, and ADP data.
- `test-*.js` — automated checks; run them all with `npm test`. `test-worker.js` covers the `/api/pick-quality` abuse guard.
- `run-tests.js`, `package.json` — test runner and `npm test` / `npm run format` scripts; `.github/workflows/test.yml` runs them in CI.
- `scripts/` — `load-data.js` (loads the bundled data in Node for tests/audit), `build-widget.py` (rebuilds the standalone in-chat widget), `build-playoff-data.py` and `import-playoff-schedule.py` (playoff schedule refresh).
- `CHANGELOG.md` — dated change log. `OPEN-ME.txt` — desktop handoff notes.

## Pick coach

Advisory-only **Pick coach** side tab (your turn only). Code is on `main`.
**Live TypeSafe/Jev** runs on preview **[tony-draft-lab-preview.pages.dev](https://tony-draft-lab-preview.pages.dev)** (`TYPESAFE_API_KEY` on that Pages project). It is **not** on prod **[tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev)** — do not treat prod as a live coach. Branch / `feat-*` aliases need the secret in the CF **Preview** environment (Production secrets alone are not enough).

Confidence bands (TEMPORARY client gates): **suggest** ≥ 0.45; **lean** ≥ 0.25 (outline `Lean take|wait|reach`); below that “Not sure enough…”. SoftFail stays uncertain. QA on preview/local hosts: `?leanDemo=1`. Details: `docs/pick-coach.md`.

- Source labels: **Jev** | **Stub** (preview soft-fail QA) | **Stub · offline** (`file://`) | **Unavailable**
- Soft-fail / unavailable still shows mover/role why when applicable; preview soft-fails may use labeled stub (never as Jev)
- Never auto-drafts; never runs for CPU picks

See **`docs/pick-coach.md`** for secret setup (Production vs Preview), pinned model (`jev-1.13.0`), CORS, payload, and UX contract.

## Run it

Primary: **[https://tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev)** (deploys from `main`).

Local: open `index.html` directly, or serve this folder with any static server. Draft state is stored only in the browser that created it. A `DATA_VERSION` bump (most recently `2026-09-20`, when built-in ranks were reconciled to Yahoo ADP for buried outliers — see `CHANGELOG.md`) invalidates older saved drafts.

Run every logic check with:

```bash
npm test        # or: node run-tests.js
```

Format the engine modules with `npm run format`. GitHub Actions runs a format check, the test suite and `audit-data.js` on every push to `main` and every pull request.

## More docs

- `docs/data-and-methodology.md` — category values, scarcity math, grades, data-health audit and refresh history
- `docs/pick-coach.md` — Pick coach design, secrets, rate limiting
- `docs/movers-outlook.md`, `docs/vacated-usage.md`, `docs/punt-strategy-plan.md` — feature designs
- `CHANGELOG.md` — dated change log
