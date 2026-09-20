# Changelog

Covers the working copy at
`github.com/tonesjones/fantasy-basketball-mock-draft` on `main`.
Pushes happen on demand, so the newest entries here may be ahead of the
remote.

## Pick coach real TypeSafe/Jev hook (2026-09-20)
- **API** — Cloudflare Pages Function `functions/api/pick-quality.js`:
  `POST /api/pick-quality` → TypeSafe `POST https://api.typesafe.ai/v1/systemone`
  with Bearer `TYPESAFE_API_KEY`, model `jev-latest`, Score (0–4) + Choice
  take|wait|reach (spike `pick_quality_jev.py` semantics). Suggest only if both
  confidences ≥ 0.7. Fail-soft HTTP 200 + `verdict: uncertain` + `error` on
  missing key / timeout / API error. Never logs the API key.
- **Client** — `pick-coach.js` prefers `/api/pick-quality`; soft API failures
  stay uncertain (no silent stub). `file://` / network `TypeError` → stub with
  `model: "stub"` so offline `index.html` still works. Debounce + abort stale.
- **Docs** — `docs/pick-coach.md`: Pages secret + `wrangler pages dev` local
  preview. **No** merge / **no** `tony-draft-lab` production deploy in this PR.

## Pick coach advisory panel + stub (2026-09-20)
- **UX** — new side-panel tab **Pick coach** (`data-view="coach"`) next to
  My team / Draft board / Grades. Mint theme / density aligned with Draft Lab
  polish (#2). Panel shell `#pick-coach` with `.pc-empty` / `.pc-wait` /
  `.pc-loading` / `.pc-card` (`.pc-suggest` | `.pc-uncertain`) hooks for UX.
- **Behavior** — usable on the user's turn only; CPU turn shows muted
  “Available on your turn.” Focuses selected available player (else first
  visible filtered row); updates on search/filter/click. Shows name, pick #,
  ADP/rank, score words, take|wait|reach, one-line why, quiet confidence.
  Low confidence / UNCERTAIN → muted “Not sure enough to suggest” — no red
  badges, list chips, or banners. **Never auto-drafts.**
- **Data** — `pick-coach.js` stub `PickCoach.evaluate` / `pickCoachEvaluate`
  (ADP vs pick#, bias low confidence so UNCERTAIN is default). Stub pending
  real TypeSafe/Jev `/api/pick-quality` hook.
- Docs: `docs/pick-coach.md`. No PLAYERS / DATA_VERSION / draft-engine changes.
  No production deploy in this PR.
- **Polish** — take/wait/reach are quiet mint/muted/warm chips, suggest confidence is one percent, and the panel says “Advisory preview.”

## Draft Lab UX polish (2026-09-20)
- **One theme** — unified on the Draft Lab mint dark system; hatch blue
  accent / focus rings and light-theme value badges no longer fight mint.
- **Calmer live draft** — position filters and sort chips sit behind a
  progressive-disclosure panel; category scarcity is collapsed by default
  with a quiet hottest-cats summary (capability retained).
- **Mid-draft board + grades** — Draft board and Grades tabs are available
  during the live draft (not only after complete); board/grades glance
  gets a bit more side-column weight.
- **aria-live turn status** — polite live region announces your pick, CPU
  pick batches after sim/advance, and draft complete.
- **Touch-friendly intel** — INJ badge expands detail on tap; scarcity
  category chips expand top contributors on tap/keyboard (not hover-only).
- `index.html` UI/CSS only; PLAYERS order, built-in ranks, DATA_VERSION, and
  draft-core engine semantics unchanged.

## Built-in rank vs Yahoo ADP gap fix (2026-09-20)
- **Rule** — single-pass re-insert of players with a published Yahoo ADP
  whose built-in rank is buried vs market: `(r − round-half-up(ADP)) ≥ 40`.
  Each outlier is spliced to index `round-half-up(ADP)` (same insertion rule
  as the 2026-09-13 pool expansion). Non-outlier players keep their exact
  relative order. Players ranked *early* vs ADP (possible intentional
  build-vs-market, e.g. Mikal Bridges, Ja Morant, Devin Vassell, Deandre
  Ayton) are left alone.
- **Why** — after ADP refreshes, 27 players had |rank − ADP| ≥ 100 (worst:
  Luke Kornet 265 vs 87.5, Adem Bona 260 vs 85.4, Aaron Nesmith 246 vs 75.3).
  Those were insertion/staleness bugs relative to the project's own rule,
  not justified injuries or minutes cases. Do **not** blindly set every
  rank = ADP; only buried outliers were moved.
- **Result** — 64 buried outliers re-inserted; gaps ≥100: 27 → 0; gaps ≥40:
  68 → 55 (remaining are mostly displacement of mid-board players into the
  dense 90–125 ADP band, still review signals). Flagged pathological cases
  now sit near round(ADP): Kornet 265→88, Bona 260→85, Nesmith 246→82,
  Clingan 190→41, Boozer 196→63, etc.
- **DATA_VERSION** — `2026-09-18` → `2026-09-20` (invalidates saved drafts).
- `player-data.js` ADP/stats unchanged; only `PLAYERS` order in `index.html`
  (which defines built-in rank) and this changelog entry.

## Pool expansion 237 → 269 (2026-09-13)
- **32 add-candidate players added** — every player with a Yahoo ADP in
  Hashtag Basketball's 2026-27 table (updated 11 September 2026) that was
  missing from the pool, from AJ Green (49.8) to Jonathan Kuminga (123.3).
  Team and Yahoo position eligibility from the same table; 15
  moved/returning players cross-checked against second sources.
- **Same-scale historical stats** — for the 26 who appeared in 2025-26,
  `cv` and `lastTotal` were derived against the frozen 2026-09-12
  225-player reference population (same Basketball-Reference totals, same
  league averages, same means/SDs), so all 237 pre-existing values are
  byte-identical and the new z-scores are directly comparable. `last` is
  Basketball Monster's NBA 25-26 per-game rank. The 6 DNP/prospects
  (Lillard, Queen, Mara, Graves, Lendeborg, Morez Johnson Jr.) carry nulls
  per the existing convention and stay untagged.
- **Insertion rule** — positional merge by Yahoo ADP: built-in rank =
  round-half-up(ADP); ties broken by lower ADP, then candidate-list order;
  all 237 existing players keep their exact relative order. Max
  |rank − round(ADP)| over the 32 is 4 (tie spillover in the dense
  115–123 ADP cluster).
- **Audit after expansion** — 269 players, 0 errors; 74 missing ADP
  (unchanged); 35 missing per-game ranks; 18 missing totals ranks;
  18 missing category values; 19 missing MPG; 10 untagged; 0 placeholder
  teams. All node tests pass; widget rebuilt.
- Not yet pushed to GitHub; awaiting approval.

## Accuracy fixes (2026-09-12, afternoon)
- **Draft grades: replacement-level fill** — players without 2025-26
  category values (injured stars, prospects) no longer vanish from the
  score; they count at replacement level (mean `cv` of consensus ranks
  150–170, same baseline as scarcity). Teams with filled players show a
  †N marker with a tooltip; every roster now scores all its picks.
- **CPU ADP fallback** — no-ADP players no longer fall back to the stale
  built-in rank +45. The CPU market estimate is now the median of available
  2025-26 totals rank, per-game rank, and built-in rank (the +45 uncertainty
  penalty applies only to players with no 2025-26 data at all, i.e.
  prospects). New `marketRank()` in `draft-core.js`, covered in
  `test-draft-core.js`.
- **Category tags derived from cv** — the manual `CATS` strength tags are
  replaced by tags derived from per-game category values (top 4 categories
  with cv > 0). 225 of 237 players tagged from data; 8 without 2025-26 data
  keep a manual fallback (marked in the source); 4 zero-data prospects
  remain untagged. Untagged count in the data-health audit: 30 → 4.
- **Honest grades labeling** — the "vs You" column is now "Category
  matchup" and is labeled a historical category-value comparison
  (2025-26 z-scores), not projected category totals.

## Minutes per game + draft grades (2026-09-12)
- **New `mpg` field** — 2025-26 minutes per game for all 237 players, from
  Basketball-Reference's 2025-26 per-game table (collected 2026-09-12).
  224 players have values; 13 null (injured stars Haliburton/Irving/VanVleet,
  GG Jackson, 9 incoming 2026 draft prospects). Displayed as "MPG" in every
  available-player row. Validated by `data-health.js` (`missingMpg`).
- **Draft grades report** — new "Grades" tab on the draft-complete screen.
  Scores every team by summing 2025-26 per-game category values (`cv`)
  across the roster; ranks 1–12 with letter grades (A+ to F) from the
  score distribution. Your team is highlighted. Test: `test-draft-grades.js`.
- **Grades: "vs You" category matchup** (added same day) — each CPU team row
  shows your wins-losses tally against them plus per-category labels
  (FG% FT% 3PM PTS REB AST STL BLK TO) colored green (you win), yellow
  (even, within 0.5), red (they win); hover for exact values.
- **Draft board legend** (added same day) — explains the green/red +/-
  value-vs-ADP badges under the board.

## Fantasy playoff schedule (2026-09-12)
- **New `playoff-data.js`** — Yahoo weekly schedule snapshot (2026-27):
  per-team games for Yahoo weeks 18–23 (Mar 1 – Apr 11, 2027), transcribed
  from Hashtag Basketball's Yahoo grid fetched 2026-09-12; every team row
  cross-checked against the page's own games-total column. Refresh path:
  `scripts/import-playoff-schedule.py` (needs saved grid HTML),
  or `scripts/build-playoff-data.py` for the transcribed build.
- **New `playoff-core.js`** — `counts`/`total`/`summary` plus `rating`:
  2 games in any week = bad, 3 = ok, 4–5 = good.
- **index.html** — per-player playoff badge (color-coded bad/ok/good) on
  every available-player row; new sorts (Playoff W1/W2/W3/total);
  "Playoff games · your roster" summary with a per-player table;
  setup-screen three-week window picker (weeks 18–21 starts, default 20–22,
  matching Yahoo's public-league default playoff calendar).
- **Chat visibility fix** — the Courtside theme variables were declared on
  `:root`, so in chat the host page's accent color leaked in and the logo /
  "YOUR PICK" rendered nearly invisible. Variables are now scoped to `#md`,
  which overrides host values inside the widget; standalone is unchanged.
- Tests: `test-playoff-core.js` (data integrity + logic). All suites pass;
  audit: 237 players, 0 errors.
- Revision (2026-09-12, per Tony): dropped the Playoff W1/W2/W3/total sorts
  (the badge next to each player is enough); the three-week window picker is
  now chip buttons labeled W18–20 … W21–23 instead of a native select with
  raw dates (also fixes the select needing a held click in chat).

## Injury tags (2026-09-12)
- **New `INJ` data in `player-data.js`** — 9 pool players currently injured,
  researched from current (Sep 2026) reporting: Mark Williams (labrum,
  surgery Sep 10), Brandon Miller (shoulder), Cam Whitmore (DVT),
  Dereck Lively II (foot), Jimmy Butler (ACL), Moses Moody (patellar
  tendon), Donte DiVincenzo (Achilles), Shaedon Sharpe (meniscus),
  Jalen Suggs (knee). Each entry carries injury, evidence/context,
  expected return (honest "unknown" where unreported), and source.
- **Red INJ badge** next to injured players in the draft list, roster view,
  and draft log. Hovering shows the injury, context, expected return date,
  and source.
- **Retirement sweep: nothing to remove.** Russell Westbrook is not in the
  237-player pool at all; no pool player has retired (Batum only hinted).
  Pool stays 237, `DATA_VERSION` unchanged.

## Data refresh — Yahoo ADP / teams / eligibility (2026-09-12)
- **Refreshed from Hashtag Basketball's 2026-27 ADP table (Yahoo columns,
  updated 11 September 2026)** for all 237 players: 155 ADPs changed
  (8 players gained a published ADP, none lost one; 74 remain null),
  104 teams changed, 94 position-eligibility sets changed.
- Team changes include the summer's blockbusters (Giannis MIL→MIA,
  LeBron LAL→PHI, Kawhi LAC→TOR, Jaylen Brown BOS→PHI, Paul George
  PHI→BOS, Ja Morant MEM→POR, LaMelo Ball CHA→MIN) plus abbreviation
  normalization (SAS→SA, NYK→NY, PHX→PHO, NOP→NO, WSH→WAS, GSW→GS).
  All eight "—" placeholder teams resolved (2026 rookies now have teams).
- **Historical 2025-26 `last`, `lastTotal`, and `cv` fields preserved
  untouched.** No historical results replaced with projections.
- Player pool unchanged (237 players, same order) — `DATA_VERSION`
  unchanged, saved drafts remain valid.
- README and in-app Data Health text now describe the BM-style `cv`
  scarcity model and the refreshed sources.

## Category scarcity report (2026-09-12)
- **New per-game category values (`cv`).** Every player with 2025-26 stats
  now carries 9 BM-style per-game category values: z-scores across the 225
  sim players who appeared, in CATS9 order (PTS/REB/AST/STL/BLK/3PM/FG%/
  FT%/TO). FG%/FT% are volume-weighted ((pct − lgAvg) × att/G) before
  z-scoring; TO is inverted so positive = fewer turnovers. Computed from
  Basketball-Reference 2025-26 totals (lg FG% .471, FT% .783). The 12 players
  who didn't play in 2025-26 have none.
- **Rebuilt scarcity widget.** The old manual-tag counts are gone. Each
  category now shows the share of draftable above-replacement value still on
  the board, color-coded green → red, updating live as players are drafted.
  Replacement level = mean value of consensus ranks 150–170 (the end-of-draft
  tier). Hover a chip for the top remaining contributors in that category.
- `data-health.js` now validates `cv` (9 finite numbers); the audit lists the
  12 players without one under `missingCv`.

## Codex refresh (commit 7322391)

- New `draft-core.js`: shared draft engine used by both the page and the Node
  tests — snake order, roster-slot assignment (augmenting-path matching so
  multi-eligible players slot correctly), CPU pick logic driven by ADP with
  positional need and seeded randomness.
- Available-player pagination fix (50 players per page).
- New `data-health.js` + `audit-data.js`: bundled-data audit that flags missing
  ADP / last-season ranks, orphan data records, and big rank-vs-ADP gaps.
  Run with `node audit-data.js`.
- Styling refresh.
- Tests: `test-draft-core.js`, `test-data-health.js`,
  `test-draft-simulation.js` — run with `node test-*.js`, all pass.

## 2025-26 nine-cat totals toggle (commit 9f26b1a)

- New `lastTotal` field in `player-data.js`: final 2025-26 nine-category TOTAL
  (cumulative-season) rank per player.
- **Derived, not published.** No site publishes a 2025-26 totals 9-cat rank
  (Basketball Monster shows per-game only; Hashtag's TOTAL column is not a
  cumulative rank). Computed from Basketball-Reference 2025-26 regular-season
  totals: nine categories (PTS, 3PM, REB, AST, STL, BLK, TOV, FG% impact,
  FT% impact), each z-scored across the 225 sim players who appeared, summed,
  ranked 1 (best) to 225. Roto-style. 12 nulls (did not play in 2025-26).
  9-cat only — points-league ranks were never used.
  Raw collection notes: `workspace/fantasy/lastTotal-2025-26.json`
  (kept outside the repo).
- Sort chips are now Rank / ADP / Last · PER / Last · TOT
  (was Rank / ADP / Last season).
- Player rows show both the per-game (`Last`) and totals (`Tot`) ranks.
- `data-health.js` / `audit-data.js` now track and validate `missingLastTotal`.
- `DATA_VERSION` bumped to `2026-09-12`, which invalidates old saved drafts.

## Turn banner + labels (commit c3c0330)

- On your turn, the banner now shows your current pick # **and** your next
  pick # with picks-away (previously the next-pick readout only appeared
  while CPU teams were picking).
- Sort labels finalized as "Last · PER" (per-game) and "Last · TOT" (totals).

## Rank display upgrades (commit dfbc8ae)

- **Consensus default sort.** New "Consensus" sort (average of the built-in
  rank and Yahoo ADP) is now the default board order, so the list leads with
  the market instead of the hand-made rank.
- **Value badges.** Every drafted pick on the draft board and in My-team now
  shows a small green/red badge with picks of value (+) or reach (−) vs ADP.
- **Tier lines.** The available-players list now draws a dashed divider where
  the sort key (ADP / Consensus) drops off by 4+ — visual "talent cliffs".
- **Smarter CPU noise.** The CPU's random jitter is now centered and scales
  with draft progress: about ±2 at the top of round 1 (where ADP gaps are
  tiny, so no more Cooper Flagg jumping from ADP 11 to pick 5 every draft)
  widening to about ±8 in the late rounds where real drafts are chaos.
- Cason Wallace corrected to PG/SG/SF per Yahoo eligibility.

## How to commit this

Unzip into your repo folder (replacing the old files), then:

```
git add -A
git commit -m "Totals toggle, next-pick banner, Codex engine refresh"
git push
```

`index.html` works standalone (double-click to open) and keeps its
browser-localStorage autosave; the chat widget build is a separate generated
file not included here.
