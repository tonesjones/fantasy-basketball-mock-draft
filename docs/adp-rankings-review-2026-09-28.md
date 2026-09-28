# ADP and player-ranking review (2026-09-28)

A review of how Draft Lab turns raw ADP and 2025-26 stats into consensus
ADP, CPU draft behavior, the built-in **Rank**, and grades. Each component is
graded, and the problems found are fixed in the same change. All numbers come
from the bundled data (270 players; Hashtag table dated 17 Sep 2026) and
seeded simulations of 12-team, 13-round drafts. Scratch scripts are not
committed; the checks that matter are now tests.

## Grades

| Component | Before | After | One-line reason |
|---|:-:|:-:|---|
| Consensus ADP blend | D | B+ | Plain mean treated Fantrax's rarely-drafted tail as literal picks; now reliability-weighted, one shared implementation |
| CPU draft model | C | B+ | ADP-anchored and position-aware, but far too predictable; noise now scales with ADP |
| Built-in Rank | D | B | Curated order with no documented method, ~22 picks from consensus; now generated from a formula |
| Category values (`cv`) | A− | A− | Reproducible BM-style z-scores; sum-of-`cv` order matches Basketball Monster per-game rank (Spearman 0.993) |
| Last-season ranks (`last`, `lastTotal`) | B | B | Mixed scales (BM NBA-wide vs. derived within 225 sim players), fine as signals |
| Grades and scarcity | B− | B+ | Players without 2025-26 data were graded as replacement level; now market-implied |
| ADP sourcing and refresh | B | B | Good source and provenance, but manual; the Sep 18 raw pull and diff script were never committed. A refresh tool is now committed. Data is still 11 days old (see "Data refresh") |

**Overall: C+ → B+.** The stat pipeline (`cv`) was already strong. The weak
links were how the two ADP sources were combined and the hand-made Rank.

## 1. Consensus ADP blend — D → B+

**What it was:** `(Yahoo + Fantrax) / 2`, copied in four places
(`draft-analysis.consRank`, `draft-core.marketRank`, `pick-signals.consensus`,
`punt-core.marketAdp`). The copies used different fallbacks when neither ADP
existed: the built-in rank, or a median of last-season ranks.

**The problem:** the two platforms agree closely through about pick 100
(Spearman 0.976), but each saturates differently late in the draft:

| Fantrax ADP band | n | Median Yahoo ADP |
|---|--:|--:|
| 80–100 | 20 | 91 |
| 100–120 | 24 | 111 |
| 120–200 | 37 | 116–118 (Yahoo bunches up) |
| 200–250 | 37 | 108 (anywhere from 75 to 123) |

Yahoo's published list stops at 124.8, with 80 players between 100 and 125.
Fantrax's rarely-drafted tail puts 73 players at 200–244, 36 of them between
241 and 245. Those tail values say "late or undrafted in Fantrax rooms", not
"pick 242". Averaging them literally gave AJ Green (Yahoo 79.2) a consensus of
160.4, Luke Kornet (87.5) 165.7 and Al Horford (86.6) 165.2.

**Impact, measured:** in 200 seeded 13-round drafts, **18 players with Yahoo
ADP 79–110 went undrafted every time** (AJ Green, Adem Bona, Al Horford, Luke
Kornet, De'Andre Hunter, Aday Mara, Andre Drummond, Aaron Wiggins, T.J.
McConnell, Alex Caruso, GG Jackson, Duncan Robinson, Allen Graves, Daniel
Gafford, Jay Huff, Rui Hachimura, Jared McCain, Sam Hauser). In a real Yahoo
room they go in rounds 7–9. The draft board's Yahoo-only value badges then
showed them as +60 "steals". The same players also filled the scarcity
replacement window (consensus ranks 150–170).

**Fix:** a single `DraftCore.marketAdp` / `marketRank`, still Yahoo + Fantrax
only, per the standing rule:

- Where both values are in their reliable range, it is the plain mean, as before.
- A value's weight fades from 1 to 0.25 across its platform's saturated band
  (Yahoo 100–125, Fantrax 150–200). Fantrax values past 200 are compressed to
  200 + excess/4 instead of read literally.
- Players neither platform lists sort after all listed ones, ordered by
  last-season rank. The curated rank no longer feeds the market.

Results: AJ Green 160.4 → 105.4, Nesmith 143.3 → 100.8, Kornet 165.7 → 112.2,
Vucevic 155.4 → 137.3. Jokic, Haliburton and Mikal Bridges are unchanged.
**Every player with consensus ≤ 120 is now drafted in every simulated draft.**
On the old code, 40 players with Yahoo ADP ≤ 120 missed at least one of the
same 6 test drafts.

The band edges (100/125, 150/200) and the 0.25 floor come from the table
above, so they are judgment calls. Without "% drafted" data, ADP in the last
rounds stays biased early: players with consensus 101–140 go ~9 picks after
their number, because more players sit under 140 than a 156-pick draft has
room for.

**Open policy question for Tony:** Draft Lab trains for Yahoo rooms, so
weighting Yahoo above Fantrax, rather than equally, would mirror the target
room more closely. This change deliberately keeps equal weights where both
values are reliable.

## 2. CPU draft model — C → B+

Score = market + noise − 3 for filling an open starting slot; lowest score
picks. The structure is sound. The noise was a fixed ±2 to ±8 window that
widened with draft progress and was re-drawn every pick. Measured spread of a
player's draft slot (standard deviation, 200 drafts):

| Market band | Before | After |
|---|--:|--:|
| 1–24 | 1.2 | 1.3 |
| 25–60 | 1.6 | 3.2 |
| 61–100 | 2.2 | 4.8 |
| 101–140 | 3.2 | 8.5 |

Before, a round-7 player went within about ±2 picks of his ADP almost every
time, far tighter than real rooms, which teaches false certainty about who
will still be there. Noise is now ±20% of market ADP (at least ±1.5 picks),
so round 1 is still tight and mid rounds move about a round.

Also fixed: `cpuPickIndex` re-solved the roster "before" state for every
candidate, and scored every available player even when they could not win.
It now computes the baseline once per pick and scans in market order, stopping
at the first candidate that can't beat the leader. 200 simulated drafts went
from >120 s to 16 s, and the test suite from ~20 s to ~7 s.

## 3. Built-in Rank — D → B

**What it was:** the order of the `PLAYERS` literal, described as a "curated
value ranking" with no documented method. It had been patched mechanically
three times (Sep 12, 13, 20). In the top 150 it averaged 21.8 spots from the
consensus order, and 50 players were 40+ spots off (Stephen Curry #58 vs.
consensus #19, LaMelo Ball #62 vs. #22). Yet it appears on every row, is a sort
option, and is sent to the Pick coach and Jev as `rank` / `picks_past_rank`.

**Fix:** the order is generated by `scripts/rebuild-rank.js`:

    key = consensus − 0.4 × clamp(consensus − lastSeasonRank, −50, +50)

In words: consensus ADP, nudged up to 20 spots toward 2025-26 production
(the same damped edge the Pick coach already applies). There is no nudge for
INJ players, players without 2025-26 data, or unlisted players. Mean gap to
consensus order in the top 150 is now 12.1 spots; 3 players are 40+ off (DeRozan, Jay Huff,
Wendell Carter Jr., all strong 2025-26 producers). `test-rank-order.js` fails
if a data refresh leaves the order stale. The data audit now compares the rank
with the consensus order instead of raw Yahoo ADP.

## 4. Category values — A−

No changes. `cv` is reproducible: the re-derivation was byte-identical in the
Sep 13 audit, and category means are ~0 with SDs ~1 across the 253 rated
players. The sum of `cv` orders players almost exactly like Basketball
Monster's per-game rank (Spearman 0.993). Known, deliberate limits: per-game
only (no games-played discount) and frozen at 2025-26.

## 5. Grades and scarcity — B− → B+

Players without 2025-26 `cv` were counted at replacement level, whose nine
values sum to −0.85. For Haliburton (consensus 16.8) the rated players around
him sum to +4.96, so drafting him in round 2 read as a ~6 z-point hole. That is
enough to drop a team a letter grade. They now count at **market-implied
value**: the mean `cv` of the 10 rated players nearest them in consensus ADP,
still flagged †N. The scarcity replacement window (consensus 150–170) is now
populated by players the market actually drafts there.

## 6. Data refresh

**A fresh ADP pull was not possible from this session.** The environment's
network policy blocks hashtagbasketball.com, basketball-reference.com,
basketballmonster.com, fantasypros.com and yahoo.com. The bundled ADP is from
Hashtag's 17 Sep table (11 days old). To refresh:

1. Save Hashtag's ADP table as CSV (name, team, pos, Yahoo, Fantrax columns).
2. `node scripts/refresh-adp.js table.csv` prints the diff report (material
   moves with consensus before/after, new/blank values, absent players, add
   candidates, team/position differences). `--apply` writes `adp`/`adpF`.
3. `node scripts/rebuild-rank.js`, bump `DATA_VERSION`, update the date stamps,
   and commit the CSV under `scripts/data-provenance/<date>-adp-refresh/`.

Or allow those hosts in the environment's network settings and a session can
do the pull directly.

**Applied from news since the last refresh** (each confirmed by ESPN, NBA.com,
CBS Sports and Hoops Rumors):

- Sep 26: the Bulls traded Rob Dillingham to the Hornets for Buddy Hield,
  days after Charlotte got Hield from Atlanta. Buddy Hield ATL → **CHI**, Rob
  Dillingham CHI → **CHA** (pool and movers overlay).
- Moses Moody's team code `GSW` → `GS` (the pool's convention; playoff badges
  already aliased it).

**Found but not applied — needs a decision:**

- **Kon Knueppel** (consensus #41): left hamstring strain; out all preseason
  and re-evaluated in the first week of the season (ESPN, NBA.com, NBC Sports,
  Yahoo). Not added to `INJ` because the Pick coach treats every INJ player as
  a hard pass with the text "out for the season". That is wrong for him, and
  already wrong for Haliburton (expected back late Oct–Nov). Recommended: make
  the coach's INJ handling use the return timeline, then add him.
- Alex Sarr is limited at camp but expected ready for the opener, and Kyrie
  Irving entered camp without restrictions (both consistent with the data).
  Dereck Lively II has not been cleared for camp (already INJ). The INJ block
  as a whole is dated 14 Sep and is due a full sweep.

## Remaining recommendations

1. Refresh ADP now that drafts are live (steps above); re-run weekly until opening night.
2. Pick coach INJ: grade by return date instead of a blanket hard pass.
3. Capture Yahoo "% drafted" alongside ADP to correct late-round ADP compression.
4. Grades: consider a games-played discount (`cv` is per-game; Ty Jerome's 15 games count fully).
5. Decide the Yahoo-vs-Fantrax weighting question in §1.
