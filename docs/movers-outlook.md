# Movers / role outlook (phase 1)

Code is on `main`. **Shipped to preview only:**
[tony-draft-lab-preview.pages.dev](https://tony-draft-lab-preview.pages.dev).
**Not** on prod [tony-draft-lab.pages.dev](https://tony-draft-lab.pages.dev).

Not a vacated-usage model and not a full projection layer. Bundled audit:
**71** movers (`teamPrev` → `teamCurr`).

## Fields (on PDATA → PLAYERS)

| Field | Meaning |
|-------|---------|
| `teamPrev?` | Prior-season (or pre-refresh) team abbrev, Yahoo/Hashtag style |
| `teamCurr` | Current team (mirrors `PLAYERS[].t`) |
| `mover` | `true` when `teamPrev` ≠ `teamCurr` (after abbrev normalize) |
| `roleDelta` | `up` \| `down` \| `flat` \| `unknown` |
| `roleNote?` | Short factual tooltip string (not marketing copy) |
| `projMpg?` | Optional projected MPG — **not shipped in v1** |
| `projRank?` | Optional projected rank — **not shipped in v1** |

Last-year `cv` / category grades remain form history. Outlook does **not**
replace them.

## What is real vs heuristic

**Real (sourced)**

- `teamPrev` / `mover` from the bundled `PLAYERS` teams immediately before the
  2026-09-12 Hashtag ADP/team refresh (`git 47c17da^`), with abbrev
  normalization (`SAS→SA`, `NYK→NY`, `PHX→PHO`, `NOP→NO`, `WSH→WAS`, `GSW→GS`).
- Add-candidate / verified priors from `docs/adp-additions-2026-09-13.md` §4
  (e.g. Kennard LAL→PHO, Kuminga GS→MIN, Lillard MIL→POR).
- Nikola Vucevic: mid-2025-26 trade to BOS (`5b649ad`); `teamPrev=BOS` so he is
  **not** flagged as a 2026-27 offseason mover.

**Heuristic (honest)**

- `roleDelta` / `roleNote` from Yahoo ADP (else Fantrax) vs 2025-26 `last`
  (per-game) rank:
  - gap = `last − market` (positive ⇒ market expects better than last finish)
  - mover threshold ±12; non-mover ±20 → `up` / `down`; else `flat`
  - missing ADP or `last` → `unknown`
- This is **not** vacated-usage, depth-chart minutes, or a published projection.

**Not included**

- Hashtag season projections (`projMpg` / `projRank`) — no legal projection
  table snapshot in-repo (ADP attribution pattern exists; projections were not
  imported). Phase 2 may add vacated-usage / projection snapshots with
  attribution.

## UI

- List row `.l2`: quiet muted **NEW** when `mover`; quiet **↑ role** / **↓ role**
  for `up`/`down` only (`flat`/`unknown` hidden). Tooltip = `roleNote`
  (heuristic ADP-vs-last wording — not a projection).
- Pick coach: same chips near strengths; `buildPickCoachWhy` appends
  `new team · {note≤60}` or `expanded role` / `smaller role`. Uncertain keeps
  chips (no choice chip).
- **`projMpg` / `projRank`:** not shipped (0 in bundle). Do not document as present.

## Regenerate

```bash
node scripts/data-provenance/2026-09-20-movers-outlook/generate.js
```

Provenance: `scripts/data-provenance/2026-09-20-movers-outlook/`.
