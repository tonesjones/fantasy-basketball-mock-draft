# Data check — 2026-09-29

## Injury changes applied

- Brandon Miller's INJ flag was removed. [NBA.com Fantasy News, Sep 28](https://www.nba.com/stats/fantasynews?Team=warriors) reports that he is ready for training camp and that Charlotte expects him to be ready for opening night. The earlier August shoulder update was superseded. The Pick coach's blanket INJ hard pass made leaving that flag especially misleading.
- Dereck Lively II remains flagged. [Dallas Mavericks notebook, Sep 25](https://www.nba.com/mavs/news/mavericks-notebook-livelys-return-requires-patience-plus-powell-re-signs-and-flaggs-height-reveal) supports continued rehabilitation and limited camp participation.
- Jimmy Butler remains flagged. [NBA.com Warriors Media Day coverage, Sep 29](https://www.nba.com/news/5-takeaways-warriors-media-day-2026) reports that he has started some running and basketball activity; there is no confirmed return date. The old Jan/Feb estimate was removed.

Ten players remain flagged after the release review. [The Hornets' September 25 update](https://www.nba.com/hornets/news/charlotte-hornets-injury-update-09-25-26) prompted a Kon Knueppel flag for his hamstring injury and reevaluation during the first regular-season week. [NBA.com's Porzingis report](https://www.nba.com/news/kristaps-porzingis-health-issue-out-indefinitely) prompted a flag for his indefinite health-related absence. Neither has confirmed opening-night availability. Moses Moody's note now reflects light on-court activity and no return timetable from the Warriors' media day coverage. Tyrese Haliburton remains unflagged after camp clearance.

## ADP source check and Yahoo workbook refresh

[Hashtag Basketball's ADP table](https://hashtagbasketball.com/fantasy-basketball-adp) is stamped **28 September 2026**. The full source transfer to a local CSV was blocked by the browser's URL security policy, and direct network download also failed. The supplied Yahoo workbook unblocked a direct Yahoo update; Fantrax remains at the **25 September** Hashtag snapshot. No values were inferred or copied from ESPN or the ESPN-inclusive blend.

The workbook's **All Drafts** column has 240 ranked rows: 190 numeric ADPs (last value 121.4) and 50 unpublished values shown as dashes. There are more than 120 numeric players because ADP is an average pick number, not a count of listed players. The extracted [Yahoo CSV](../scripts/data-provenance/2026-09-29-yahoo-direct/yahoo-adp.csv) matched 220 of the app's 270 pool players, changed 182 Yahoo values, and set Cam Johnson and Shaedon Sharpe to null where the workbook now shows dashes. The 50 pool players absent from the workbook retained their old values. Bronny James and Jordan Poole have published Yahoo values but are outside the current pool; they were not added automatically. Bobby Portis Jr. was mapped to the existing Bobby Portis record. Donte DiVincenzo's position difference was reported but not written.

The workbook also contains 230 PNG portraits. They were not added to the app in this data refresh; image coverage, attribution and display permission need a separate review.

Current data-health gaps: 270 pool players, 82 without Yahoo ADP, 33 without Fantrax ADP, 33 without prior-season per-game rank, 17 without category values, and 9 without category tags. Missing values are recorded as null, not filled with estimates. The prior injury-branch test failure (`Cannot locate player pool/category tags in index.html`) no longer describes the current file-split tests; the full suite result is recorded with this refresh.

Validation: `npm test` passed 17/17 test files, including the current bundled-data and injury-state checks; `node audit-data.js --json` reported zero errors; `node scripts/rebuild-rank.js --check` found the new order current. `DATA_VERSION` is `2026-09-29b` so saved drafts are not reused after the ADP and rank change.
