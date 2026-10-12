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

  // Organiser passcode for the Lea view. A speed bump, not security:
  // this file is served publicly. See the note on organiser.html.
  adminPasscode: '',

  bank: {
    accountName: 'Pringle Padel',
    bank: 'FNB',
    accountNumber: '62XXXXX4891',
    branch: '250655'
  }
};

/* ----------------------------------------------------------- test events
   Marked as test events on the tournaments page so they are never
   confused with the real tournament history. */
const PP_EVENTS = [
  {
    id: 'luxea-invitational',
    name: 'Luxea Invitational',
    refPrefix: 'LUX',
    date: 'Saturday 14 November 2026',
    venue: 'Indoor Padel Revolution',
    format: 'Mixed doubles, round robin then knockout',
    price: 380,
    capacity: 16,
    image: 'images/Luxea-padel-team-photo.jpeg',
    url: 'luxea-invitational.html'
  },
  {
    id: 'mamma-mia-mixed-cup',
    name: 'Mamma Mia Mixed Cup',
    refPrefix: 'MAM',
    date: 'Saturday 28 November 2026',
    venue: 'Indoor Padel Revolution',
    format: 'Mixed doubles, group stage',
    price: 380,
    capacity: 12,
    image: 'images/mamma_mia_tournament_logo.jpg',
    url: 'mamma-mia-mixed-cup.html'
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

function ppSetPaid(id, paid) {
  const list = ppLoad();
  const b = list.find(function (x) { return x.id === id; });
  if (!b) return false;
  b.paid = !!paid;
  b.paidAt = paid ? new Date().toISOString() : '';
  ppSave(list);
  return true;
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

/* ------------------------------------------------------- sample entries

   Two already-paid entries so the confirmed list and the organiser
   screen are not empty on a first visit. */
function ppSeed() {
  if (ppLoad().length) return;
  ppSave([
    {
      id: 'seed-lux-1', ref: 'LUX-101', eventId: 'luxea-invitational',
      eventName: 'Luxea Invitational', name: 'Charisca & KayCee',
      partner: 'KayCee', rank: '3.0', mobile: '', email: '',
      paid: true, paidAt: '2026-10-02T09:15:00.000Z', enteredAt: '2026-10-01T18:02:00.000Z'
    },
    {
      id: 'seed-lux-2', ref: 'LUX-102', eventId: 'luxea-invitational',
      eventName: 'Luxea Invitational', name: 'Lauren & Magda',
      partner: 'Magda', rank: '3.5', mobile: '', email: '',
      paid: true, paidAt: '2026-10-03T07:40:00.000Z', enteredAt: '2026-10-01T19:31:00.000Z'
    },
    {
      id: 'seed-mam-1', ref: 'MAM-101', eventId: 'mamma-mia-mixed-cup',
      eventName: 'Mamma Mia Mixed Cup', name: 'Debbie & Eleasha',
      partner: 'Eleasha', rank: '2.5', mobile: '', email: '',
      paid: true, paidAt: '2026-10-04T11:05:00.000Z', enteredAt: '2026-10-02T12:00:00.000Z'
    },
    {
      id: 'seed-lux-3', ref: 'LUX-103', eventId: 'luxea-invitational',
      eventName: 'Luxea Invitational', name: 'Lynn & Tracey',
      partner: 'Tracey', rank: '2.0', mobile: '0821234567', email: '',
      paid: false, paidAt: '', enteredAt: '2026-10-05T16:45:00.000Z'
    }
  ]);
}

ppSeed();
