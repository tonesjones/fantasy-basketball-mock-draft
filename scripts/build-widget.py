"""Build the in-chat widget HTML from the standalone site.

Inlines player-data.js, draft-core.js, data-health.js, playoff-data.js and
playoff-core.js into index.html, and neuters the `localStorage` identifier
(the chat widget validator rejects it; in chat the hatchWidget bridge owns
persistence, so a no-op stub is safe). The standalone files are untouched.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path.home() / 'workspace' / 'fantasy' / 'mock-draft-widget.html'

html = (ROOT / 'index.html').read_text()
for name in ['player-data.js', 'draft-core.js', 'data-health.js',
             'playoff-data.js', 'playoff-core.js']:
    tag = '<script src="%s"></script>' % name
    assert tag in html, 'missing ' + tag
    js = (ROOT / name).read_text()
    assert '</script' not in js, name + ' contains a closing script tag'
    html = html.replace(tag, '<script>\n' + js + '\n</script>')

assert 'localStorage' in html
stub = ('<script>\nvar __LS__={getItem:function(){return null;},'
        'setItem:function(){},removeItem:function(){}};\n(function(){')
assert '<script>\n(function(){' in html
html = html.replace('<script>\n(function(){', stub)
html = html.replace('localStorage', '__LS__')
assert 'localStorage' not in html

OUT.write_text(html)
print('Wrote', OUT, '-', len(html), 'chars')
