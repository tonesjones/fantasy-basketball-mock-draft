# ADP capture, 16 October 2026

Source: https://hashtagbasketball.com/fantasy-basketball-adp

Source stamp: **16 October 2026**, 422 rows. Captured October 16. HTML SHA-256: `dae59ba1230fe6b7623d41d32e13a191de929f9420e85fb1a2f9eea05ebafd1f`.

`hashtag-adp.csv` is the supplied capture. Only Yahoo and Fantrax were imported; ESPN and blended ADP were excluded. `refresh-report.txt` is the comparison before import.

Added Ben Simmons (SAC, Yahoo 112.6, Fantrax 220.6), the only table player with a Yahoo ADP outside the pool. Yahoo lists him at PG. The pool is now 275; no bundled per-game averages or historical stats were available for him. Hashtag lists Rob Dillingham and Buddy Hield on different teams; the app keeps its reviewed assignments.

After import, all 262 matched players (261 plus Simmons) have zero ADP differences. Repeat with `node scripts/refresh-adp.js scripts/data-provenance/2026-10-16-refresh/hashtag-adp.csv --apply`, then `node scripts/generate-movers.js` (needs full git history: `git fetch --unshallow`) and `node scripts/rebuild-rank.js`.
