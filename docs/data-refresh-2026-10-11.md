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

The app now has 17 injury flags. Policy is unchanged: flag absences expected to reach opening night (October 20-21) or beyond; one-game preseason scratches are not flagged. Every source below was opened during this review.

| Player | Change | Source |
| --- | --- | --- |
| Isaiah Stewart | **Added.** Moderate left ankle sprain on October 5; reevaluation in two weeks, expected to miss the opener. | [Rotoworld / NBC Sports, Oct 9](https://www.nbcsports.com/fantasy/basketball/player-news/2026-10-05/isaiah-stewart-ankle-injured-in-grizzlies-debut) |
| Jusuf Nurkic | **Added.** Partial plantar plate tear, second toe of right foot, from the October 4 opener; out at least four weeks. | [Roundtable citing Chris Haynes, Oct 8](https://roundtable.io/sports/nba/jazz/news/jusuf-nurkic-injury-forces-utah-jazz-into-unexpected-center-audition) |
| Kyle Filipowski | **Added.** Offseason herniated-disc surgery; not cleared for on-court work, no timeline. | [Rotoworld / NBC Sports, Oct 10](https://www.nbcsports.com/fantasy/basketball/player-news/2026-10-10/filipowski-back-not-cleared-for-on-court-work) |
| Nic Claxton | Updated: reevaluation right before the regular season; opener "up in the air". Replaces the earlier "around October 19" estimate. | [Chicago Sun-Times, Oct 7](https://chicago.suntimes.com/bulls/2026/10/07/nic-claxton-injury-isnt-great-bulls-start-season) |
| Mark Williams | Updated: at least five months out per John Gambadoro, likely until about February. | [NBC Sports, Sep 11](https://www.nbcsports.com/nba/news/suns-center-mark-williams-undergoes-shoulder-surgery-likely-out-until-february) |
| Kristaps Porzingis | Updated: Kerr called it "definitely concerning" on October 8; opener doubtful. | [Larry Brown Sports via Yardbarker, Oct 8](https://www.yardbarker.com/r/20261008/0/ar/44398317_127) |
| Donte DiVincenzo | **Corrected.** The October 6 flag attributed an All-Star-break target to ESPN's Brian Windhorst; no such report could be found. Now: Lloyd gave no timeline; DiVincenzo expects to play at some point this season. | [Rotoworld citing The Athletic, Sep 28](https://www.nbcsports.com/fantasy/basketball/player-news/2026-09-28/divincenzo-achilles-expects-to-play-this-season) |

Reviewed with no change: Coby White, Max Strus, Grant Williams, Brandon Ingram, Tobias Harris, Dereck Lively II, Jimmy Butler, Moses Moody, Kon Knueppel, Shaedon Sharpe. The October 6 removals of Suggs (illness, ramping up at practice) and Whitmore (played October 4) stand.

Seen but not flagged as short-term preseason absences: Haliburton (ankle tweak), Holmgren (quad contusion), Hartenstein (ankle), Fox (undisclosed, two games), Harden (ankle soreness), P.J. Washington (ankle), Miles Bridges (ankle), Buzelis (ankle), Kessler (finger), Sexton (lower body), Porter Jr. and Day'Ron Sharpe (soreness), Dejounte Murray (toe), Sabonis (undisclosed), Anthony Black (ankle), Markkanen (neck), Brandon Miller (shin), Tre Jones (hip). Irving is cleared with a minutes restriction. Fox is the one to recheck before drafting if his absence continues.

The research pass was delegated and then verified: it proposed a January-February target for Butler that its cited source does not contain, so that was not adopted. This review does not certify availability for every NBA player.

## Validation

All 19 test suites pass. The data audit reports zero errors and orphan records. All 260 matched players agree with the source's Yahoo and Fantrax values. Rank order and movers were regenerated after the injury changes.
