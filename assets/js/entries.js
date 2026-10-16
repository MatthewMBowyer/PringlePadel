/* Pringle Padel — tournament entries
   ============================================================
   Shared data layer for the entry flow. Deliberately tiny: it holds the
   event list and talks to the Google Sheet. Nothing visual lives here.

   Two modes, chosen automatically:

     LIVE    window.PP_CONFIG.scriptUrl is set. Entries are read from and
             written to the Sheet through Apps Script, so every visitor
             sees the same list.

     OFFLINE scriptUrl is blank. Entries fall back to this browser's
     localStorage so the flow can be demonstrated with no backend. Names
     here are only ever visible in the browser that created them.

   See SETUP.md to go live.
   ============================================================ */

const PP_ENTRIES = {

  storageKey: 'pp_entries_v1',

  bank: {
    accountName: 'L Smith',
    bank: 'Discovery Bank',
    accountNumber: '16418811292',
    branch: '679000'
  },

  divisions: [
    { id: 'ladies', name: 'Ladies' },
    { id: 'mixed', name: 'Mixed' },
    { id: 'mens', name: 'Mens' }
  ]
};

/* Set by assets/js/pp-config.js. Absent means offline mode. */
function ppScriptUrl() {
  return (window.PP_CONFIG && window.PP_CONFIG.scriptUrl) || '';
}

function ppIsLive() {
  return ppScriptUrl() !== '';
}

/* ----------------------------------------------------------- open events
   Events currently accepting entries. They appear on the tournaments page
   with an Enter button. */
const PP_EVENTS = [
  {
    id: 'only4thefans-tournament',
    name: 'Only4thefans Tournament',
    date: 'Saturday 7 November 2026',
    venue: 'Indoor Padel Revolution',
    format: 'Ladies, Mixed and Mens divisions',
    price: 300,
    divisions: true,
    image: 'images/only4thefans-tournament-banner.jpg',
    url: 'only4thefans-tournament.html'
  }
];

/* A team entry is two players, so it costs two entries. */
const PP_TEAM_SIZE = 2;

function ppTeamPrice(event) {
  return event.price * PP_TEAM_SIZE;
}

function ppEntryPrice(event, isTeam) {
  return isTeam ? ppTeamPrice(event) : event.price;
}

function ppEvent(id) {
  return PP_EVENTS.find(function (e) { return e.id === id || e.name === id; }) || null;
}

/* --------------------------------------------------------------- helpers */

function ppEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function ppMoney(n) {
  return 'R' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/* ----------------------------------------------------------- offline store */

function ppLoadLocal() {
  try {
    const raw = localStorage.getItem(PP_ENTRIES.storageKey);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function ppSaveLocal(list) {
  try {
    localStorage.setItem(PP_ENTRIES.storageKey, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------- sheet calls */

/* Apps Script answers a GET with JSON. Reading it needs no credentials:
   the script itself decides which columns leave the building. */
function ppGet(params) {
  const url = ppScriptUrl() + '?' + new URLSearchParams(params).toString();
  return fetch(url, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('Request failed (' + r.status + ')');
    return r.json();
  });
}

/* POST as text/plain on purpose: it is a CORS-simple request, so the
   browser does not fire a preflight that Apps Script cannot answer. */
function ppPost(payload) {
  return fetch(ppScriptUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }).then(function (r) {
    if (!r.ok) throw new Error('Request failed (' + r.status + ')');
    return r.json();
  });
}

/* --------------------------------------------------------------- entry API

   Each of these resolves to a plain array or object, so the pages never
   need to know whether the data came from the Sheet or from localStorage. */

/* Paid entries for one event. In live mode the Sheet sends only the
   publishable columns, so a phone number cannot reach the page. */
function ppPaidEntries(event) {
  const ev = typeof event === 'string' ? ppEvent(event) : event;
  if (!ev) return Promise.resolve([]);

  if (!ppIsLive()) {
    return Promise.resolve(ppLoadLocal().filter(function (b) {
      return b.Event === ev.name && b.Paid === true;
    }));
  }

  return ppGet({ action: 'public' }).then(function (res) {
    const all = (res && res.entries) || [];
    return all.filter(function (e) { return e.Event === ev.name; });
  });
}

/* Paid-entry count for one event. Derived from the paid list so the
   public page never learns how many unpaid entries exist. */
function ppPaidCount(event) {
  const ev = typeof event === 'string' ? ppEvent(event) : event;
  if (!ev) return Promise.resolve(0);

  if (!ppIsLive()) {
    return Promise.resolve(ppLoadLocal().filter(function (b) {
      return b.Event === ev.name && b.Paid === true;
    }).length);
  }

  return ppGet({ action: 'public' }).then(function (res) {
    const counts = (res && res.counts) || {};
    return counts[ev.name] || 0;
  });
}

/* Submit one entry. Resolves with { reference } so the receipt can show
   the exact string Lea will look for on the bank statement. */
function ppSubmitEntry(payload) {
  if (!ppIsLive()) {
    /* Offline mode: mirror the server's naming rule so the demo receipt
       looks the same as the real one. */
    const ref = payload.TeamName || (payload.FirstName + ' ' + payload.Surname);
    const list = ppLoadLocal();
    list.push(Object.assign({}, payload, {
      Reference: ref,
      Paid: false,
      Entered: new Date().toISOString()
    }));
    ppSaveLocal(list);
    return Promise.resolve({ success: true, reference: ref });
  }

  return ppPost(payload).then(function (res) {
    if (!res || !res.success) {
      throw new Error((res && res.message) || 'Submission failed.');
    }
    return res;
  });
}

/* ------------------------------------------------------------- organiser API

   These require the passcode, which is checked inside Apps Script — never
   in this file, because this file is public. */

function ppOrganiserList(passcode) {
  return ppGet({ action: 'list', passcode: passcode }).then(function (res) {
    if (!res || !res.success) throw new Error((res && res.message) || 'Could not load entries.');
    return res.entries || [];
  });
}

function ppSetPaid(passcode, reference, paid) {
  return ppGet({
    action: 'markPaid',
    passcode: passcode,
    reference: reference,
    paid: paid ? 'true' : 'false'
  }).then(function (res) {
    if (!res || !res.success) throw new Error((res && res.message) || 'Could not update.');
    return res;
  });
}
