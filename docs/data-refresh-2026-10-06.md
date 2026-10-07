# Player refresh, 6 October 2026

Prepared locally on `claude/yahoo-multiuser`. This refresh is not deployed.

## ADP and rank changes

[Hashtag Basketball's October 6 table](https://hashtagbasketball.com/fantasy-basketball-adp) contains 418 rows, with 187 numeric Yahoo ADPs and 312 numeric Fantrax ADPs. Yahoo's last average pick is 123.4. Imported Yahoo and Fantrax only.

For the original 270 players, 360 values changed: 159 Yahoo and 201 Fantrax. Six changes reached three picks. Davion Mitchell moved from Fantrax 151.4 to 139.8. Mark Williams moved from 136.7 to 141.8. Cam Johnson gained Yahoo ADP 112.5. Mike Conley and Jordan Clarkson gained Fantrax values. Aaron Wiggins and Morez Johnson Jr. now have blank Yahoo ADP. Fourteen players absent from the source retained their previous values.

Added Max Strus and Grant Williams, expanding the pool to 272. Strus has Fantrax ADP 233.4 and no Yahoo ADP. Neither platform lists a numeric ADP for Williams. Their positions come from this table, and their teams match NBA profiles. Existing per-game averages cover both players. Historical ranks, minutes, category values, and strength tags have not been collected for these additions and remain unavailable. Draft grades use the existing missing-data fallback.

Regenerated built-in ranks and ADP-based role arrows. `DATA_VERSION` is `2026-10-06`; older saved drafts reset because player indexes changed. Existing historical stats, teams, and positions were preserved.

## Injury changes

The app now has 14 injury flags. Reevaluation means another assessment, not clearance to play.

| Player | Availability update | Source |
| --- | --- | --- |
| Coby White | Left calf strain. Out for preseason; opener uncertain. | [NBA.com / AP, October 6](https://www.nba.com/news/coby-white-preseason-calf-strain) |
| Max Strus | Partial tear of the right plantar fascia. Misses the season's start; four-week reevaluation from October 5, with no confirmed return. | [Clippers announcement via NBA.com, October 5](https://www.nba.com/news/clippers-max-strus-to-miss-start-of-season-with-foot-injury) |
| Nic Claxton | Hamstring injury. Reassessment in two weeks, around October 19; opening-night availability remains unconfirmed. | [Sportsnet reporting Tiago Splitter, October 5](https://www.sportsnet.ca/nba/article/bulls-nic-claxton-out-two-weeks-with-hamstring-injury/) |
| Grant Williams | Right hamstring injury. Out for preseason; assessment during the season's first week, with no return date. | [NBA player news, September 25](https://www.nba.com/player/1629684/grant-williams) |

Removed unsupported ongoing-injury flags for Suggs and Whitmore. [Suggs returned to on-court work while recovering from illness on October 6](https://www.nba.com/player/1630591/jalen-suggs). [Whitmore played 15 preseason minutes on October 4](https://www.nba.com/player/1641715/cam-whitmore). These observations do not establish unrestricted medical clearance, but the old flags lacked evidence of a current absence. Removing them also removes the injury hard-pass recommendation.

Reviewed the other ten existing flags. No verified newer return timetable justified changing them. Brief preseason designations for Miller, Isaac, Kessler, and Edey do not establish lasting absences. Tatum and Irving remain unflagged. This review does not certify availability for every NBA player.

## Roster review and limitations

Hashtag still lists Hield and Dillingham on the wrong teams. The app keeps its reviewed assignments. [NBA.com reports that the Hornets later waived Dillingham](https://www.nba.com/news/hornets-trade-buddy-hield-bulls-rob-dillingham); this refresh does not establish his next team. The review also covered Jordan Hawkins's Chicago two-way signing and Ariel Hukporti's Achilles injury. Neither player is in the pool.

## Validation

All 21 test suites pass. The internal data audit reports zero errors, unmatched data records, or orphan records. All 258 matched players agree with the source's Yahoo and Fantrax values. Coverage is 185/272 Yahoo and 244/272 Fantrax.

Browser validation found a pre-existing, duplicated, unfinished `renderDataHealth` function that stopped the app from loading. The stale fragment was removed. The current source explanation and mobile label remain. JavaScript syntax now passes. The provenance README records the browser results.

The [routing log](model-routing-2026-10-06.md) records model identities, scope, and limitations.
