# Player refresh, 16 October 2026

## ADP and rank changes

[Hashtag Basketball's table](https://hashtagbasketball.com/fantasy-basketball-adp), stamped 16 October, has 422 rows. Imported Yahoo and Fantrax only.

For matched pool players, 416 values changed; 49 moved at least three picks, almost all on thin Fantrax tails. Largest: Maxime Raynaud Fantrax 136.8 → 153.9, Mark Williams 157.3 → 174.3, Rui Hachimura 209.9 → 192.9, Devin Vassell 149.8 → 134.2, Collin Gillespie 144.3 → 159.4. Bogdan Bogdanovic, Kevon Looney and Moses Moody gained Fantrax ADP. Tre Jones and Anfernee Simons lost their Yahoo ADP.

Added Ben Simmons (SAC, Yahoo 112.6, Fantrax 220.6), the only table player with a Yahoo ADP outside the pool. The pool is now 275. He has no bundled 2025-26 averages, historical ranks, minutes or category values, so grades use the missing-data fallback.

Regenerated built-in ranks and ADP-based role arrows. `DATA_VERSION` is `2026-10-16`; older saved drafts reset because player indexes changed.

## Injury changes

The app now has 19 injury flags. Policy is unchanged: flag absences expected to reach opening night (October 20-21) or beyond; one-game preseason scratches are not flagged. Every source below was opened during this review.

| Player | Change | Source |
| --- | --- | --- |
| Maxime Raynaud | **Added.** Right patellar subluxation; expected to miss at least the first five or six regular-season games, potentially longer. | [RotoWire citing Frankie Cartoscelli / KHTK, Oct 15](https://www.rotowire.com/basketball/headlines/maxime-raynaud-injury-likely-to-miss-5-6-games-534545) |
| Tristan Vukcevic | **Added** (missed on Oct 6 and Oct 11). Left hip impingement; reevaluation four weeks from October 1. | [RotoWire / Wizards announcement, Oct 1](https://www.rotowire.com/basketball/headlines/tristan-vukcevic-injury-to-miss-four-weeks-533019) |
| Jimmy Butler | Updated: "could be back in the January-to-February range." Status `out`, earliest return January 1. The Pick coach now warns with the sourced window; his market ADP already prices in more than the missed time, so his value rank does not move. | [Anthony Slater / ESPN via ABC7, Oct 16](https://abc7news.com/post/can-jimmy-butler-return-time-resurrect-steph-currys-final-chapter/19943481/) |
| Moses Moody | Updated: potential return between December and January, ahead of Butler. Status `out`, earliest return December 1; as with Butler, the market already prices this in. | [RotoWire citing ESPN, Oct 16](https://www.rotowire.com/basketball/headlines/moses-moody-injury-could-return-by-december-534700) |
| Coby White | Updated: still out with the calf injury; unclear whether he is ready for opening night. Status `out-indefinitely` → `questionable`. | [RotoWire, Oct 15](https://www.rotowire.com/basketball/headlines/royce-oneale-news-perfect-from-field-wednesday-534540) |
| Isaiah Stewart | Corrected earliest return: the Grizzlies' October 9 "at least two weeks" counts from the announcement, so October 23, not October 19. | [RotoWire, Oct 9](https://www.rotowire.com/basketball/headlines/isaiah-stewart-injury-to-miss-at-least-two-weeks-533795) |
| Jusuf Nurkic | Corrected earliest return: "at least the next four weeks" from October 7, so November 4, not November 1. | [RotoWire citing Chris Haynes, Oct 7](https://www.rotowire.com/basketball/headlines/jusuf-nurkic-injury-out-at-least-four-weeks-533498); [Jazz via NBA.com, Oct 8](https://www.nba.com/news/jazz-jusuf-nurkic-foot-injury) |
| Kristaps Porzingis | Updated: Warriors announced October 14 he remains out indefinitely. | [San Francisco Chronicle, Oct 14](https://www.sfchronicle.com/sports/warriors/article/kristaps-porzingis-breaks-silence-warriors-22477452.php) |
| Brandon Ingram | Updated: progressed to court work; will not be ready for the opener. | [FantasyPros citing Joey Linn, Oct 15](https://www.fantasypros.com/nba/news/613989/brandon-ingram-achilles-progresses-to-court-work.php) |
| Donte DiVincenzo | Updated: "late-season return at best" replaced with what the source says: no timetable; he expects to return this season. | [RotoWire citing The Athletic, Oct 5](https://www.rotowire.com/basketball/headlines/donte-divincenzo-injury-targeting-late-season-return-533214) |
| Kyle Filipowski | Re-sourced: still not cleared for on-court work. | [FantasyPros, Oct 12](https://www.fantasypros.com/nba/news/613524/kyle-filipowski-back-not-yet-cleared-on-court-work.php) |
| Dereck Lively II | Re-sourced: some shooting and court work; could miss time to begin the season. | [Grant Afseth via RotoWire feed, Oct 14](https://app.hooplifenba.com/injuries) |
| Nic Claxton, Tobias Harris | Re-sourced: both still expected to be questionable for their openers. | [Fantasy Alarm, Oct 15](https://www.fantasyalarm.com/articles/nba/fantasy-basketball-injury-report/nba-injury-report-heading-into-2026-27-season/197178) |
| Kon Knueppel | Re-sourced: missed the October 15 preseason game; opener unclear. | [RotoWire, Oct 15](https://www.rotowire.com/basketball/headlines/royce-oneale-news-perfect-from-field-wednesday-534540) |

Reviewed with no change: Max Strus, Grant Williams, Mark Williams, Shaedon Sharpe.

Seen but not flagged: Holmgren (bruised quad, out all preseason; the Thunder have not signalled concern for the opener, so **recheck before drafting**), Haliburton, Hartenstein, Fox, Harden, Porter Jr., Brandon Miller and Kyrie Irving (all back playing), P.J. Washington, Kessler and Sabonis (practicing fully), Sexton and Anthony Black (ramping up for the opener), Buzelis, Day'Ron Sharpe, Tre Jones and Markkanen (day-to-day soreness), Dejounte Murray and Aaron Nesmith (preseason-only scratches), Simmons, Simons and Bona (rest; full practice), Aldama (close to returning from surgery). T.J. McConnell's opener is uncertain, but his source could not be opened, so he is not flagged.

The research pass was delegated and then verified. Not adopted: removing Sharpe's earliest-return date (the repo uses reevaluation dates for this, as with Strus and Nurkic), and correcting his surgery date (the source's "yesterday" sits under an "updated" stamp, so the date is ambiguous). This review does not certify availability for every NBA player.

## Validation

All 19 test suites pass. The data audit reports zero errors and orphan records. All 262 matched players agree with the source's Yahoo and Fantrax values. Rank order and movers were regenerated after the injury changes.
