# Fantasy Basketball Mock Draft Simulator

A mock draft trainer for Yahoo-style fantasy basketball. It is one static page with no build step, server, or network dependency. Use the hosted app at [tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev), which Cloudflare Pages deploys from `main`, or open `index.html` locally.

> **Nine-category leagues only.** Every rank, value, grade, and scarcity number comes from nine-category production: PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, and TO. Points leagues score on a different formula and need different data, so don't use these ranks or grades for one.

## Run a draft

### Set up

On the setup screen, choose:

- **Draft position.** Your slot in the 12-team snake, 1 to 12.
- **Rounds.** Roster size, 10 to 15 rounds.
- **Playoff window.** The three Yahoo weeks your fantasy playoffs cover, from W18–20 to W21–23. Yahoo public leagues use W20–22. The window drives each player's playoff badge and your roster's playoff-games summary.

Click **Start draft**. The 11 CPU teams pick between your turns from consensus ADP, a blend of Yahoo and Fantrax. Their picks vary more the later a player's ADP, so no two drafts come out the same.

### Draft

- To draft a player, click the player on your turn. **Undo my last pick** reverses your most recent pick.
- The **Available players** list puts search first. Position filters and sort chips sit under **Filters & sort**. The list shows 50 players per page with the true filtered count.
- Each row shows MPG (2025-26 minutes per game), Yahoo ADP, Draft Lab rank, last season's nine-cat rank, positions, and team. A red **INJ** badge marks a current injury; tap or hover it for details. The playoff badge is red, yellow, or green by games in your playoff window.
- To punt, pick up to three categories in the punt chips. Any of the nine qualifies, TO included. Once you punt, a **Punt value** sort ranks players without those categories.
- **Category scarcity** starts collapsed with a one-line summary of the scarcest categories. Open it for the full depletion gauge. Tap a category chip, or select it with the keyboard, to list its top remaining players.
- The **Draft board** and **Grades** tabs work mid-draft. The board lists every pick by round. A green **+12** means the player went 12 picks later than ADP, a value. A red **-8** means 8 picks earlier, a reach. No number means the pick matched ADP or the player has no ADP.
- A screen-reader live region announces your picks, each CPU batch, and the end of the draft.

The preview site, [tony-draft-lab-preview.pages.dev](https://tony-draft-lab-preview.pages.dev), adds two features that are not on the production site:

- **NEW** marks a player who changed teams. **↑ role** and **↓ role** compare a player's Yahoo and Fantrax ADP with last season's rank. They are a heuristic, not a projection. See `docs/movers-outlook.md`.
- For about 22 high-ADP players who changed teams, Pick coach names who on the old team likely gains minutes and shots. The list is hand-curated. See `docs/vacated-usage.md`.

### Review your draft

- **My team** shows your roster in Yahoo-style slots, your playoff-games summary, and a playoff schedule for each player.
- **Draft board** shows the full board with the value and reach legend.
- **Grades** ranks all 12 teams with letter grades from A+ to F. Each grade sums the 2025-26 per-game category values of the full roster. A player with no 2025-26 data counts at the value his ADP implies and carries a **†** mark. The **Category matchup** column shows how many categories you win against each CPU team, such as **7-2**, then colors each category green (you win), yellow (even), or red (they win). Hover a category for the values. These compare last season's z-scores. They are not projected totals.

### Draft on a phone

Phones get their own draft room with four bottom tabs:

- **Players**, with a collapsed **Past ADP** row.
- **My team**: roster, category snapshot, and draft board.
- **Analysis**: your grade and your category score against each opponent.
- **Punts**: the same punt advice and riser lists as desktop. Changes apply when you click **Commit**.

Category scarcity is desktop only. Tap a player to open a sheet with coach advice, category strengths, and 2025-26 per-game averages. See `docs/mobile-ui.md`.

### Resume or restart

The browser saves the draft in `localStorage`, so a refresh mid-draft picks up where you left off. Saving can fail on `file://` URLs. Use the hosted app or serve the folder over HTTP instead. To start over, click **Clear saved draft** or **Restart**.

## How the engine works

- CPU teams draft from consensus ADP (`DraftCore.marketRank`), the mean of Yahoo and Fantrax ADP. Each platform's thin late-draft tail counts for less, so a Fantrax 240 can't drag a Yahoo 79 down to pick 160.
- Seeded noise of ±20% of ADP, at least ±1.5 picks, varies each draft. The seed is saved, so a saved draft replays the same way.
- The **Rank** column is generated, not hand-ranked. `scripts/rebuild-rank.js` starts from consensus ADP and moves each player up to 20 spots toward his 2025-26 nine-cat production.
- The engine rejects duplicate and invalid picks.
- Roster matching puts each player in the most specific open slot he qualifies for and reshuffles when needed. Players past the last slot go under **Overflow**.
- The saved session holds the setup, the pick log, the random state, and the data version.

## Pick coach

Pick coach is an advisory side tab that appears on your turn. It never drafts for you and never runs for CPU picks. The code is on `main`, but only the preview site runs the live coach, TypeSafe's Jev model. The production site does not. The preview Pages project holds the `TYPESAFE_API_KEY` secret. Branch and `feat-*` alias URLs also need that secret in the Cloudflare **Preview** environment. A Production secret alone does not reach them.

The client sorts each verdict by confidence. These thresholds are temporary:

- 0.45 and above shows a suggestion.
- 0.25 to 0.45 shows a lean, labeled `Lean take`, `Lean wait`, or `Lean reach`.
- Below 0.25 shows "Not sure enough". A soft fail also counts as uncertain.

Each verdict carries a source label:

- **Jev agrees**, **Jev disagrees**, or **Jev undecided**: Jev's own take compared with the engine's verdict.
- **Jev**: the older code path.
- **Stub**: a labeled placeholder when the preview soft-fails, for QA. It is never shown as Jev.
- **Stub · offline**: the page runs from `file://`.
- **Unavailable**: no verdict. The mover and role reasons still show when they apply.

To test lean verdicts on a preview or local host, add `?leanDemo=1` to the URL. `docs/pick-coach.md` covers secret setup, the pinned model (`jev-1.13.0`), CORS, the request payload, and the UI contract.

## Develop
Local: open index.html directly, or serve this folder with any static server. Draft state is stored only in the browser that created it. Each data refresh bumps `DATA_VERSION` in `app.js`, which drops older saved drafts. The current version is `2026-10-06`. Yahoo and Fantrax ADP use Hashtag Basketball's 6 October table. See `docs/data-refresh-2026-10-06.md` for changes and injury-review limitations.

Run every logic check:

```bash
npm test        # or: node run-tests.js
```

Format the engine modules with `npm run format`. On every push to `main` and every pull request, GitHub Actions runs `npm run format:check`, the tests, and `audit-data.js`.

### Data version

Each data refresh bumps `DATA_VERSION` in `app.js`, which drops older saved drafts. The current version is `2026-09-29b`. It uses Yahoo ADP from the 29 Sep workbook and Fantrax ADP from Hashtag's 25 Sep table. See `docs/data-refresh-2026-09-29.md`.

### Preview cleanup

Every branch push builds a preview in each of the three Pages projects: `tony-draft-lab`, `tony-draft-lab-yahoo`, and `tony-draft-lab-preview`. When a PR closes, `.github/workflows/cleanup-previews.yml` runs `scripts/cleanup-pages-previews.js` to delete that branch's preview deployments. It never touches production. The workflow needs two repo secrets:

- `CLOUDFLARE_API_TOKEN`, a token with **Cloudflare Pages: Edit**.
- `CLOUDFLARE_ACCOUNT_ID`.

To clean up an older branch, run the workflow from the Actions tab and enter the branch name. Tick **dry run** to list the deployments before deleting them.

## Files

Page and styles:

- `index.html`: the page shell. Loads `styles.css` and the scripts in order.
- `styles.css`: all desktop styling. The last layer, the Geist theme, sets the look, with its tokens at the top of that layer.
- `mobile.css`: phone layout tokens, pick header, rows, and nav. See `docs/mobile-redesign.md`.
- `mobile-sheet.css`: the phone player sheet.
- `mobile-approved.css`: the phone draft room's tabs, Analysis, Punts, and finished-draft screens.
- `fonts/`: self-hosted Geist Sans and Geist Mono under the SIL OFL (`fonts/OFL.txt`), so the app needs no network.

App code:

- `app.js`: UI state, rendering, event wiring, save, and restore.
- `fx.js`: an optional pointer spotlight. Off for reduced motion and touch.
- `draft-core.js`: pick validation, roster matching, the seeded random source, and CPU selection. No dependencies, so tests load it in Node.
- `draft-analysis.js`: consensus rank, category replacement levels, grades, and matchups.
- `punt-core.js`: punt selection, up to three categories, and punt-adjusted ranks.
- `playoff-core.js`: playoff game counts, totals, summaries, and the red, yellow, and green badge rule.
- `pick-coach.js`, `pick-signals.js`: Pick coach verdicts and the signals behind them.
- `_worker.js`: the Cloudflare Pages worker. Serves the site and proxies `/api/pick-quality` to Jev with an origin check, a body size cap, and a per-IP rate limit.

Data:

- `player-pool.js`: the player pool: rank order, positions, teams, and category tags.
- `player-data.js`: ADP, last season's ranks, per-game category values (`cv`), and minutes per game (`mpg`), merged into the pool on load.
- `player-averages.js`: 2025-26 per-game averages for the phone player sheet. Loads the first time a phone opens a sheet.
- `playoff-data.js`: Yahoo's weekly schedule for all 30 teams, weeks 18 to 23 (Mar 1 to Apr 11, 2027).
- `movers-outlook.js`: the team-change and role overlay for 71 players. Preview only. See `docs/movers-outlook.md`.
- `vacated-usage.js`: the hand-curated `vacatedGainers` list for about 22 players. See `docs/vacated-usage.md`.

Checks and tooling:

- `data-health.js`: audit logic shared by the browser and Node.
- `audit-data.js`: a reproducible audit of the bundled player, category, and ADP data.
- `test-*.js`: the automated checks. `test-worker.js` covers the `/api/pick-quality` guard.
- `run-tests.js`, `package.json`: the test runner and the `npm` scripts. `.github/workflows/test.yml` runs them in CI.
- `scripts/load-data.js`: loads the bundled data in Node for tests and the audit.
- `scripts/refresh-adp.js`, `scripts/hashtag-adp-to-csv.js`: refresh ADP from Yahoo or a Hashtag CSV. Never from ESPN.
- `scripts/generate-movers.js`: builds the movers and role overlay.
- `scripts/rebuild-rank.js`: regenerates the built-in Rank order.
- `scripts/build-playoff-data.py`, `scripts/import-playoff-schedule.py`: refresh the playoff schedule.
- `scripts/build-widget.py`: rebuilds the standalone in-chat widget.
- `scripts/data-provenance/`: dated records of each data refresh.

## Yahoo live draft

Draft Lab can follow your own Yahoo mock or live draft. On the setup screen, click **Sign in with Yahoo**, paste the draft-room URL, and click **Connect draft**. Draft Lab finds your team and pick, mirrors the board, and gives advice while you pick in Yahoo. Anyone with a Yahoo account can sign in. Each person's draft is read with their own Yahoo account, through the `yahoo-draft-copilot` Cloudflare Worker. See `tools/yahoo-copilot/worker/README.md` for setup and `tools/yahoo-copilot/README.md` for the command-line copilot.

## More docs

- `docs/data-and-methodology.md`: category values, scarcity math, grades, the data audit, and refresh history.
- `docs/adp-rankings-review-2026-09-28.md`: a graded review of the ADP and ranking pipeline, and how to refresh it.
- `docs/pick-coach.md`: Pick coach design, secrets, and rate limiting.
- `docs/yahoo-worker-plan.md`, `docs/yahoo-draft-copilot-approach.md`, `docs/yahoo-copilot-review-2026-10-03.md`: Yahoo live-draft design and review.
- `docs/movers-outlook.md`, `docs/vacated-usage.md`, `docs/punt-strategy-plan.md`: feature designs.
- `CHANGELOG.md`: the dated change log. `OPEN-ME.txt` holds desktop handoff notes.
