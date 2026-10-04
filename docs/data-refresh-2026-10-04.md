# Player data refresh, 4 October 2026

Prepared on `claude/yahoo-multiuser` and approved for promotion to production (`main`) and Yahoo development (`test/yahoo-draft-copilot`). The release promotes only this player-data refresh.

## ADP

[Hashtag Basketball's table](https://hashtagbasketball.com/fantasy-basketball-adp) is stamped **04 October 2026**. The capture contains 420 player rows, 188 numeric Yahoo ADPs ending at average pick 123, and 307 numeric Fantrax ADPs. Only Yahoo and Fantrax columns were imported. ESPN and the ESPN-inclusive blend were excluded.

The table matched 257 of the app's 270 players. **406 values changed: 179 Yahoo and 227 Fantrax**, including 30 changes of at least three picks. Four Fantrax values became available: Luke Kennard, Gradey Dick, Goga Bitadze and Yang Hansen. Yahoo now leaves Adem Bona and Duncan Robinson blank, so their Yahoo values became null. All 13 absent pool players were already unlisted on both platforms and retained their values. Bronny James Jr. and Jordan Poole remain outside the pool.

Selected ADP changes:

| Player | Platform | Previous | Current |
| --- | --- | ---: | ---: |
| Mark Williams | Fantrax | 113.3 | 136.7 |
| Daniel Gafford | Yahoo | 107.9 | 123.0 |
| Rui Hachimura | Yahoo | 107.7 | 118.7 |
| Jonathan Kuminga | Fantrax | 220.0 | 207.0 |
| Khaman Maluach | Fantrax | 181.2 | 170.2 |
| Shaedon Sharpe | Fantrax | 190.0 | 199.5 |
| Kon Knueppel | Yahoo | 41.7 | 45.8 |

Team and position fields were not imported. Hashtag lists Hield in Charlotte and Dillingham in Chicago, reversing their recent trade. The app retained Hield in Chicago and Dillingham in Charlotte. [NBA.com's transaction report](https://www.nba.com/news/hornets-trade-buddy-hield-bulls-rob-dillingham) also reports Dillingham's subsequent waiver; his current roster status needs review before another team change.

Rebuilt the built-in rank order and ADP-based role arrows. Historical team history, positions, per-game stats, category values and prior-season ranks were preserved. `DATA_VERSION` is now `2026-10-04`, which invalidates older saved drafts because player indexes changed.

## Player news

- Added Brandon Ingram's injury flag. Heel surgery and a partial Achilles tear will keep him out for opening night; no timetable. [NBA.com / Associated Press, September 29](https://www.nba.com/news/brandon-ingrams-clippers-debut-on-hold-after-heel-surgery-partial-achilles-tear).
- Added Tobias Harris's injury flag. A left calf strain during camp requires reevaluation after preseason; he is questionable for the October 20 opener. [Michael C. Wright reporting the Spurs update, via Yahoo Sports / HoopsHype, October 4](https://uk.sports.yahoo.com/news/tobias-harris-evaluated-preseason-calf-223559330.html).
- Removed Mark Williams's unconfirmed February return estimate. The injury record now says extended absence with no confirmed return date.
- Whitmore participated in Denver camp on September 29. [NBA.com player news](https://www.nba.com/player/1641715/cam-whitmore). His prior injury flag remains pending confirmation of current restrictions or clearance. Updated its text so it no longer describes camp participation as unknown.
- Suggs's earlier August surgery/indefinite-absence note could not be reconfirmed. His [NBA.com profile](https://www.nba.com/player/1630591/jalen-suggs) has September role coverage and a [September 30 team camp interview](https://www.nba.com/magic/videos/jalen-suggs-orlando-magic-training-camp-day-two-20260930), but these do not establish unrestricted availability. His flag remains pending review; its text now states that uncertainty rather than asserting a current indefinite absence.

There are 12 injury flags. Older records retain their own source dates. This is a targeted news review, not proof that every pool player's availability is current. Ordinary one-game preseason absences were not turned into blanket injury flags. Bradley Beal has a knee report but is outside the pool.

## Validation

- The post-import comparison has zero Yahoo/Fantrax differences for matched players.
- The data audit has zero errors or unmatched records. Coverage is 186/270 Yahoo and 241/270 Fantrax. There are 33 missing prior-season ranks, 17 missing category-value records and 9 missing category labels.
- Historical stats, positions, teams and prior team history match the pre-refresh snapshot.
- All 21 test suites pass. A test that assumed a particular single-platform player existed in the live data now uses fixed Yahoo-only and Fantrax-only examples.
- Rank order, formatting, JavaScript syntax and diff checks passed. Browser checks passed on four mobile sizes, including 320px, and at 1280px desktop, with drafting, Undo and navigation. See the provenance README for details.

The extracted CSV and pre-import report are in `scripts/data-provenance/2026-10-04-refresh/`.
