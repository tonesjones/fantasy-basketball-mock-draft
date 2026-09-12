# Changelog — changes since the GitHub push (2026-09-12)

Everything below was added locally *after* the version pushed to
`github.com/tonesjones/fantasy-basketball-mock-draft`
(that push had: standalone-safe loading, two-line mobile player rows,
scarcity counts tied to the draftable pool).

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
