/* Pringle Padel — tournament entries
   ============================================================
   Shared data layer for the entry flow. Deliberately tiny: it holds
   the event list and the booking records, and nothing visual. All
   styling comes from assets/css/main.css like the rest of the site.

   booking.html posts each entry straight to the Apps Script URL, which
   is where the Sheet gets written. The records kept here are the visitor's
   own copy, used to render the receipt and the confirmed list.
   ============================================================ */

const PP_ENTRIES = {

  storageKey: 'pp_entries_v1',

  bank: {
    accountName: 'L Smith',
    bank: 'Discovery Bank',
    accountNumber: '16418811292',
    branch: '679000'
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

/* Reference codes identify an entry, e.g. SUN-K3F9A. The player puts this in
   the EFT payment reference so Lea can match money to a name.

   The reference has to be unique across every visitor, not just this browser.
   A per-browser counter cannot do that: each visitor starts from the same
   value, so everyone is handed the same reference and Lea cannot tell two
   payments apart. Derive it from the clock plus randomness instead. */
function ppNextRef(event) {
  const taken = ppLoad().map(function (b) { return b.ref; });
  let ref;
  do {
    const t = Date.now().toString(36).slice(-3);
    const r = Math.random().toString(36).slice(2, 5);
    ref = event.refPrefix + '-' + (t + r).toUpperCase();
  } while (taken.indexOf(ref) !== -1);
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
