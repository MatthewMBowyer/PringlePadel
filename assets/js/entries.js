/* Pringle Padel — tournament entries
   ============================================================
   Shared data layer for the entry flow. Deliberately tiny: it holds
   the event list and the booking records, and nothing visual. All
   styling comes from assets/css/main.css like the rest of the site.

   Storage is localStorage so the flow works end to end today. Set
   PP_ENTRIES.scriptUrl to the Apps Script /exec URL to also write
   each entry into the Google Sheet (the production path).
   ============================================================ */

const PP_ENTRIES = {

  // Apps Script web-app /exec URL. Leave empty to run offline.
  scriptUrl: '',

  storageKey: 'pp_entries_v1',
  counterKey: 'pp_ref_counter_v1',

  bank: {
    accountName: 'Pringle Padel',
    bank: 'FNB',
    accountNumber: '62XXXXX4891',
    branch: '250655'
  }
};

/* ----------------------------------------------------------- open events
   Events currently accepting entries. They appear on the tournaments page
   with an Enter button. */
const PP_EVENTS = [
  {
    id: 'sunday-social',
    name: 'Sunday Social',
    refPrefix: 'SUN',
    date: 'Sunday 18 October 2026',
    venue: 'Indoor Padel Revolution',
    format: 'Social play, mixed pairs, rotate partners',
    price: 250,
    capacity: 16,
    image: 'images/pic02.jpg',
    url: 'sunday-social.html'
  }
];

function ppEvent(id) {
  return PP_EVENTS.find(function (e) { return e.id === id; }) || null;
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

/* ------------------------------------------------------------- storage */

function ppLoad() {
  try {
    const raw = localStorage.getItem(PP_ENTRIES.storageKey);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function ppSave(list) {
  try {
    localStorage.setItem(PP_ENTRIES.storageKey, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

/* Reference codes are unique per event, e.g. LUX-104. The player puts
   this in the EFT payment reference so Lea can match money to a name. */
function ppNextRef(event) {
  let n = 100;
  try {
    n = parseInt(localStorage.getItem(PP_ENTRIES.counterKey) || '100', 10);
  } catch (e) {}
  if (isNaN(n)) n = 100;
  n += 1;
  try { localStorage.setItem(PP_ENTRIES.counterKey, String(n)); } catch (e) {}

  const taken = ppLoad().map(function (b) { return b.ref; });
  let ref = event.refPrefix + '-' + n;
  while (taken.indexOf(ref) !== -1) {
    n += 1;
    ref = event.refPrefix + '-' + n;
  }
  return ref;
}

function ppAddBooking(data) {
  const list = ppLoad();
  const booking = Object.assign({
    id: 'b' + Date.now() + Math.random().toString(36).slice(2, 7),
    paid: false,
    paidAt: '',
    enteredAt: new Date().toISOString()
  }, data);
  list.push(booking);
  ppSave(list);
  return booking;
}

function ppForEvent(eventId, paidOnly) {
  return ppLoad().filter(function (b) {
    return b.eventId === eventId && (!paidOnly || b.paid);
  });
}

function ppCounts(eventId) {
  const all = ppForEvent(eventId, false);
  const paid = all.filter(function (b) { return b.paid; }).length;
  const ev = ppEvent(eventId);
  const capacity = ev ? ev.capacity : 0;
  return {
    entered: all.length,
    paid: paid,
    pending: all.length - paid,
    capacity: capacity,
    left: Math.max(0, capacity - paid),
    full: paid >= capacity,
    pct: capacity ? Math.min(100, Math.round((paid / capacity) * 100)) : 0
  };
}

/* -------------------------------------------------- optional sheet mirror

   Fire-and-forget POST so a Sheet can be kept in step. Deliberately not
   awaited by the UI: a failure here must not lose the player's entry,
   which is already saved locally. */
function ppMirrorToSheet(payload) {
  if (!PP_ENTRIES.scriptUrl) return;
  try {
    fetch(PP_ENTRIES.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(function () { /* offline mirror is best-effort */ });
  } catch (e) {}
}
