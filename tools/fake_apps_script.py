#!/usr/bin/env python3
"""Local stand-in for the Apps Script web app.

Not part of the live site. It exists so the whole booking loop — form,
sheet, organiser screen, public entry list — can be exercised on this
machine before the real /exec URL is plugged in.

It speaks the same JSON contract as apps-script/Code.gs and keeps its rows
in a JSON file instead of a Google Sheet.

    python3 tools/fake_apps_script.py 8990
    PP_CONFIG.scriptUrl = 'http://127.0.0.1:8990/exec'
"""

import json
import os
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

STORE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fake_store.json')
PASSCODE = 'padel1234'

PUBLIC_FIELDS = ['Event', 'TeamName', 'FirstName', 'Surname', 'Division', 'Rank']

LOCK = threading.Lock()


def load():
    if not os.path.exists(STORE):
        return []
    with open(STORE, encoding='utf-8') as fh:
        try:
            return json.load(fh)
        except json.JSONDecodeError:
            return []


def save(rows):
    with open(STORE, 'w', encoding='utf-8') as fh:
        json.dump(rows, fh, indent=2)


def clean(v):
    if v is None:
        return ''
    return str(v).strip()[:200]


def unique_ref(rows, base):
    base = ' '.join(str(base).split()) or 'Entry'
    taken = {r['Reference'].lower() for r in rows}
    if base.lower() not in taken:
        return base
    n = 2
    while f'{base} {n}'.lower() in taken:
        n += 1
    return f'{base} {n}'


def handle_post(body):
    entry_type = clean(body.get('EntryType')).lower()
    players = body.get('PlayerList') or []

    if not clean(body.get('Event')):
        return {'success': False, 'message': 'Missing event.'}
    if not clean(body.get('Mobile')):
        return {'success': False, 'message': 'Missing mobile number.'}
    if not players:
        return {'success': False, 'message': 'Missing player details.'}

    for p in players:
        if not clean(p.get('FirstName')) or not clean(p.get('Surname')):
            return {'success': False, 'message': 'Missing first name or surname.'}

    team_name = clean(body.get('TeamName'))
    if entry_type == 'team' and not team_name:
        return {'success': False, 'message': 'Missing team name.'}

    with LOCK:
        rows = load()

        if entry_type == 'team' and team_name:
            base = team_name
        else:
            base = f"{clean(players[0].get('FirstName'))} {clean(players[0].get('Surname'))}"

        ref = unique_ref(rows, base)
        now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')

        for idx, p in enumerate(players[:2]):
            partner = players[1] if len(players) > 1 else {}
            rows.append({
                'Reference': ref,
                'Event': clean(body.get('Event')),
                'EntryType': entry_type or 'single',
                'TeamName': team_name,
                'Division': clean(body.get('Division')),
                'FirstName': clean(p.get('FirstName')),
                'Surname': clean(p.get('Surname')),
                'Rank': clean(p.get('Rank')),
                'PartnerName': clean(partner.get('FirstName')) if idx == 0 else '',
                'PartnerSurname': clean(partner.get('Surname')) if idx == 0 else '',
                'PartnerRank': clean(partner.get('Rank')) if idx == 0 else '',
                'Players': clean(body.get('Players')),
                'Amount': clean(body.get('Amount')),
                'Mobile': clean(body.get('Mobile')),
                'Email': clean(body.get('Email')),
                'Paid': 'NO',
                'Entered': now,
                'PaidAt': ''
            })

        save(rows)
        return {'success': True, 'reference': ref, 'rows': len(players[:2])}


def public_payload(rows):
    entries = []
    counts = {}
    for r in rows:
        if str(r.get('Paid', '')).upper() != 'YES':
            continue
        counts[r['Event']] = counts.get(r['Event'], 0) + 1
        entries.append({f: r.get(f, '') for f in PUBLIC_FIELDS})
    return {'success': True, 'entries': entries, 'counts': counts}


def set_paid(rows, ref, paid):
    hits = [r for r in rows if r['Reference'].lower() == ref.lower()]
    if not hits:
        return {'success': False, 'message': 'Unknown reference.'}
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')
    for r in hits:
        r['Paid'] = 'YES' if paid else 'NO'
        r['PaidAt'] = now if paid else ''
    return {'success': True, 'reference': ref, 'paid': paid, 'rows': len(hits)}


class Handler(BaseHTTPRequestHandler):
    def _send(self, obj):
        payload = json.dumps(obj).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        action = (q.get('action') or ['public'])[0]

        with LOCK:
            rows = load()

            if action == 'public':
                return self._send(public_payload(rows))

            if (q.get('passcode') or [''])[0] != PASSCODE:
                return self._send({'success': False, 'message': 'Wrong or missing passcode.'})

            if action == 'list':
                return self._send({'success': True, 'entries': rows})

            if action == 'markPaid':
                ref = (q.get('reference') or [''])[0]
                paid = (q.get('paid') or ['false'])[0] == 'true'
                result = set_paid(rows, ref, paid)
                save(rows)
                return self._send(result)

        return self._send({'success': False, 'message': 'Unknown action.'})

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length).decode('utf-8') if length else '{}'
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            return self._send({'success': False, 'message': 'Malformed request.'})
        return self._send(handle_post(body))

    def log_message(self, fmt, *args):
        sys.stderr.write('%s\n' % (fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8990
    print(f'Fake Apps Script on http://127.0.0.1:{port}/exec  (passcode {PASSCODE})')
    HTTPServer(('127.0.0.1', port), Handler).serve_forever()
