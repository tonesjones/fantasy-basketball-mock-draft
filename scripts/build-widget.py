"""Build the in-chat widget HTML from the standalone site.

Inlines styles.css and every local <script src> referenced by index.html,
and neuters the `localStorage` identifier (the chat widget validator rejects
it; in chat the hatchWidget bridge owns persistence, so a no-op stub is
safe). The standalone files are untouched.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path.home() / 'workspace' / 'fantasy' / 'mock-draft-widget.html'

html = (ROOT / 'index.html').read_text(encoding='utf-8')

css_tag = '<link rel="stylesheet" href="styles.css">'
assert css_tag in html, 'missing ' + css_tag
html = html.replace(css_tag, '<style>\n' + (ROOT / 'styles.css').read_text(encoding='utf-8') + '\n</style>')

def inline(m):
    name = m.group(1)
    js = (ROOT / name).read_text(encoding='utf-8')
    assert '</script' not in js, name + ' contains a closing script tag'
    return '<script>\n' + js + '\n</script>'

html, n = re.subn(r'<script src="([\w.-]+\.js)"></script>', inline, html)
assert n >= 10, 'expected the app scripts, inlined %d' % n

stub = '<script>\nvar __LS__={getItem:function(){return null;},setItem:function(){},removeItem:function(){}};\n</script>\n'
html = html.replace('<script>', stub + '<script>', 1)
html = html.replace('localStorage', '__LS__')
assert 'localStorage' not in html

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding='utf-8')
print('Wrote', OUT, '-', len(html), 'chars')
