"""Build playoff-data.js from the Hashtag Basketball Yahoo schedule grid.

The grid was fetched on 2026-09-12 from
https://hashtagbasketball.com/nba-fantasy-schedule (Platform: Yahoo).
Each team's W1..W23 row is transcribed below and cross-checked against the
page's own RGP (remaining games) column: every row must sum to 80.
Weeks 18-23 map to Monday-Sunday Yahoo weeks:
  W18 2027-03-01..07, W19 03-08..14, W20 03-15..21,
  W21 03-22..28, W22 03-29..04-04, W23 04-05..11.
Team abbreviations are normalized to the app's standard codes
(GS->GSW, NO->NOP, NY->NYK, PHO->PHX, SA->SAS, WAS->WSH).

For future refreshes use scripts/import-playoff-schedule.py on saved
copies of the grid HTML instead.
"""
import json
from pathlib import Path

# team -> [W1..W23] as displayed on the Yahoo grid, 2026-09-12
GRID = {
 'ATL':[3,4,4,3,3,2,3,4,3,3,4,3,4,3,4,4,5,3,4,4,3,4,3],
 'BOS':[2,4,4,3,4,3,3,4,2,4,3,3,4,4,4,4,4,3,4,3,4,4,3],
 'BKN':[3,3,4,2,3,4,3,4,4,3,4,4,3,4,3,4,3,4,3,4,3,4,4],
 'CHA':[3,4,3,3,2,3,3,4,4,4,4,3,3,4,4,3,5,2,4,3,4,4,4],
 'CHI':[3,3,3,3,4,3,3,4,3,3,5,3,3,4,3,4,4,4,3,3,4,4,4],
 'CLE':[2,4,4,4,3,3,3,4,3,4,3,4,3,4,4,4,4,3,4,3,2,4,4],
 'DAL':[3,3,4,4,3,2,2,4,3,3,4,3,4,4,4,3,5,2,4,4,4,4,4],
 'DEN':[2,3,3,3,4,3,3,3,4,4,3,5,3,4,4,4,3,3,4,4,3,4,4],
 'DET':[3,3,3,3,4,3,3,4,4,3,4,3,3,4,4,3,4,3,4,3,4,4,4],
 'GS':[3,4,3,3,4,3,2,4,4,3,3,4,4,3,4,3,3,4,4,3,4,4,4],
 'HOU':[3,4,3,4,3,3,3,4,2,4,3,4,4,4,3,4,4,4,3,3,4,4,3],
 'IND':[3,4,3,4,3,3,3,3,4,3,4,4,3,3,3,4,5,3,3,4,3,4,4],
 'LAC':[3,3,3,3,3,4,3,3,4,4,3,3,4,3,4,4,4,3,4,3,4,4,4],
 'LAL':[3,4,4,3,3,3,2,4,4,4,3,4,4,4,3,3,4,4,3,4,3,3,4],
 'MEM':[3,3,3,4,4,4,3,4,4,2,4,3,3,3,3,3,5,3,4,4,4,3,4],
 'MIA':[3,3,4,3,3,3,3,4,4,3,4,4,3,3,4,4,4,3,4,3,3,4,4],
 'MIL':[3,3,4,4,3,4,3,4,3,4,3,4,3,3,3,4,4,3,3,3,4,4,4],
 'MIN':[3,4,4,2,4,4,3,3,4,4,3,3,4,4,4,2,4,3,4,2,4,4,4],
 'NO':[3,3,4,4,4,3,3,4,3,4,4,2,2,4,4,4,4,4,4,4,3,2,4],
 'NY':[3,3,3,4,4,3,3,3,4,3,3,4,4,3,4,3,5,3,3,3,4,4,4],
 'OKC':[3,3,4,4,3,3,3,3,4,4,3,3,4,4,4,3,4,3,4,3,4,3,4],
 'ORL':[3,3,3,3,4,3,2,4,4,4,4,4,3,4,3,4,4,3,3,4,4,3,4],
 'PHI':[4,3,4,3,3,4,3,2,4,3,4,3,4,4,4,3,4,4,3,4,4,3,3],
 'PHO':[2,2,4,4,3,4,3,4,3,4,4,2,4,4,3,4,4,3,4,4,4,4,3],
 'POR':[2,3,4,3,4,4,3,3,4,2,4,4,4,3,3,5,4,4,3,4,3,4,3],
 'SAC':[3,3,4,3,3,3,3,3,3,4,4,4,3,4,3,4,4,3,4,4,3,4,4],
 'SA':[3,3,4,4,3,4,3,4,4,4,3,2,3,3,4,3,5,3,3,4,3,4,4],
 'TOR':[3,3,3,4,3,3,3,4,3,4,4,4,3,4,4,3,4,3,3,4,4,3,4],
 'UTA':[3,3,4,4,4,3,3,4,3,3,4,4,4,3,4,2,4,4,3,3,4,3,4],
 'WAS':[3,3,4,4,4,2,3,4,4,3,3,4,4,3,3,4,4,4,3,3,4,3,4],
}
ALIAS = {'GS':'GSW','NO':'NOP','NY':'NYK','PHO':'PHX','SA':'SAS','WAS':'WSH'}

assert len(GRID) == 30, 'need 30 teams'
for team, weeks in GRID.items():
    assert len(weeks) == 23, team
    assert all(0 <= n <= 7 for n in weeks), team
    assert sum(weeks) == 80, '%s row sums to %d, page says 80' % (team, sum(weeks))

import datetime
base = datetime.date(2027, 3, 1)  # Monday of Yahoo week 18
week_meta = []
for w in range(18, 24):
    start = base + datetime.timedelta(weeks=w - 18)
    end = start + datetime.timedelta(days=6)
    assert start.weekday() == 0 and end.weekday() == 6, w
    week_meta.append({'week': w, 'start': str(start), 'end': str(end)})

teams = {ALIAS.get(t, t): GRID[t][17:23] for t in GRID}
assert len(teams) == 30 and all(len(v) == 6 for v in teams.values())

data = {
    'season': '2026-27',
    'checked': '2026-09-12',
    'source': 'https://hashtagbasketball.com/nba-fantasy-schedule',
    'dateSource': 'https://hashtagbasketball.com/advanced-nba-schedule-grid',
    'defaultSource': 'https://basketball.fantasysports.yahoo.com/nba/gamedates',
    'defaultStart': 20,
    'weeks': week_meta,
    'teams': teams,
}
out = Path(__file__).resolve().parent.parent / 'playoff-data.js'
out.write_text(
    '/* Yahoo weekly schedule snapshot (transcribed from the grid fetched 2026-09-12;\n'
    '   each row cross-checked against the page totals). Refresh with scripts/import-playoff-schedule.py. */\n'
    '(function(r){var data=' + json.dumps(data, indent=2)
    + ';if(typeof module!=="undefined"&&module.exports)module.exports=data;else r.PlayoffData=data;})'
      "(typeof globalThis!==\"undefined\"?globalThis:this);\n")
print('Wrote', out, '-', len(teams), 'teams, Yahoo weeks 18-23, default 20-22')
