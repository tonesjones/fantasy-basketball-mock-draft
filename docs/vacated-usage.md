# Vacated usage (phase 2) — preview only

Code is on `main` (PRs #10 / #11). **Preview host only:**
[tony-draft-lab-preview.pages.dev](https://tony-draft-lab-preview.pages.dev)
(and `feat-*` branch aliases). Do **not** ship to prod
[tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev).

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
  (suggest why) and always on uncertain muted why — including softFail /
  **Coach unavailable** (same pattern as mover why; do not clear on softFail).
- Optional: same clause appended to the **NEW** chip tooltip (no list-row spam).
- Mobile coach dock unchanged; advisory-only.

## Files

- `vacated-usage.js` — curated map + merge into `PDATA`
- `docs/vacated-usage.md` — this note
- Cross-link: `docs/movers-outlook.md` (phase 1 team/role outlook)

## Deploy

Live on preview / branch aliases only. Do **not** retarget prod `tony-draft-lab`.
On `feat-*` aliases, Pick coach soft-fails may use labeled **Stub** until the CF
**Preview** env has `TYPESAFE_API_KEY` — vacated + mover why still paint (PR #11).

Mover tooltip / uncertain-why copy nits: PR #9 (`expanded` / `smaller`).
