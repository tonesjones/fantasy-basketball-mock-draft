# ADP capture, 11 October 2026

Source: https://hashtagbasketball.com/fantasy-basketball-adp

Source stamp: **10 October 2026**, 419 rows. Captured October 11. HTML SHA-256: `9a8a7f7640eb1235fbb9d5666e0c79104f02d0ec0a19760452ae48c7d34d9139`.

`hashtag-adp.csv` was extracted with `scripts/hashtag-adp-to-csv.js`. Only Yahoo and Fantrax were imported; ESPN and blended ADP were excluded. `refresh-report.txt` is the comparison before import.

Before import, the October 6 CSV was re-diffed against the bundled data: zero differences, so that import was faithful to its capture. The 14 pool players absent from both tables already carry null ADP.

The October 6 additions (Strus, Grant Williams) had been written as `PDATA["..."]=` assignments outside the PDATA object, which made `refresh-adp.js --apply` throw. They were moved into the object with unchanged values, and Bronny James Jr. and Jordan Poole were added the same way (pool 274).

After import, all 260 matched players have zero ADP differences. Repeat with `node scripts/refresh-adp.js scripts/data-provenance/2026-10-11-refresh/hashtag-adp.csv --apply`, then `node scripts/generate-movers.js` (needs full git history: `git fetch --unshallow`) and `node scripts/rebuild-rank.js`.
