# ADP capture, 6 October 2026

Source: https://hashtagbasketball.com/fantasy-basketball-adp

Source stamp: **06 October 2026**. Captured October 6, Pacific time. HTML SHA-256: `ab4b5d8057947ff491c869b0cf55cd6d81490a47a5d724528ea5b6158b033aff`.

The CSV contains 418 rows extracted with `scripts/hashtag-adp-to-csv.js`. Only Yahoo and Fantrax were imported. ESPN and blended ADP were excluded. `refresh-report.txt` is the comparison before import and pool expansion.

After import and the two additions, all 258 matched players have zero ADP differences. Fourteen absent players retained previous values. The audit has zero errors or unmatched records. All 21 test suites pass; existing historical stats were compared with the pre-refresh snapshot and preserved. Rank-order and JavaScript syntax checks pass.

Repeat the import with `node scripts/refresh-adp.js scripts/data-provenance/2026-10-06-refresh/hashtag-adp.csv --apply`, then regenerate movers and ranks using `scripts/generate-movers.js` and `scripts/rebuild-rank.js`.

See `docs/data-refresh-2026-10-06.md` for injury sources and limitations.

Edge browser checks pass at 390x844, 320x568, 430x932, and 667x375, including drafting, Undo, navigation, scrolling, and resizing to desktop. The 1280x900 desktop check also passes. A pre-existing unfinished duplicate function initially prevented loading; validation passed after its removal.
