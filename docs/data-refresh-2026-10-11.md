# Player refresh, 11 October 2026

## ADP and rank changes

[Hashtag Basketball's table](https://hashtagbasketball.com/fantasy-basketball-adp), stamped 10 October, has 419 rows. Imported Yahoo and Fantrax only.

For matched pool players, 394 values changed; 21 moved at least three picks, almost all on thin Fantrax tails. Largest: Mark Williams Fantrax 141.8 → 157.3, Davion Mitchell 139.8 → 152.3, Rui Hachimura 223.4 → 209.9, Daniel Gafford 217.1 → 208.6, Yves Missi 226.4 → 218.7. Yves Missi (112.7) and Scotty Pippen Jr. (115) gained a Yahoo ADP; Jarred Vanderbilt gained Fantrax 243.8. Luke Kennard's Yahoo ADP is now blank.

Added Bronny James Jr. (LAL, Yahoo 106.4, Fantrax 241.9) and Jordan Poole (NO, Yahoo 110.5, Fantrax 239.5), the only table players with a Yahoo ADP outside the pool. The pool is now 274. Their 2025-26 per-game averages were already bundled; historical ranks, minutes and category values are not collected, so grades use the missing-data fallback.

Regenerated built-in ranks and ADP-based role arrows. `DATA_VERSION` is `2026-10-11`; older saved drafts reset because player indexes changed.

## Audit of the 6 October refresh

- The October 6 import matches its archived CSV exactly, and today's diff from it is ordinary drift, so the capture itself looks faithful.
- The 14 pool players missing from the table carry null ADP, not stale values.
- Defect fixed: the Strus and Grant Williams rows were written outside the PDATA object, which broke `refresh-adp.js --apply` for every later refresh. They now sit inside the object with unchanged values.
- Hashtag still reverses Hield and Dillingham's teams; the app keeps its reviewed assignments.

## Injury changes

Pending; see the follow-up commit.
