# Audit trail: pool expansion 237 → 269 (2026-09-13)

Reviewer note: this document traces every data decision behind commit
`b968421` ("Pool expansion 237 → 269: add all 32 Yahoo-ADP candidates"),
so the full pipeline can be re-verified independently.

## 1. Source

- **URL:** https://hashtagbasketball.com/fantasy-basketball-adp
- **Table stamp at fetch:** "Updated: 11 September 2026" (same snapshot as the
  2026-09-12 import; re-verified 2026-09-13 — zero value changes, see §8)
- **Column used:** `YAHOO ADP` (decimal). The adjacent `YAHOO ORDER` column was
  ignored — it is a rank ordering, not a draft position.
- **Scope:** all 403 table rows transcribed; comparison run against all 237
  existing pool players.

## 2. Candidate selection

The 32 players below appear in the table with a Yahoo ADP but were absent
from the pool. Every one was added — no filtering, no judgment calls.

| # | Player | Yahoo ADP | Team | Yahoo pos | 2025-26 status |
|---|---|---|---|---|---|
| 1 | AJ Green | 49.8 | MIL | PG/SG/SF | 78 G, 29.1 mpg |
| 2 | Damian Lillard | 71.7 | POR | PG | DNP → nulls |
| 3 | Jaden McDaniels | 78.3 | MIN | SF | 73 G, 31.7 mpg |
| 4 | Derik Queen | 80.8 | NO | PF/C | 2026 draftee → nulls |
| 5 | Aday Mara | 84.8 | OKC | C | 2026 draftee → nulls |
| 6 | Al Horford | 86.6 | GS | PF/C | 45 G, 21.5 mpg |
| 7 | Luke Kennard | 87.5 | PHO | SG/SF | 78 G, 21.6 mpg |
| 8 | Andre Drummond | 91.7 | NY | C | 63 G, 19.5 mpg |
| 9 | Day'Ron Sharpe | 91.9 | BKN | C | 62 G, 18.7 mpg |
| 10 | Moussa Diabaté | 93.5 | CHA | C | 73 G, 26.0 mpg |
| 11 | Ty Jerome | 95.7 | MEM | PG/SG | 15 G, 22.6 mpg |
| 12 | Duncan Robinson | 96.3 | DET | SG/SF | 77 G, 27.4 mpg |
| 13 | Allen Graves | 98.4 | TOR | PF | 2026 draftee (19th) → nulls |
| 14 | Cedric Coward | 100.4 | MEM | SG/SF | 62 G, 25.8 mpg |
| 15 | Sam Hauser | 109.6 | BOS | SF/PF | 78 G, 24.8 mpg |
| 16 | Kelly Oubre Jr. | 110.8 | IND | SF/PF | 50 G, 31.5 mpg |
| 17 | CJ McCollum | 111.1 | ATL | PG/SG | 76 G, 29.8 mpg |
| 18 | Ajay Mitchell | 111.7 | OKC | PG/SG | 57 G, 25.8 mpg |
| 19 | Draymond Green | 113.4 | GS | PF/C | 68 G, 27.5 mpg |
| 20 | Ryan Kalkbrenner | 114.3 | CHA | C | 69 G, 21.4 mpg |
| 21 | Sandro Mamukelashvili | 115.0 | LAL | PF/C | 80 G, 21.9 mpg |
| 22 | Peyton Watson | 115.3 | CLE | SF/PF | 54 G, 29.6 mpg |
| 23 | Yaxel Lendeborg | 115.8 | GS | PF | 2026 draftee (11th) → nulls |
| 24 | Kevin Porter Jr. | 116.4 | MIL | PG/SG | 38 G, 33.2 mpg |
| 25 | Jrue Holiday | 116.7 | POR | PG/SG | 53 G, 29.4 mpg |
| 26 | Julian Champagnie | 118.0 | SA | SF/PF | 82 G, 27.6 mpg |
| 27 | Christian Braun | 118.5 | DEN | SG/SF/PF | 44 G, 31.8 mpg |
| 28 | Collin Sexton | 118.5 | LAL | PG/SG | 68 G, 23.7 mpg |
| 29 | Egor Demin | 121.0 | BKN | PG/SG | 52 G, 25.2 mpg |
| 30 | Paul Reed | 122.3 | DET | PF/C | 65 G, 13.9 mpg |
| 31 | Morez Johnson Jr. | 123.0 | DAL | PF | 2026 draftee (9th) → nulls |
| 32 | Jonathan Kuminga | 123.3 | MIN | SF/PF | 36 G, 23.1 mpg |

## 3. Name normalization

Canonical pool names drop diacritics and use the common short form.
Mappings applied (all same-team, same-ADP matches, high confidence):

- `Moussa Diabaté` → `Moussa Diabate`
- `Alexandre Sarr` → `Alex Sarr`, `Cameron Johnson` → `Cam Johnson`,
  `GG Jackson II` → `GG Jackson`, `Nicolas Claxton` → `Nic Claxton`,
  `Ron Holland II` → `Ron Holland` (these five were already in the pool;
  listed here because the table uses the longer form — they are NOT
  add-candidates)

No ambiguous matches were forced; anything uncertain would have been
flagged rather than guessed. None arose.

## 4. Team / position verification

Team and Yahoo position eligibility come from the table's Yahoo columns.
Fifteen players with moved, returning, or otherwise non-obvious teams were
cross-checked against a second source:

- Lillard → POR (ClutchPoints: return to Portland)
- Horford → GS (Reuters: re-signed 2-yr/$14M)
- Kennard → PHO (from LAL)
- Drummond → NY (Knicks signed 7/6)
- Sharpe → BKN (re-signed)
- Jerome → MEM
- Robinson → DET
- Oubre → IND (Reuters: 2-yr/$17M 7/1)
- McCollum → ATL (Reuters: from WSH, re-signed)
- Mamukelashvili → LAL (from TOR)
- Watson → CLE (Reuters: sign-and-trade 4-yr/$88M 8/19)
- Porter Jr. → MIL (exercised $5.4M option)
- Sexton → LAL (2-yr/$19M, July)
- Kuminga → MIN (Reuters: 2-yr/$12.4M 8/26)
- Lendeborg → GS, Morez Johnson Jr. → DAL (2026 draft slots verified)

## 5. 2025-26 statistics methodology

For the 26 candidates who appeared in 2025-26, `last`, `lastTotal`, `cv`,
and `mpg` were derived with the exact pipeline used for the original pool:

- `cv` / `lastTotal`: BM-style per-game category z-scores (CATS9 order
  FG% FT% 3PM PTS REB AST STL BLK TO; FG%/FT% volume-weighted; TO inverted)
  computed from Basketball-Reference 2025-26 totals, z-scored against the
  **frozen 2026-09-12 225-player reference population** — same league
  averages (FG% .471 / FT% .783), same means and standard deviations.
- `last`: Basketball Monster `NBA 25-26` per-game rank, read from each
  player's BM page. All 26 found, zero nulls.
- `mpg`: Basketball-Reference 2025-26 minutes per game.

**Validation (the part that matters):** the derivation was re-run over the
original 225 reference players — **0 mismatches** on every existing `cv`
and `lastTotal`. After the merge, all 237 pre-existing PDATA records are
**byte-identical** to before. The new data cannot have shifted old values.

Per-game ranks worth a second look (read directly off BM, not errors):
- Kevin Porter Jr.: BM per-game rank **16** (38 games)
- Ty Jerome: BM 38 (15 games) / lastTotal 200 — small-sample split
- Christian Braun / Egor Demin: lastTotal tie at 169 (allowed)

## 6. DNP / prospect handling

Six players did not appear in 2025-26 and carry null `last`/`lastTotal`/
`cv`/`mpg`, per the existing prospect convention (cf. the 4 untagged
prospects already in the pool): Lillard (injury), Queen, Mara, Graves,
Lendeborg, Morez Johnson Jr. (2026 draftees). All six are untagged.

**Known inconsistency (flagged, not fixed):** Lillard is untagged while the
other injured stars (Haliburton, Kyrie Irving, VanVleet) carry manual
fallback tags. Left for the pool owner's call — no tags were invented.

## 7. Pool insertion rule

- All 237 existing players keep their exact relative order (verified).
- Each new player inserted at built-in rank = round-half-up(Yahoo ADP);
  ties broken by lower ADP, then candidate-list order (stable).
- Collisions push later players down one slot; max |rank − round(ADP)| = 4
  (tie spillover in the dense 115–123 cluster).
- Compatibility: the pre-existing built-in order is a curated value
  ranking, not ADP-ordered (mean |rank − ADP| = 33.2), so ADP-position
  insertion conflicts with no invariant and reorders nothing existing.

## 8. Freshness re-verification (2026-09-13)

Before writing, the live table was re-read in full (403 rows) and diffed
against the 9/12 import: **0** of the 74 null-ADP pool players gained an
ADP, **0** pool ADPs changed (max abs diff 0.0), same 16 pool players
absent from the table, same 32 add-candidates at identical values.
A re-import of existing rows would have changed nothing; only the 32
additions were written.

## 9. Validation

- `test-draft-core.js` — pass
- `test-data-health.js` — pass ("269 bundled players have matching data records")
- `test-playoff-core.js` — pass
- `test-draft-grades.js` — pass
- `test-draft-simulation.js` — pass
- No test expectations required changes (no hardcoded player counts).
- Data-health audit: 269 players, 0 errors, 0 orphans, 0 placeholder teams;
  74 missing ADP (unchanged — all 32 have ADPs), 35 missing `last` (+6),
  18 missing `lastTotal` (+6), 18 missing `cv` (+6), 19 missing MPG (+6),
  10 untagged (+6).

## 10. Working files & reproducibility

All provenance materials are committed in-repo under
`scripts/data-provenance/2026-09-13-pool-expansion/`:

- `merge_new32.py` — the merge script (inputs resolve relative to the script;
  `SITE_DIR` env var overrides the target checkout for verification runs)
- `hashtag_new32.json`, `bref_new32.json`, `bm_new32.json` — raw pulls
- `cv_ref.json`, `totalz_225.json`, `lasttotal_ref.json` — frozen 2026-09-12
  reference data (previously `/tmp`-only; now versioned)
- `lastTotal-2025-26.json` — raw working file from the 2026-09-12 derivation
- `README.md` — re-run instructions

**Reproducibility verified 2026-09-13:** the in-repo script was run with
`SITE_DIR` pointed at a clean worktree of the pre-expansion parent commit
(`1758315`); the resulting `index.html` and `player-data.js` are
**byte-identical** to the committed post-expansion files (`diff` empty on
both). The shipped data is exactly reproducible from Git alone.

## 11. Review follow-ups (2026-09-13)

- *Reproducibility gap (fixed):* raw pulls, merge script, and frozen
  reference data previously lived outside the repo / in `/tmp`. All are now
  committed under `scripts/data-provenance/2026-09-13-pool-expansion/` and
  the byte-identical re-derivation above closes the loop.
- *test-draft-grades.js failure (not reproduced):* the reported failure of
  the HTML-extraction regex could not be reproduced — the test passes on this
  commit, on its parent, and on clean `git show` extractions of both, run
  from the repo dir and from a foreign cwd. The test was hardened anyway:
  data files now resolve via `__dirname` (cwd-independent) and the PLAYERS
  extraction asserts with a diagnostic message instead of throwing a bare
  TypeError on no-match. If the failure reappears in the reviewer's
  environment, the exact command and Node version would help pin it down.
