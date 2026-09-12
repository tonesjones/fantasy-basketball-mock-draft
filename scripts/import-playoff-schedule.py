"""Import saved Hashtag Yahoo grid HTML: python3 scripts/import-playoff-schedule.py grid.html advanced.html
Download source pages separately; no network or dependencies needed by the app.

The initial snapshot (2026-09-12) was transcribed from the live grid with
scripts/build-playoff-data.py instead; this importer is the refresh path.
"""
import sys,re,json,datetime
from html import unescape
from pathlib import Path
raw=Path(sys.argv[1]).read_text(); advanced=Path(sys.argv[2]).read_text()
assert '2026-27' in raw and '2026-27' in advanced, 'Wrong season'
assert re.search(r'value="YAH"[^>]*checked=',raw), 'Select Yahoo grid before export'
for week,label in [(20,'15 Mar - 21 Mar'),(21,'22 Mar - 28 Mar'),(22,'29 Mar - 4 Apr')]:
 assert re.search(r'value="%sy">W%s: %s</option>'%(week,week,re.escape(label)),advanced), 'Unexpected week/date mapping'
def clean(x):return unescape(re.sub('<[^>]*>','',x)).strip()
rows=[]
for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>',raw,re.S):
 cells=[clean(x) for x in re.findall(r'<t[dh]\b[^>]*>(.*?)</t[dh]>',row,re.S)]
 if cells:rows.append(cells)
header=next(r for r in rows if 'W20' in r and 'W23' in r)
alias={'GS':'GSW','NO':'NOP','NY':'NYK','PHO':'PHX','SA':'SAS','WAS':'WSH'}
teams={}
for row in rows:
 if len(row)!=len(header) or not re.fullmatch('[A-Z]{2,3}',row[0]) or row[0]=='TEAM':continue
 teams[alias.get(row[0],row[0])]=[int(row[header.index('W'+str(w))]) for w in range(18,24)]
assert len(teams)==30 and all(len(v)==6 and all(0<=n<=7 for n in v) for v in teams.values())
weeks=[{'week':w,'start':str(datetime.date(2027,3,1)+datetime.timedelta(weeks=w-18)),'end':str(datetime.date(2027,3,7)+datetime.timedelta(weeks=w-18))} for w in range(18,24)]
data={'season':'2026-27','checked':str(datetime.date.today()),'source':'https://hashtagbasketball.com/nba-fantasy-schedule','dateSource':'https://hashtagbasketball.com/advanced-nba-schedule-grid','defaultSource':'https://basketball.fantasysports.yahoo.com/nba/gamedates','defaultStart':20,'weeks':weeks,'teams':teams}
Path('playoff-data.js').write_text('/* Yahoo weekly schedule snapshot. Refresh with scripts/import-playoff-schedule.py. */\n(function(r){var data='+json.dumps(data,indent=2)+';if(typeof module!=="undefined"&&module.exports)module.exports=data;else r.PlayoffData=data;})(typeof globalThis!=="undefined"?globalThis:this);\n')
print('Imported 30 teams, Yahoo weeks 18-23; default 20-22')
