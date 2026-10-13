# Plan: draft data fixes (from Oct 2026 review)

## Done (data-quality-fixes branch)
1. **Injury status.** Injury records get `status` (`questionable` | `out` | `out-indefinitely` | `season-out`) and `reviewedAt` (YYYY-MM-DD). The coach auto-passes and excludes from recommendations only for `season-out`; other statuses stay eligible with a warning that quotes the record's `ret`/`src`.
   - Done when: all 14 records have both fields; tests cover questionable, out-indefinitely and season-out advice; `npm test` passes.
2. **Add candidates from either platform.** `refresh-adp.js` lists unmatched players with Yahoo *or* Fantrax ADP.
   - Done when: a test with a Fantrax-only unmatched row shows it in the candidate report.
3. **Reject missing columns.** The ADP import fails before writing if an expected platform column is absent from the header; blank cells still become `null`.
   - Done when: tests cover missing column (error, no write) vs blank cell (`null`).
4. **Role arrows are labels only.** Remove their numeric adjustment from coach value; keep the displayed market/history comparison.
5. **Shared rank eligibility.** Built-in ranks and coach advice use one historical-rank eligibility function (fixes disagreement above rank 320).
   - Done when (4, 5): `npm test`, `npm run audit-data` and rank-order check pass; rank file regenerated if order changes.
6. **Freshness warnings.** Advisory warning when ADP data is older than 7 days or any injury `reviewedAt` is older than 7 days.
   - Done when: warning shows in the data-health display; test covers both thresholds.

## Later
- Per-player carry-forward dates for ADP; one-command refresh wrapper.
- Extra injury fields (`sourceUrl`, `reportedAt`, `reevaluateAt`).
- Reusable historical-stat derivation; fill Strus / Grant Williams; record why data is missing.

## Open decisions
- No injury record is `season-out` today, so the coach never auto-passes on injury right now.
- `ADP_DATE` in player-data.js is bumped by hand after each refresh (the importer's reminder says so).
