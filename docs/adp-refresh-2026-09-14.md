# ADP refresh — 2026-09-14

Source: Hashtag Basketball 2026-27 fantasy ADP table, Yahoo columns,
stamp moved **11 Sep 2026 → 14 Sep 2026**.
Raw pull: `scripts/data-provenance/2026-09-14-adp-refresh/hashtag-adp-2026-09-14.csv`
(414 rows transcribed; `ours-before.csv` is the pre-refresh snapshot).

## Changes applied (pool still 269 players)

- **ADP updated for 148 players** (numeric change; 3 more were format-only).
  139 moved < 3 spots; 9 moved ≥ 3 spots:
  - Aaron Nesmith 45.0 → 75.3 (+30.3) — verified live on page
  - AJ Green 49.8 → 73.3 (+23.5) — verified live on page
  - Luke Kornet 79.8 → 87.5 (+7.7)
  - Jonathan Kuminga 123.3 → 117.1 (−6.2)
  - Moussa Diabate 93.5 → 98.7 (+5.2)
  - Julian Champagnie 118.0 → 114.0 (−4.0)
  - Aday Mara 84.8 → 88.7 (+3.9)
  - Jared McCain 102.8 → 106.6 (+3.8)
  - Brook Lopez 76.7 → 72.9 (−3.8)
- **Team: 1 real change** — Caris LeVert DET → MIL.
  (Tristan Vukcevic WSH → WAS is an abbreviation alias, kept as WSH per our convention.)
- **Position: 1 real change** — Jarred Vanderbilt PF → PF/C.
- **Display-name variants** (our canonical names kept; values updated):
  Alex Sarr → Alexandre Sarr, Nic Claxton → Nicolas Claxton,
  Jimmy Butler → Jimmy Butler III, Cam Johnson → Cameron Johnson,
  Ron Holland → Ron Holland II, GG Jackson → GG Jackson II.

## 13 players dropped from Hashtag's table (values kept, flagged)

Cam Thomas, Jonas Valanciunas, Donte DiVincenzo, Jonathan Isaac,
Aaron Holiday, Moses Moody, D'Angelo Russell, Jaden Ivey, Ochai Agbaji,
Haywood Highsmith, Taurean Prince, Jonathan Mogbo, Nicolas Batum.

Verified absent via page find (not a transcription miss). Their ADP values
are 3 days old (Sep 11 pull) and retained — nulling them would make the
sim treat them as unknown, which is worse for draft realism. Re-check
next refresh; retirements/injuries among these to be confirmed by the
injury audit.

## Add candidate (not added — needs Tony's call)

- Khaman Maluach (PHO, C, Yahoo ADP 120.8) — only fresh-table player with
  a Yahoo ADP not in our pool. Adding requires cv/last/lastTotal/mpg
  research per the pool-expansion convention.

## Files touched

- `player-data.js`: ADP values; header stamp → 14 September 2026.
- `index.html`: PLAYERS team/pos rows; `DATA_VERSION` 2026-09-13 → 2026-09-14;
  audit-text dates updated. (Version bump resets saved in-browser drafts,
  same as the 2026-09-13 expansion.)
- Post-update verification: programmatic re-diff of both files vs the
  fresh table = 0 residual mismatches.

## Not in scope

`last`, `lastTotal`, `cv`, `mpg` are frozen 2025-26 finals — unchanged,
except for the Derik Queen correction below.
INJ audit tracked separately.

## Injury/status refresh — 2026-09-14

`player-data.js` INJ block re-checked against current web reporting
(9 existing entries + 9 check-status players + new-injury sweep since Sep 12).

- **Jimmy Butler**: text updated. Dec 25 was only a ClutchPoints "you never
  know" earliest possibility; ESPN's Anthony Slater (Sep 8, 2026) reports
  notable progress but no contact at camp start, extensive rehab ahead —
  optimistic target now **Jan/Feb 2027**.
- **Donte DiVincenzo**: text updated. Earlier than the old "ESPN est. Apr 2027":
  ESPN's Brian Windhorst (Aug 30, 2026) says the Wolves hold quiet hope for
  a return before end of season, possibly around the All-Star break; GM Matt
  Lloyd declined to give a timeline (Sep 4, 2026).
- **Tyrese Haliburton added to INJ (now 10 entries)**: torn right Achilles
  (June 2025); missed all of 2025-26; RotoWire/ESPN (Sep 10, 2026) say the
  Pacers may bring him back slowly, possibly minutes-limited — expected
  late Oct–Nov 2026. His manual fallback tags are unchanged.
- **Cam Whitmore team CLE → FA**: traded to Cleveland Aug 21, 2026, then
  waived Aug 28 — now an unrestricted free agent. Injury text unchanged.
- Unchanged: Mark Williams, Brandon Miller, Dereck Lively II, Moses Moody,
  Shaedon Sharpe, Jalen Suggs.
- Healthy/on schedule: Kyrie Irving (ready for camp), Fred VanVleet (ramping
  up, contact work), Damian Lillard (expected ready; stays untagged per Tony),
  Aday Mara, Allen Graves, Yaxel Lendeborg, Morez Johnson Jr. (minor July calf
  soreness, expected fine for camp).
- New-injury sweep: nothing new since Sep 12 besides Mark Williams (already
  listed). One unreliable outlier claimed a second Lillard knee surgery —
  contradicted by ESPN, not treated as credible.

## Data correction: Derik Queen

The 2026-09-13 expansion wrongly classified Queen as a 2026 DNP/prospect.
He was drafted **No. 13 in 2025** and played **all 81 games** for New Orleans
in 2025-26 (11.7/7.1/3.7/1.0/0.9, 25.0 MPG; verified via ESPN totals,
StatMuse, and Basketball Monster). Filled per the frozen-reference
convention (same refs as the Sep 13 expansion; 237 existing records
untouched):

- `cv`: [-0.41, 0.83, 0.23, 0.35, 0.74, -1.29, -0.08, 0.02, -0.82]
- tags: REB, BLK, STL, AST (inserted in CATS in draft order)
- `last`: 144 (Basketball Monster NBA 25-26 per-game rank)
- `lastTotal`: 64 (roto rank vs frozen 225 reference)
- `mpg`: 25.0

Raw inputs: `scripts/data-provenance/2026-09-14-adp-refresh/queen-correction.json`.

Audit after refresh: 269 players, 0 errors, 74 missing ADP, 34 missing last /
17 lastTotal / 17 cv / 18 mpg, 9 untagged, 10 INJ. All 5 node suites pass.

## Consensus rebuild: Yahoo + Fantrax ADP blend (same day, per Tony)

Tony asked for consensus to be a straight blend of Yahoo and Fantrax ADP
(no ESPN, no RotoWire, no built-in rank in the mix).

- Transcribed the FANTRAX ADP column for all 270 pool players from the same
  Hashtag table (updated 14 Sep 2026). Raw map:
  `scripts/data-provenance/2026-09-14-adp-refresh/fantrax-adp-2026-09-14.json`.
- Every transcribed Yahoo value was cross-checked against the pool's existing
  `adp` (0 mismatches across all 257 matched rows), so rows were matched to
  the right players.
- Coverage: 236 of 270 have Fantrax ADP (34 null: 13 absent from the table +
  21 blank on the table). Fantrax covers 40 players Yahoo does not
  (e.g. Tari Eason 138.9, Tre Jones 154.8, Grayson Allen 159.0).
- Caveat: Fantrax publishes default fills for the deep tail (140.0 block,
  244.0/244.1 tail). Those are recorded as-is; where Yahoo is blank the
  consensus for such a player is the Fantrax fill.
- `consRank(p)` (index.html) is now: mean of available platform ADPs
  (Yahoo, Fantrax); falls back to built-in rank only when neither published.
  Previously: mean of built-in rank and Yahoo ADP.
- CPU `marketRank` (draft-core.js) now drafts off the same blend instead of
  Yahoo-only: both platforms -> mean; one platform -> that one; neither ->
  unchanged median-of-actuals fallback (prospects keep built-in rank +45).
- The +N/-N draft-board value badges stay Yahoo-only (labeled "vs ADP").
- DATA_VERSION bumped 2026-09-14 -> 2026-09-14b (resets saved local drafts).
- Notable Yahoo/Fantrax divergences (blend splits the difference):
  AJ Green 73.3/241.5, Aaron Nesmith 75.3/211.2, Brook Lopez 72.9/216.2,
  Moussa Diabate 98.7/163.3, De'Andre Hunter 91.0/241.1,
  Tyrese Haliburton 22.4/11.3.
