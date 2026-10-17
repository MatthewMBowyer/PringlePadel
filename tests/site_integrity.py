"""Site integrity check.

Run from the repo root:  python3 tests/site_integrity.py

Two passes, because a static host serves the commit and not your disk:

  1. Every link, image, script and stylesheet a page references resolves to
     a file that exists. Markup that is commented out is ignored, since the
     browser never requests it.
  2. The same check against HEAD's copy of every tracked page. A rename
     staged before the file is rewritten ships the old markup at the new
     path, which is how a page keeps pointing at an image that was deleted
     in the same commit while the working tree still looks correct.

Both passes also fail if a retired event name reappears in something that
ships, since that is how a rename silently empties a page.
"""
import os
import re
import subprocess
import sys

# Attributes that carry a local path.
REF = re.compile(r'(?:href|src)\s*=\s*["\']([^"\']+)["\']', re.I)
# srcset holds one or more "url [descriptor]" pairs.
SRCSET = re.compile(r'srcset\s*=\s*["\']([^"\']+)["\']', re.I)
# Paths built inside JS strings or template literals, e.g. url: '/x.html'
JS_PATH = re.compile(r'["\'](/[A-Za-z0-9_\-./]+\.(?:html|jpg|jpeg|png|webp|avif|css|js))["\']')

SKIP_PREFIXES = ('http://', 'https://', 'mailto:', 'tel:', '#', 'data:', 'javascript:')

# Names a rename retired. Add to this list when an event or page is renamed.
RETIRED = re.compile(r'only4thefans|only4fans', re.I)


def referenced_paths(markup):
    """Local paths the browser is asked to fetch for a page."""
    text = re.sub(r'<!--.*?-->', '', markup, flags=re.S)
    raw_values = [m.group(1) for m in REF.finditer(text)]
    raw_values += [m.group(1) for m in JS_PATH.finditer(text)]
    for m in SRCSET.finditer(text):
        for candidate in m.group(1).split(','):
            token = candidate.strip().split()[0] if candidate.strip() else ''
            if token:
                raw_values.append(token)

    out = []
    for raw in raw_values:
        if raw.startswith(SKIP_PREFIXES):
            continue
        if '${' in raw or '$(' in raw:
            continue  # interpolated at runtime, not a literal path
        path = raw.split('?')[0].split('#')[0]
        if path:
            out.append((raw, path))
    return out


def resolves(path, page, exists):
    """A page may link relative to itself or from the site root."""
    if path.startswith('/'):
        candidates = [os.path.normpath(path.lstrip('/'))]
    else:
        candidates = [os.path.normpath(os.path.join(os.path.dirname(page), path))]
    return any(exists(c) for c in candidates)


def check_pages(pages, read, exists, label):
    problems = []
    checked = 0
    for page in pages:
        markup = read(page)
        if markup is None:
            continue
        for raw, path in referenced_paths(markup):
            checked += 1
            if not resolves(path, page, exists):
                problems.append(f'{page}: missing {raw}')
    print(f'{label}: {checked} references over {len(pages)} pages')
    return problems


def git(*args):
    return subprocess.run(['git'] + list(args), capture_output=True, text=True)


problems = []
pages = sorted(f for f in os.listdir('.') if f.endswith('.html') and os.path.isfile(f))

problems += check_pages(pages, lambda p: open(p, encoding='utf-8').read(),
                        os.path.exists, 'working tree')

if git('rev-parse', '--git-dir').returncode == 0:
    tracked = set(git('ls-tree', '-r', '--name-only', 'HEAD').stdout.split())
    head_pages = [p for p in pages if p in tracked]
    blobs = {p: git('show', f'HEAD:{p}').stdout for p in head_pages}

    def head_exists(path):
        return os.path.normpath(path).lstrip('./') in tracked

    problems += check_pages(head_pages, lambda p: blobs.get(p),
                            head_exists, 'committed   ')
else:
    print('not a git repository, skipped the committed-state pass')

# A retired name must be gone from anything the browser can load. Tests name
# it on purpose, and entries.js keeps it in legacyNames so bookings made
# before a rename still match their event.
for dirpath, dirnames, filenames in os.walk('.'):
    dirnames[:] = [d for d in dirnames if d not in ('.git', 'node_modules')]
    if 'tests' in dirpath.split(os.sep):
        continue
    for fn in filenames:
        if fn == 'entries.js' or not fn.endswith(('.html', '.js', '.css', '.json', '.md')):
            continue
        fp = os.path.join(dirpath, fn)
        for i, line in enumerate(open(fp, encoding='utf-8', errors='replace'), 1):
            if RETIRED.search(line):
                problems.append(f'{fp}:{i}: still mentions the retired name')

print()
if problems:
    print(f'{len(problems)} PROBLEM(S):')
    for p in problems:
        print('  - ' + p)
    sys.exit(1)
print('all references resolve, in the working tree and in the commit')
