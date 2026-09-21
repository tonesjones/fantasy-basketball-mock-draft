# Vacated usage (phase 2) — preview only

Code is on branch `feat/vacated-usage` (PR). **Preview host only** — do **not**
ship to prod [tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev).

Thin, curated overlay: for **high-ADP movers**, name who on the **previous**
team (`teamPrev`) likely gains touches/minutes when the mover leaves.

## Honesty

| Claim | Status |
|-------|--------|
| Curated research (depth-chart / known rotation notes + positional overlap) | **Yes** |
| Basketball Monster (or other) scrape / republished tables | **No** |
| Full vacated-usage model or projection layer | **No** |
| Replaces `roleDelta` / last-season `cv` | **No** |

Sources are editorial judgment against the bundled pool’s current `teamCurr`
rosters and public rotation context — not imported projection CSVs.

## Schema

On `PDATA` → `PLAYERS` (high-ADP movers only):

| Field | Meaning |
|-------|---------|
| `vacatedGainers?` | `[{ name, reason }]` — max 2–3 names still associated with `teamPrev` |

Bundled coverage (this ship): **22** movers annotated (all Yahoo ADP &lt; 80,
plus notable ADP &lt; 100). Remaining movers have no `vacatedGainers`.

## UI (quiet)

- **Pick coach only** — one muted line when present:
  `Vacates usage → Player A, Player B`
- Wired via `vacatedWhyClause` / `appendVacatedWhy` inside `buildPickCoachWhy`
  (suggest why) and the uncertain muted why.
- Optional: same clause appended to the **NEW** chip tooltip (no list-row spam).
- Mobile coach dock unchanged; advisory-only.

## Files

- `vacated-usage.js` — curated map + merge into `PDATA`
- `docs/vacated-usage.md` — this note
- Cross-link: `docs/movers-outlook.md` (phase 1 team/role outlook)

## Deploy

Prefer a **branch alias**
(`feat-vacated-usage.*.pages.dev` / Cloudflare Pages preview URL) so other
previews stay intact. Do **not** retarget prod `tony-draft-lab`.

Copy-nit polish for mover why text remains separate (PR #9).
