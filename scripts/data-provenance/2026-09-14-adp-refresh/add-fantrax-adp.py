#!/usr/bin/env python3
"""Add Fantrax ADP (adpF) to every PDATA entry in player-data.js.

Source: /tmp/fantrax-map.json  ({"Name": {"yahoo": 2.8, "fantrax": 1.5}, ...})
transcribed from Hashtag Basketball's 2026-27 fantasy ADP table
(https://hashtagbasketball.com/fantasy-basketball-adp, updated 14 Sep 2026).

Safety: the map's "yahoo" value is cross-checked against the PDATA entry's
existing adp (Yahoo) value. Any mismatch aborts that player (reported, not
written) so a transcription error can never silently corrupt data.

Usage: python3 scripts/data-provenance/2026-09-14-adp-refresh/add-fantrax-adp.py
"""
import json, re, sys, shutil

SITE = '/home/hatch/workspace/fantasy/mock-draft-site'
PDATA = SITE + '/player-data.js'
MAP = '/tmp/fantrax-map.json'

src = open(PDATA).read()
# Only the PDATA block: INJ entries below reuse player names as keys.
pdata_block = src.split('var INJ=')[0]
entries = re.findall(r'^"((?:[^"\\]|\\.)+)":\{([^{}]*)\},$', pdata_block, re.M)
pdata = {}
for name, body in entries:
    m = re.search(r'adp:(null|[\d.]+)', body)
    pdata[name] = m.group(1) if m else None
print('PDATA entries parsed:', len(pdata))

mp = json.load(open(MAP))
print('map entries:', len(mp))

missing_in_map = [n for n in pdata if n not in mp]
if missing_in_map:
    print('FATAL: pool names missing from map:', missing_in_map)
    sys.exit(1)

mismatches, applied, no_fantrax = [], 0, []
for name, vals in mp.items():
    if name not in pdata:
        continue  # map may carry extras; only pool names matter
    y = vals.get('yahoo')
    have = pdata[name]
    same = (y is None and have == 'null') or \
           (y is not None and have != 'null' and abs(float(have) - float(y)) < 1e-9)
    if not same:
        mismatches.append((name, have, y))
        continue
    f = vals.get('fantrax')
    f_str = 'null' if f is None else ('%g' % f)
    if f is None:
        no_fantrax.append(name)
    # insert ,adpF:<v> right after adp:<v> in this entry
    pat = re.compile(r'^("' + re.escape(name) + r'":\{[^{}]*?adp:(?:null|[\d.]+))', re.M)
    src, n = pat.subn(r'\1,adpF:' + f_str, src)
    assert n == 1, 'insert failed for ' + name
    applied += 1

print('applied:', applied)
print('players with no Fantrax ADP:', len(no_fantrax))
if mismatches:
    print('YAHOO MISMATCHES (not written) -- inspect before proceeding:')
    for name, have, want in mismatches:
        print('  %s: player-data adp=%s map yahoo=%s' % (name, have, want))
    sys.exit(2)

shutil.copy(PDATA, PDATA + '.bak-fantrax')
open(PDATA, 'w').write(src)
print('wrote', PDATA)
