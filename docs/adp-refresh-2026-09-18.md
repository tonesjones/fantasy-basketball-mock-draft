# ADP refresh — 2026-09-18 (applied)

Source: Hashtag Basketball 2026-27 fantasy ADP table
(`https://hashtagbasketball.com/fantasy-basketball-adp`),
stamp moved **14 Sep 2026 → 17 Sep 2026**.
Raw pull: `~/workspace/fantasy/adp-scrape-2026-09-18.json`
(417 rows, Yahoo + Fantrax ADP columns only; ESPN/BLEND ignored per standing rule).
Diff tool: `~/workspace/fantasy/diff_adp.py` (compares table Yahoo → PDATA `adp`,
table Fantrax → PDATA `adpF`; names NFKD-normalized with 6 known alias maps).
Pool: 270 players.

**Applied 2026-09-18:** all 305 value changes written to `player-data.js`
(PDATA block only; injury object untouched), `DATA_VERSION` bumped to
`2026-09-18`, pool unchanged at 270. Post-apply re-diff: 0 differences
vs the scraped table.

## Headline

Yes, a refresh is warranted. 304 of 540 ADP values (270 players × Yahoo +
Fantrax) moved since the Sep-14 import, but 274 of those are < 1.0 of drift
(normal as more drafts enter the averages). 7 players moved ≥ 3 spots.

## Material moves (≥ 3.0)

| Player | Field | Old → New | Δ | Consensus old → new |
|---|---|---:|---:|---|
| Aaron Gordon | adpF | 154.7 → 144.3 | −10.4 | 133.4 → 127.9 (−5.5) |
| Aaron Wiggins | adp | 83.5 → 92.4 | +8.9 | 160.8 → 165.4 (+4.6) |
| AJ Green | adp | 73.3 → 79.2 | +5.9 | 157.4 → 160.5 (+3.1) |
| Brook Lopez | adp | 72.9 → 77.9 | +5.0 | 144.6 → 147.2 (+2.7) |
| Anfernee Simons | adp | 116.8 → 113.0 | −3.8 | 178.8 → 176.9 (−1.9) |
| Davion Mitchell | adp | 115.4 → 111.9 | −3.5 | 127.9 → 126.1 (−1.8) |
| Khaman Maluach | adpF | 193.0 → 189.8 | −3.2 | 156.9 → 155.3 (−1.6) |

(Consensus = mean of available Yahoo + Fantrax, per Draft Lab rule.
Aaron Gordon's −5.5 consensus swing is the only one that moves a player
meaningfully across draft tiers.)

## Newly published values (was null → now has a number): 1

- Nate Ament adpF: null → 243.6 (his Yahoo adp 115.3 was already in)

## Removed values (had a number → now blank): 0

## Pool players still absent from Hashtag's table: 13

Aaron Holiday, Cam Thomas, D'Angelo Russell, Donte DiVincenzo,
Haywood Highsmith, Jaden Ivey, Jonas Valanciunas, Jonathan Isaac,
Jonathan Mogbo, Moses Moody, Nicolas Batum, Ochai Agbaji, Taurean Prince.

(Down from 16 on Sep-14: Caris LeVert, Jarred Vanderbilt, and
Tristan Vukcevic reappeared in the table as ESPN-only rows — still no
Yahoo/Fantrax numbers, so nothing to import for them.)

## Table players with Yahoo ADP not in the pool: 1

- Bronny James Jr. — Yahoo 77.0, Fantrax 243.3

Add-or-not is Tony's call (Lillard stays untagged per his standing decision).

## Applied

Mechanical refresh done 2026-09-18: `adp`/`adpF` overwritten with the
305 changed values, `DATA_VERSION` → `2026-09-18`, 13 absent players'
existing values kept (per the Sep-14 convention). No team/position
changes in this pass. Test suites + data-health validation run below
before any push/deploy decision (push/deploy still need Tony's go-ahead).
