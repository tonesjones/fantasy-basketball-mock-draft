# Reproducing the 2026-09-13 pool expansion (237 → 269)

This directory contains everything needed to re-derive the 32 added players'
data from scratch and verify the committed result byte-for-byte. Nothing here
depends on files outside the repo.

## What each file is

| File | Contents |
|---|---|
| `merge_new32.py` | The merge script. Derives `cv` / `lastTotal` / `mpg` / `last` for the 32, inserts PLAYERS rows + CATS tags into `index.html`, appends PDATA entries to `player-data.js`. |
| `hashtag_new32.json` | Raw pull: team, Yahoo positions, Yahoo ADP for the 32, from Hashtag Basketball's 2026-27 ADP table (Yahoo columns, table stamp "Updated: 11 September 2026", fetched 2026-09-13). |
| `bref_new32.json` | Raw pull: Basketball-Reference 2025-26 totals + MPG for the 26 appeared players, plus the 6-player DNP list with reasons. |
| `bm_new32.json` | Raw pull: Basketball Monster `NBA 25-26` per-game ranks for the 26 appeared players. |
| `cv_ref.json` | Frozen 2026-09-12 derivation: per-game category means/SDs of the 225-player reference population (league FG% .471 / FT% .783). |
| `totalz_225.json` | Frozen 2026-09-12 derivation: total-z of each of the 225 reference players (used for `lastTotal` ranking). |
| `lasttotal_ref.json` | Frozen 2026-09-12 derivation: totals-category means/SDs. |
| `lastTotal-2025-26.json` | Raw working file from the original 2026-09-12 totals-rank derivation (kept for reference). |

## Re-running

The script refuses to run against an already-expanded tree: it asserts exactly
237 PLAYERS rows in `index.html`. To verify from a clean checkout:

```sh
# 1. Check out the parent of the expansion commit (237-player pool)
git worktree add /tmp/pool237 76911a5

# 2. Run the merge against it
SITE_DIR=/tmp/pool237 python3 scripts/data-provenance/2026-09-13-pool-expansion/merge_new32.py

# 3. Diff against the committed post-expansion files — must be empty
diff /tmp/pool237/index.html index.html
diff /tmp/pool237/player-data.js player-data.js
```

This was verified on 2026-09-13: both diffs empty, i.e. the shipped data is
exactly reproducible from the files in this directory.

## Methodology (short)

`cv` and `lastTotal` for the 26 appeared players are z-scored against the
**frozen** 2026-09-12 225-player reference population — same BRef totals,
same league averages, same means/SDs — so the 32 new z-scores sit on exactly
the same scale as the existing pool. Re-running the derivation over the 225
reproduces every existing `cv`/`lastTotal` with 0 mismatches, and all 237
pre-existing PDATA records are byte-identical after the merge.

`lastTotal` for a new player = 1 + (number of reference players with a higher
total-z); ties with existing ranks are possible and left as-is. `last` =
Basketball Monster NBA 25-26 per-game rank, else null. The 6 DNP/prospects
carry nulls per the existing prospect convention. Insertion: positional merge
by Yahoo ADP (built-in rank = round-half-up(ADP)); all 237 existing players
keep their exact relative order.
