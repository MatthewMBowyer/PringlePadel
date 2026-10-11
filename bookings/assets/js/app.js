/* Pringle Padel — Bookings TEST SITE
   Shared data + storage layer.

   Storage: localStorage by default, so the whole flow works with no backend.
   Set CONFIG.scriptUrl to a Google Apps Script /exec URL to also mirror
   bookings to a Sheet (the production path). Nothing else needs to change.

   Editable values live in config.js — this file reads them and falls back to
   the offline defaults when that file is absent or leaves a field empty. */

const FILE_CONFIG = (typeof window !== 'undefined' && window.PP_CONFIG) || {};

const CONFIG = {
  scriptUrl: FILE_CONFIG.scriptUrl || '',
  sheetCsvUrl: FILE_CONFIG.sheetCsvUrl || '',
  adminPasscode: FILE_CONFIG.adminPasscode || '',
  storageKey: 'pp_bookings_v1',
  counterKey: 'pp_ref_counter_v1',
  bank: FILE_CONFIG.bank || {
    accountName: 'Pringle Padel',
    bank: 'FNB',
    accountNumber: '62XXXXX4891',
    branch: '250655'
  }
};

/* ------------------------------------------------------------- 2 test events */
const EVENTS = [
  {
    id: 'luxea-invitational',
    name: 'Luxea Invitational',
    tagline: 'Winter Doubles League Night',
    refPrefix: 'LUX',
    date: 'Saturday 14 November 2026',
    time: '17:00 – 21:00',
    venue: 'Indoor Padel Revolution, 2 Picaroon Street, Johannesburg',
    format: 'Round-robin doubles · 3 sets · rotating partners',
    division: 'Mixed · All levels',
    capacity: 16,
    price: 380,
    prize: 'Winners: 2 × Bullpadel racket bags · Runners-up: coaching voucher',
    blurb:
      'Our flagship evening: four courts, timed rounds, music on, and a proper social after. Enter as a pair — we place you in the draw and email your fixtures before the night.',
    includes: [
      'Guaranteed 4 timed matches per pair',
      'Balls, court fees and floodlights included',
      'Live standings on the site as results come in',
      'Prize table and social drinks after play'
    ],
    // Already-confirmed entries so the paid path is visible on first load, plus
    // one awaiting payment so the organiser screen has something to action.
    seed: [
      { name: 'Charisca & KayCee', paid: true },
      { name: 'Lauren & Magda', paid: true },
      { name: 'Nadia & Roxy', rank: '3.0', mobile: '082 441 7788', email: 'nadia@example.com', paid: false }
    ]
  },
  {
    id: 'mamma-mia-cup',
    name: 'Mamma Mia Mixed Cup',
    tagline: 'One-day knockout tournament',
    refPrefix: 'MMA',
    date: 'Sunday 6 December 2026',
    time: '09:00 – 15:00',
    venue: 'Indoor Padel Revolution, 2 Picaroon Street, Johannesburg',
    format: 'Knockout doubles · best of 3 sets · consolation plate',
    division: 'Mixed · Intermediate & above',
    capacity: 24,
    price: 450,
    prize: 'Cash prize pool R4 000 split across the top 3 pairs',
    blurb:
      'The big one. Straight knockout with a consolation plate so nobody drives home after one match. Bring a partner or ask us to pair you.',
    includes: [
      'Minimum 2 matches per pair (plate draw for first-round losers)',
      'Free coffee, boerie rolls and fruit between rounds',
      'Coach Lea on court for warm-ups from 08:30',
      'Photographer on site for the full day'
    ],
    seed: [
      { name: 'Debbie & Eleasha', paid: true },
      { name: 'Cherize & Irene', paid: true },
      { name: 'Lynn & Tracey', paid: true },
      { name: 'Sam & Tumi', rank: 'Intermediate', mobile: '083 220 9911', email: 'sam@example.com', paid: false }
    ]
  }
];

/* --------------------------------------------------------------- storage */
function loadBookings() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupt store — fall through and reseed */ }
  return seedBookings();
}

function saveBookings(list) {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(list));
}

function seedBookings() {
  const out = [];
  EVENTS.forEach(ev => {
    (ev.seed || []).forEach((s, i) => {
      out.push({
        id: 'seed-' + ev.id + '-' + i,
        eventId: ev.id,
        ref: nextRef(ev.refPrefix),
        name: s.name,
        partner: '',
        rank: s.rank || '—',
        mobile: s.mobile || '',
        email: s.email || '',
        paid: !!s.paid,
        createdAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
        seeded: true
      });
    });
  });
  saveBookings(out);
  return out;
}

function nextRef(prefix) {
  let n = parseInt(localStorage.getItem(CONFIG.counterKey) || '0', 10);
  n += 1;
  localStorage.setItem(CONFIG.counterKey, String(n));
  return prefix + '-' + String(100 + n);
}

function addBooking(b) {
  const list = loadBookings();
  list.push(b);
  saveBookings(list);
  return b;
}

function setPaid(bookingId, paid) {
  const list = loadBookings();
  const b = list.find(x => x.id === bookingId);
  if (!b) return null;
  b.paid = paid;
  b.paidAt = paid ? new Date().toISOString() : null;
  saveBookings(list);
  return b;
}

function removeBooking(bookingId) {
  saveBookings(loadBookings().filter(x => x.id !== bookingId));
}

function bookingsFor(eventId) {
  return loadBookings().filter(b => b.eventId === eventId);
}

function eventById(id) {
  return EVENTS.find(e => e.id === id) || null;
}

function rand() {
  return Math.random().toString(36).slice(2, 10);
}

/* ---------------------------------------------------------------- helpers */
function money(n) {
  // en-ZA already uses a space separator, but as U+00A0; normalise it so the
  // output is a plain, copy-pasteable string.
  return 'R' + n.toLocaleString('en-ZA').replace(/[\s\u00a0]/g, ' ');
}

function pct(part, whole) {
  return Math.min(100, Math.round((part / whole) * 100));
}

function statusOf(ev) {
  const all = bookingsFor(ev.id);
  const paid = all.filter(b => b.paid).length;
  const pending = all.length - paid;
  const left = Math.max(0, ev.capacity - paid);
  let label, cls;
  if (left === 0) { label = 'Full'; cls = 'badge-full'; }
  else if (left <= Math.ceil(ev.capacity * 0.25)) { label = left + ' spots left'; cls = 'badge-few'; }
  else { label = 'Entries open'; cls = 'badge-open'; }
  return { paid, pending, left, total: all.length, label, cls };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function shortDate(ev) {
  return ev.date.replace(/^\w+\s/, '');
}

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

/* ------------------------------------------------------------------- nav */
function renderNav(active) {
  const links = [
    ['index.html', 'Home', 'home'],
    ['events.html', 'Events', 'events'],
    ['bookings.html', 'Enter / Book', 'bookings']
  ];
  const html = `
    <div class="nav-in">
      <a class="brand" href="index.html">Pringle <b>Padel</b><em>Bookings</em></a>
      <button class="burger" id="burger" aria-label="Menu">☰</button>
      <nav class="nav-links" id="navLinks">
        ${links.map(([href, text, key]) =>
          `<a href="${href}" class="${active === key ? 'on' : ''}">${text}</a>`).join('')}
      </nav>
    </div>`;
  const el = document.getElementById('nav');
  if (el) el.innerHTML = html;
  const burger = document.getElementById('burger');
  const menu = document.getElementById('navLinks');
  if (burger) burger.addEventListener('click', () => menu.classList.toggle('open'));
}

function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  el.innerHTML = `
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <h4>Pringle Padel</h4>
          <p class="muted" style="font-size:.9rem;max-width:38ch">
            Game, Set, Chat. Coaching, socials and tournaments at Indoor Padel
            Revolution, Johannesburg.
          </p>
          <p style="margin-top:14px">
            <a class="btn btn-ghost btn-sm" href="organiser.html">Organiser view (Lea)</a>
          </p>
          <p style="margin-top:10px">
            <a class="btn btn-ghost btn-sm" href="setup.html">Setup &amp; secrets</a>
          </p>
        </div>
        <div>
          <h4>Enter</h4>
          <ul>
            ${EVENTS.map(e => `<li><a href="event.html?id=${e.id}">${esc(e.name)}</a></li>`).join('')}
            <li><a href="bookings.html">Book a spot</a></li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            <li><a href="https://wa.me/27832630908" target="_blank" rel="noopener">WhatsApp +27 83 263 0908</a></li>
            <li><a href="mailto:Pringlepadel@gmail.com">Pringlepadel@gmail.com</a></li>
            <li>Indoor Padel Revolution, 2 Picaroon Street</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© Pringle Padel — bookings test site</span>
        <span>Test build. Entries are stored in this browser only.</span>
      </div>
    </div>`;
}

/* ------------------------------------------------------------ reveal on scroll */
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach(e => e.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .06 });
  els.forEach(e => io.observe(e));
}

function initChrome(active) {
  renderNav(active);
  renderFooter();
  initReveal();
}

/* ------------------------------------------------------------ passcode gate

   A speed bump, not security. The value lives in config.js, which is served
   publicly, so it keeps the organiser page out of casual view and search
   results but does not stop anyone determined. See setup.html. */

function requirePasscode() {
  if (!CONFIG.adminPasscode) return true;          // no passcode set: open
  try {
    if (sessionStorage.getItem('pp_admin_ok') === '1') return true;
  } catch (e) { return true; }

  const entered = window.prompt('Organiser passcode:');
  if (entered === null) return false;
  if (entered === CONFIG.adminPasscode) {
    try { sessionStorage.setItem('pp_admin_ok', '1'); } catch (e) {}
    return true;
  }
  alert('That passcode is not right.');
  return false;
}
