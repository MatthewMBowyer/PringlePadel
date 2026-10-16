"""Site integrity check.

Run from the repo root:  python3 tests/site_integrity.py

Every link, image, script and stylesheet referenced by a page must resolve
to a file that exists, ignoring markup that is commented out because the
browser never requests it. Also fails if a retired event name is still
referenced, which is how a rename silently breaks a page."""
import os
import re
import sys

ROOT = '.'
html_files = sorted(
    f for f in os.listdir(ROOT)
    if f.endswith('.html') and os.path.isfile(f)
)

problems = []
checked = 0

# Attributes that carry a local path.
REF = re.compile(r'(?:href|src)\s*=\s*["\']([^"\']+)["\']', re.I)
# Paths built inside JS template strings / arrays, e.g. url: '/x.html'
JS_PATH = re.compile(r'["\'](/[A-Za-z0-9_\-./]+\.(?:html|jpg|jpeg|png|webp|css|js))["\']')

for page in html_files:
    raw_text = open(page, encoding='utf-8').read()
    # Commented-out markup is not served, so it cannot break anything.
    text = re.sub(r'<!--.*?-->', '', raw_text, flags=re.S)

    targets = []
    for m in REF.finditer(text):
        targets.append(m.group(1))
    for m in JS_PATH.finditer(text):
        targets.append(m.group(1))

    for raw in targets:
        if raw.startswith(('http://', 'https://', 'mailto:', 'tel:', '#', 'data:', 'javascript:')):
            continue
        # Values interpolated at runtime, not literal paths.
        if '${' in raw or '$(' in raw:
            continue
        # A link may carry a query string.
        path = raw.split('?')[0].split('#')[0]
        if not path:
            continue
        checked += 1
        # GitHub Pages style absolute paths resolve from the site root.
        candidate = path.lstrip('/') if path.startswith('/') else os.path.join(os.path.dirname(page), path)
        candidate = os.path.normpath(candidate)
        if not os.path.exists(candidate):
            # Root-relative on a project page can also mean the repo root.
            alt = os.path.normpath(path.lstrip('/'))
            if not os.path.exists(alt):
                problems.append(f'{page}: missing {raw}')

print(f'checked {checked} local references across {len(html_files)} pages')

# The retired name must be gone from anything that ships.
retired = re.compile(r'only4thefans|only4fans', re.I)
for dirpath, dirnames, filenames in os.walk('.'):
    dirnames[:] = [d for d in dirnames if d not in ('.git', 'node_modules')]
    for fn in filenames:
        # Test files name the retired value on purpose, and entries.js keeps
        # it deliberately in legacyNames so pre-rename bookings still match.
        if 'tests' in dirpath.split(os.sep) or fn == 'entries.js':
            continue
        if fn == 'backend.test.js':
            continue
        if not fn.endswith(('.html', '.js', '.css', '.json', '.md')):
            continue
        fp = os.path.join(dirpath, fn)
        for i, line in enumerate(open(fp, encoding='utf-8', errors='replace'), 1):
            if retired.search(line) and 'legacyNames' not in line:
                problems.append(f'{fp}:{i}: still mentions the retired name')

# The new page must be reachable from the tournaments page.
t = open('tournaments.html', encoding='utf-8').read()
if 'mamma-mia-its-hot-tournament.html' not in t:
    problems.append("tournaments.html: new page not linked")
if 'mamma-mia-its-hot-banner.jpg' not in t:
    problems.append("tournaments.html: new banner not used")
if 'booking.html?event=mamma-mia-its-hot-tournament' not in t:
    problems.append("tournaments.html: Enter button does not point at the new event id")

if os.path.exists('only4thefans-tournament.html'):
    problems.append('old page still present')

print()
if problems:
    print(f'{len(problems)} PROBLEM(S):')
    for p in problems:
        print('  - ' + p)
    sys.exit(1)
print('all local references resolve; no stale tournament name found')
