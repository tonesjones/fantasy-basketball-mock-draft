#!/usr/bin/env python3
"""Add the 32 add-candidate players to the mock-draft pool (237 -> 269).

Inputs (colocated in this directory; collected 2026-09-13):
  hashtag_new32.json      team/pos/adp from Hashtag 2026-27 table
  bref_new32.json         BRef 2025-26 totals + mpg (+ dnp list)
  bm_new32.json           Basketball Monster NBA 25-26 per-game ranks
  cv_ref.json             frozen per-game means/sds (2026-09-12 derivation)
  totalz_225.json         frozen reference total-z (2026-09-12 derivation)
  lasttotal_ref.json      frozen totals means/sds (2026-09-12 derivation)
  lastTotal-2025-26.json  raw working file from the 2026-09-12 derivation

Re-run:  SITE_DIR=/path/to/pre-expansion/checkout python3 merge_new32.py
  SITE_DIR must point at a checkout whose index.html has 237 PLAYERS rows
  (the script asserts this and refuses to run twice). Outputs are edited
  in place: index.html (PLAYERS rows, CATS tags, copy, DATA_VERSION) and
  player-data.js (32 PDATA entries, header note).

Methodology (frozen reference population):
  cv and lastTotal for new players are z-scored against the FROZEN 225-player
  reference population used for the original 2026-09-12 derivation (same
  Basketball-Reference 2025-26 totals, same league averages FG% .471 / FT% .783,
  same per-game and totals means/SDs). This keeps all 237 existing players'
  published values byte-identical; new players' z-scores are on exactly the
  same scale. Verified: re-running the derivation on the 225 reproduces every
  existing cv and lastTotal with 0 mismatches.
  lastTotal for a new player = 1 + (# of reference players with higher total-z).
  Ties with existing ranks are possible and left as-is (documented, honest).

Outputs: edits mock-draft-site/index.html (PLAYERS rows, CATS tags, copy,
DATA_VERSION) and mock-draft-site/player-data.js (PDATA entries, header).
Does NOT commit; does NOT rebuild the widget (separate step).
"""
import json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Repo root by default (this script lives at
# scripts/data-provenance/2026-09-13-pool-expansion/); override with SITE_DIR
# to run against a pristine pre-expansion checkout for verification.
SITE = os.environ.get('SITE_DIR', os.path.normpath(os.path.join(HERE, '..', '..', '..')))
CATS9 = ["PTS","REB","AST","STL","BLK","3PM","FG%","FT%","TO"]
LG_FG, LG_FT = 0.471, 0.783

def load(p):
    with open(p, encoding='utf-8') as f: return json.load(f)

def inp(name):
    return load(os.path.join(HERE, name))

hashtag = inp('hashtag_new32.json'); hashtag.pop('_meta', None)
bref = inp('bref_new32.json')
bm = inp('bm_new32.json'); bm.pop('_meta', None)
cv_ref = inp('cv_ref.json')              # frozen per-game means/sds
totalz_225 = inp('totalz_225.json')       # frozen reference total-z
lt_ref = inp('lastTotal-2025-26.json')

totals, mpg = bref['totals'], bref['mpg']
dnp = {d['name']: d['reason'] for d in bref.get('dnp', [])}

# The 32, in the canonical order from adp-refresh-2026-09-13.md
NEW32 = ["AJ Green","Damian Lillard","Jaden McDaniels","Derik Queen","Aday Mara",
"Al Horford","Luke Kennard","Andre Drummond","Day'Ron Sharpe","Moussa Diabate",
"Ty Jerome","Duncan Robinson","Allen Graves","Cedric Coward","Sam Hauser",
"Kelly Oubre Jr.","CJ McCollum","Ajay Mitchell","Draymond Green",
"Ryan Kalkbrenner","Sandro Mamukelashvili","Peyton Watson","Yaxel Lendeborg",
"Kevin Porter Jr.","Jrue Holiday","Julian Champagnie","Christian Braun",
"Collin Sexton","Egor Demin","Paul Reed","Morez Johnson Jr.","Jonathan Kuminga"]
assert len(NEW32) == 32 and len(set(NEW32)) == 32

def pgvals(s):
    g = s['G']
    return [s['PTS']/g, s['TRB']/g, s['AST']/g, s['STL']/g, s['BLK']/g, s['3P']/g,
            (s['FG']-LG_FG*s['FGA'])/g, (s['FT']-LG_FT*s['FTA'])/g, s['TOV']/g]

def f2(v):
    v = round(v, 2)
    if v == 0: v = 0.0  # normalize -0.0
    s = str(v)
    return s

def fg(v):
    s = ('%g' % v)
    return s

def cv_for(name):
    v = pgvals(totals[name])
    z = [(v[c]-cv_ref['means'][c])/cv_ref['sds'][c] for c in range(9)]
    z[8] = -z[8]
    return [round(x, 2) for x in z]

def totalz_for(name):
    s = totals[name]
    raw = {'PTS':s['PTS'],'3PM':s['3P'],'REB':s['TRB'],'AST':s['AST'],'STL':s['STL'],
           'BLK':s['BLK'],'TOV':s['TOV'],'FG':s['FG']-LG_FG*s['FGA'],'FT':s['FT']-LG_FT*s['FTA']}
    ref = inp('lasttotal_ref.json')
    z = 0.0
    for c in ['PTS','3PM','REB','AST','STL','BLK','TOV','FG','FT']:
        zi = (raw[c]-ref['means'][c])/ref['sds'][c]
        if c == 'TOV': zi = -zi
        z += zi
    return z

def tags_for(cv):
    order = sorted(range(9), key=lambda c: cv[c], reverse=True)
    return [CATS9[c] for c in order[:4] if cv[c] > 0]

# ---- build new-player records ----
recs = []
for n in NEW32:
    h = hashtag.get(n)
    assert h and h['team'] and h['pos'] and h['adp'] is not None, f'missing hashtag data for {n}'
    rec = {'name': n, 'team': h['team'], 'pos': h['pos'], 'adp': h['adp'],
           'played': n in totals}
    if rec['played']:
        rec['cv'] = cv_for(n)
        tz = totalz_for(n)
        rec['lastTotal'] = 1 + sum(1 for v in totalz_225.values() if v > tz)
        rec['mpg'] = mpg[n]
        rec['last'] = bm.get(n)  # int or None
        rec['tags'] = tags_for(rec['cv'])
    else:
        rec['reason'] = dnp.get(n, 'no 2025-26 data')
        assert n in dnp, f'{n} has no totals but is not in dnp list'
    recs.append(rec)

recs.sort(key=lambda r: r['adp'])  # ascending ADP for insertion

# ---- 1. PLAYERS rows in index.html ----
html_p = os.path.join(SITE, 'index.html')
html = open(html_p, encoding='utf-8').read()
m = re.search(r'var PLAYERS=\[\r?\n', html)
assert m, 'PLAYERS array not found'
start = m.end()
# find matching close: the array ends with "];\nPLAYERS.forEach"
m2 = re.search(r'\r?\n\];\r?\nPLAYERS\.forEach', html[start:])
assert m2, 'PLAYERS array end not found'
body = html[start:start+m2.start()]
row_re = re.compile(r'\["(?:[^"\\]|\\.)*",\[(?:[^\]]*)\],"(?:[^"\\]|\\.)*"\]')
rows = row_re.findall(body)
assert len(rows) == 237, f'expected 237 PLAYERS rows, found {len(rows)}'
# verify the regex captured the whole body (no stray text)
stripped = row_re.sub('', body)
assert re.sub(r'[\s,]', '', stripped) == '', 'unparsed text in PLAYERS body: %r' % stripped[:200]

def fmt_pos(plist):
    return '[' + ', '.join("'%s'" % p for p in plist) + ']'

# insertion rule: ascending ADP; each new player goes to 0-based index
# round(adp)-1, i.e. its built-in rank becomes round(adp) ("rank ~= ADP").
# Earlier (smaller-ADP) insertions are all at lower indices, so each insertion
# index is unaffected by previous ones. Ties (e.g. 118.5 x2) keep input order.
# insertion rule (documented, deterministic):
#   Positional merge by Yahoo ADP. Each new player targets built-in rank
#   round_half_up(adp); ties (equal rounded ADP) are broken by lower ADP first,
#   then by the original 32-candidate list order (Python sort is stable).
#   Targets are made distinct by pushing later players down one slot when a
#   target rank is already taken. All 237 existing players keep their exact
#   relative order and fill every non-target slot.
# Compatibility note (verified 2026-09-13): the current built-in order is a
#   curated value ranking, NOT an ADP ranking (mean |rank - round(adp)| = 33.2
#   over the 163 existing players with ADP; 48 gaps >= 40). Inserting newcomers
#   at ADP-faithful ranks therefore does not conflict with any ADP-ordering
#   invariant — none exists — and it reorders no existing player.
def rhu(x):
    return int(x + 0.5)  # round half up, no banker's-rounding surprises
ordered = sorted(recs, key=lambda r: (rhu(r['adp']), r['adp']))
targets, prev = [], 0
for r in ordered:
    t = max(rhu(r['adp']), prev + 1)
    targets.append((t, r))
    prev = t
rows_out, oi, ni = [], 0, 0
for p in range(1, 270):
    if ni < len(targets) and targets[ni][0] == p:
        r = targets[ni][1]
        ni += 1
        rows_out.append('["%s",%s,"%s"]' % (r['name'], fmt_pos(r['pos']), r['team']))
    else:
        rows_out.append(rows[oi])
        oi += 1
assert oi == 237 and ni == 32, (oi, ni)
rows = rows_out
assert len(rows) == 269
# rebuild in the existing 3-per-line style, trailing comma on all but the last row
lines = []
for i in range(0, len(rows), 3):
    chunk = rows[i:i+3]
    line = ','.join(chunk)
    if i + 3 < len(rows):
        line += ','
    lines.append(line)
new_body = '\n'.join(lines) + '\n'
html = html[:start] + new_body + html[start+m2.start():]

# copy + version updates
html = html.replace('237-player pool from early 2026-27 preseason rankings.',
                    '269-player pool from early 2026-27 preseason rankings.')
html = html.replace('var DATA_VERSION="2026-09-12";', 'var DATA_VERSION="2026-09-13";')
open(html_p, 'w', encoding='utf-8').write(html)
print('index.html: PLAYERS 237 ->', len(rows))

# ---- 2. CATS tags (derived entries appended before closing };) ----
html = open(html_p, encoding='utf-8').read()
m = re.search(r'\n\};\n', html[html.index('var CATS='):])
# locate the CATS literal end precisely
cats_start = html.index('var CATS=')
cats_end = html.index('\n};', cats_start) + 1  # position of '}'
new_tags = []
for r in recs:
    if r['played'] and r['tags']:
        new_tags.append('"%s":[%s],' % (r['name'], ','.join('"%s"' % t for t in r['tags'])))
tag_block = '\n'.join(new_tags) + '\n'
html = html[:cats_end] + tag_block + html[cats_end:]
open(html_p, 'w', encoding='utf-8').write(html)
print('index.html: CATS +', len(new_tags), 'derived entries (null-cv players left untagged)')

# ---- 3. PDATA entries in player-data.js ----
pd_p = os.path.join(SITE, 'player-data.js')
pd = open(pd_p, encoding='utf-8').read()
assert 'var PDATA={' in pd
# PDATA literal ends right before the injury comment block
m = re.search(r'\n\};\n// injury data current', pd)
assert m, 'PDATA end not found'
ins = m.start() + 1  # before '};'
head = pd[:ins]
# the previous final entry has no trailing comma; add one before appending
assert head.rstrip().endswith('}')
if not head.rstrip().endswith('},'):
    head = head.rstrip('\n') + ',\n'
entries = []
for r in recs:
    n = r['name'].replace('\\', '\\\\').replace('"', '\\"')
    if r['played']:
        cv_s = '[' + ','.join(f2(v) for v in r['cv']) + ']'
        last_s = 'null' if r['last'] is None else str(r['last'])
        entries.append('"%s":{cv:%s,adp:%s,last:%s,lastTotal:%d,mpg:%s},' %
                       (n, cv_s, fg(r['adp']), last_s, r['lastTotal'], fg(r['mpg'])))
    else:
        entries.append('"%s":{adp:%s,last:null,lastTotal:null,mpg:null},' % (n, fg(r['adp'])))
block = '\n'.join(entries) + '\n'
pd = head + block + pd[ins:]

# header: 237 -> 269 + frozen-reference documentation
pd = pd.replace('player-data.js — real fantasy data for the mock draft simulator (237 players).',
                'player-data.js — real fantasy data for the mock draft simulator (269 players).')
frozen_note = (
    "//\n"
    "// 2026-09-13: 32 add-candidate players appended (pool 237 -> 269). Their\n"
    "// `last`, `lastTotal`, `cv`, `mpg` were derived against the FROZEN 2025-26\n"
    "// reference population from the 2026-09-12 derivation (same 225 players'\n"
    "// Basketball-Reference totals, league FG% .471 / FT% .783, same means/SDs),\n"
    "// so all 237 pre-existing players' values are byte-identical and the 32 new\n"
    "// z-scores are on the same scale. lastTotal for a new player = 1 + (number\n"
    "// of reference players with a higher total-z); ties with existing ranks are\n"
    "// possible and left as-is. `last` = Basketball Monster NBA 25-26 per-game\n"
    "// rank where available, else null. 2026 rookies / DNPs carry nulls per the\n"
    "// existing prospect convention (no cv => untagged, replacement-level fill\n"
    "// in grades). Team/pos/adp for the 32 from Hashtag's 2026-27 table (Yahoo\n"
    "// columns, updated 11 Sep 2026); teams cross-checked on 2026-09-13.\n"
)
pd = pd.replace('// Names match the simulator\'s PLAYERS list character-for-character.\n',
                '// Names match the simulator\'s PLAYERS list character-for-character.\n' + frozen_note)
open(pd_p, 'w', encoding='utf-8').write(pd)
print('player-data.js: PDATA +32 entries')

print('\nDone. New-pool summary:')
for r in recs:
    if r['played']:
        print(f"  {r['name']}: {r['team']} {r['pos']} adp={r['adp']} last={r['last']} lastTotal={r['lastTotal']} mpg={r['mpg']}")
    else:
        print(f"  {r['name']}: {r['team']} {r['pos']} adp={r['adp']} DNP ({r['reason']})")
