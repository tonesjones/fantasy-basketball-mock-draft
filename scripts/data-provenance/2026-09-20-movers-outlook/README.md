# Movers / outlook provenance (2026-09-20)

Generated into `movers-outlook.js` (merged into PDATA/PLAYERS at load).

## Honesty

- **Real (sourced):** `teamPrev` / `mover` from prior bundled PLAYERS teams + documented add-candidate priors.
- **Heuristic:** `roleDelta` / `roleNote` from ADP vs last-season rank (softer threshold when `mover`).
- **Not included:** `projMpg` / `projRank` (no Hashtag projection table snapshot; phase-2 vacated-usage later).

## Counts

```json
{
  "movers": 71,
  "roleUp": 84,
  "roleDown": 50,
  "roleFlat": 80,
  "roleUnknown": 56,
  "withPrev": 242,
  "projMpg": 0,
  "projRank": 0,
  "players": 270
}
```

## Thresholds

- mover: |last − market| ≥ 12 → up/down
- non-mover: |last − market| ≥ 20 → up/down
- else flat when both exist; unknown when ADP or last missing
