/* Pringle Padel — tournament booking backend
   ============================================================
   Paste this whole file into the Apps Script editor attached to your
   Google Sheet, then run setupAll() once.

   What it does:
     - creates the "Entries" tab (every booking, including contact details)
     - creates the "Confirmed" tab (paid players only, name/division/rank)
     - accepts new bookings by POST from the website
     - lets the organiser page list entries and flip someone to paid

   Two things never leave this file:
     - the organiser passcode (Script Properties, not the website)
     - mobile numbers and email addresses (the public feed never returns them)

   After editing this code you must re-deploy:
   Deploy -> Manage deployments -> pencil -> Version: New version -> Deploy.
   Otherwise the /exec URL keeps serving the old code.
   ============================================================ */

var ENTRIES_SHEET = 'Entries';
var CONFIRMED_SHEET = 'Confirmed';
var PROP_PASSCODE = 'ORGANISER_PASSCODE';

/* Column order matters: the public feed and the organiser page index into
   this list, so append new columns at the end rather than inserting them. */
var HEADERS = [
  'Reference',      // A
  'Event',          // B
  'EntryType',      // C  single | team
  'TeamName',       // D  blank for a single entry
  'Division',       // E
  'FirstName',      // F
  'Surname',        // G
  'Rank',           // H  Playtomic ranking
  'PartnerName',    // I
  'PartnerSurname', // J
  'PartnerRank',    // K
  'Players',        // L
  'Amount',         // M
  'Mobile',         // N  private
  'Email',          // O  private
  'Paid',           // P  YES | NO — Lea flips this
  'Entered',        // Q
  'PaidAt'          // R
];

/* Columns the public may see. Everything else stays server-side, so a
   mis-edited page cannot leak a phone number. */
var PUBLIC_FIELDS = ['Event', 'TeamName', 'FirstName', 'Surname', 'Division', 'Rank'];

/* --------------------------------------------------------------- one-time setup

   Run this once from the Apps Script editor. Safe to re-run: it only
   creates what is missing and never deletes data. */
function setupAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ensureEntriesSheet_(ss);
  ensureConfirmedSheet_(ss);

  var pass = PropertiesService.getScriptProperties().getProperty(PROP_PASSCODE);
  if (!pass) {
    pass = generatePasscode_();
    PropertiesService.getScriptProperties().setProperty(PROP_PASSCODE, pass);
  }

  SpreadsheetApp.getUi().alert(
    'Setup complete.\n\n' +
    'Organiser passcode:  ' + pass + '\n\n' +
    'Write this down. Lea types it to open the organiser page. ' +
    'Change it any time in Project Settings -> Script Properties.'
  );
}

/* Use this if the passcode is ever forgotten or shared too widely. */
function resetPasscode() {
  var pass = generatePasscode_();
  PropertiesService.getScriptProperties().setProperty(PROP_PASSCODE, pass);
  SpreadsheetApp.getUi().alert('New organiser passcode:  ' + pass);
}

function generatePasscode_() {
  var words = ['padel', 'net', 'ace', 'smash', 'court', 'deuce', 'lob', 'volley'];
  var n = Math.floor(1000 + Math.random() * 9000);
  return words[Math.floor(Math.random() * words.length)] + n;
}

function ensureEntriesSheet_(ss) {
  var sh = ss.getSheetByName(ENTRIES_SHEET);
  if (!sh) sh = ss.insertSheet(ENTRIES_SHEET);
  var first = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (String(first[0]).trim() !== HEADERS[0]) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  /* A mobile number is digits, and Sheets coerces a digit-only string to a
     number — which silently drops the leading zero off every South African
     number, so "0821234567" lands as 821234567 and Lea cannot dial it.
     Force the column to text before any value reaches it. */
  sh.getRange(1, HEADERS.indexOf('Mobile') + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  return sh;
}

/* A read-only convenience view for Lea: paid entries only, no contact
   details, so it is safe to print, share or publish. The website does not
   depend on this tab — it exists purely so a human can eyeball the list. */
function ensureConfirmedSheet_(ss) {
  var sh = ss.getSheetByName(CONFIRMED_SHEET);
  if (!sh) sh = ss.insertSheet(CONFIRMED_SHEET);

  var last = colLetter_(HEADERS[HEADERS.length - 1]);
  var range = ENTRIES_SHEET + '!A1:' + last;

  var formula =
    '=IFERROR(QUERY(' + range + ', ' +
    '"select B, D, F, G, E, H where P = \'YES\'", 1), ' +
    '"No confirmed entries yet")';

  sh.getRange(1, 1).setFormula(formula);
}

function colLetter_(header) {
  var i = HEADERS.indexOf(header);
  if (i === -1) throw new Error('Unknown column: ' + header);
  var n = i + 1;
  var s = '';
  while (n > 0) {
    var rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* ------------------------------------------------------------------ intake

   Called by the website when a player submits the booking form.

   A team entry arrives as ONE request carrying both players, because both
   share a single payment reference and must never be split across two
   references. One request also means one lock, so the two rows are written
   together or not at all. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // serialise concurrent submissions

    var body = {};
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return json({ success: false, message: 'Malformed request.' });
    }

    var entry = sanitise_(body);

    if (!entry.Event) return json({ success: false, message: 'Missing event.' });
    if (!entry.Mobile) return json({ success: false, message: 'Missing mobile number.' });
    if (!entry.PlayerList.length) return json({ success: false, message: 'Missing player details.' });

    for (var i = 0; i < entry.PlayerList.length; i++) {
      var p = entry.PlayerList[i];
      if (!p.FirstName) return json({ success: false, message: 'Missing first name.' });
      if (!p.Surname) return json({ success: false, message: 'Missing surname.' });
    }

    if (entry.EntryType === 'team' && !entry.TeamName) {
      return json({ success: false, message: 'Missing team name.' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ensureEntriesSheet_(ss);

    /* The reference is assigned here rather than in the browser so two
       people submitting at once can never be handed the same one. The
       lock is already held, so this read-then-write is safe. */
    var reference = uniqueRef_(sh, refBase_(entry));

    entry.PlayerList.forEach(function (p, idx) {
      sh.appendRow(HEADERS.map(function (h) {
        switch (h) {
          case 'Reference': return reference;
          case 'Paid': return 'NO';
          case 'Entered': return new Date();
          case 'PaidAt': return '';
          case 'FirstName': return p.FirstName;
          case 'Surname': return p.Surname;
          case 'Rank': return p.Rank;
          /* Only the first row of a team carries the partner columns; the
             second row is that partner, so repeating them would double up. */
          case 'PartnerName': return idx === 0 ? (entry.PlayerList[1] ? entry.PlayerList[1].FirstName : '') : '';
          case 'PartnerSurname': return idx === 0 ? (entry.PlayerList[1] ? entry.PlayerList[1].Surname : '') : '';
          case 'PartnerRank': return idx === 0 ? (entry.PlayerList[1] ? entry.PlayerList[1].Rank : '') : '';
          default: return entry[h] === undefined ? '' : entry[h];
        }
      }));
    });

    return json({ success: true, reference: reference, rows: entry.PlayerList.length });

  } catch (err) {
    return json({ success: false, message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------- reads

   action=public    paid entries only, publishable fields only (no passcode)
   action=list      everything, for the organiser page (passcode required)
   action=markPaid  flip one entry's Paid flag (passcode required) */
function doGet(e) {
  var action = (e.parameter.action || 'public');

  try {
    if (action === 'public') return json(publicPayload_());

    if (!passcodeOk_(e)) {
      return json({ success: false, message: 'Wrong or missing passcode.' });
    }

    if (action === 'list') return json(organiserPayload_());

    if (action === 'markPaid') {
      return json(setPaid_(e.parameter.reference, e.parameter.paid === 'true'));
    }

    return json({ success: false, message: 'Unknown action.' });

  } catch (err) {
    return json({ success: false, message: String(err) });
  }
}

/* Everything the public event page needs, and nothing more. */
function publicPayload_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ENTRIES_SHEET);
  if (!sh) return { success: true, entries: [], counts: {} };

  var rows = readRows_(sh);
  var entries = [];
  var counts = {};

  rows.forEach(function (r) {
    if (String(r.Paid).toUpperCase() !== 'YES') return;

    var ev = String(r.Event || '');
    counts[ev] = (counts[ev] || 0) + 1;

    var out = {};
    PUBLIC_FIELDS.forEach(function (f) { out[f] = r[f] === undefined ? '' : r[f]; });
    entries.push(out);
  });

  return { success: true, entries: entries, counts: counts };
}

/* The organiser page needs contact details to chase people up. */
function organiserPayload_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ENTRIES_SHEET);
  if (!sh) return { success: true, entries: [] };
  return { success: true, entries: readRows_(sh) };
}

function readRows_(sh) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values.shift();

  return values
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      var o = {};
      head.forEach(function (h, i) { o[h] = r[i]; });
      /* Dates do not survive JSON well; send them pre-formatted. */
      o.Entered = fmtDate_(r[HEADERS.indexOf('Entered')]);
      o.PaidAt = fmtDate_(r[HEADERS.indexOf('PaidAt')]);
      return o;
    });
}

function fmtDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  }
  return String(v);
}

function setPaid_(reference, paid) {
  if (!reference) return { success: false, message: 'Missing reference.' };

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ENTRIES_SHEET);
  if (!sh) return { success: false, message: 'No entries yet.' };

  var rows = findRows_(sh, reference);
  if (!rows.length) return { success: false, message: 'Unknown reference.' };

  /* A team entry is two rows sharing one reference, and they were paid in
     one EFT, so they flip together. */
  rows.forEach(function (row) {
    sh.getRange(row, HEADERS.indexOf('Paid') + 1).setValue(paid ? 'YES' : 'NO');
    sh.getRange(row, HEADERS.indexOf('PaidAt') + 1).setValue(paid ? new Date() : '');
  });

  return { success: true, reference: reference, paid: paid, rows: rows.length };
}

function findRows_(sh, reference) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var refs = sh.getRange(2, 1, last - 1, 1).getValues();
  var want = String(reference).trim().toLowerCase();
  var out = [];
  for (var i = 0; i < refs.length; i++) {
    if (String(refs[i][0]).trim().toLowerCase() === want) out.push(i + 2);
  }
  return out;
}


/* The reference is what Lea reads off the bank statement, so it is built
   from the name: "Thabo Mokoena", or the team name for a team entry. */
function refBase_(entry) {
  if (String(entry.EntryType).toLowerCase() === 'team' && entry.TeamName) {
    return entry.TeamName;
  }
  /* sanitise_ strips FirstName and Surname off the entry itself — for a
     single entry they only exist inside PlayerList. Reading them off the
     entry produced "undefined undefined" for every single booking, which
     is the exact string Lea matches against the bank statement. */
  var first = (entry.PlayerList && entry.PlayerList[0]) || {};
  return ((first.FirstName || '') + ' ' + (first.Surname || '')).trim();
}

/* Names repeat, and two identical references make an EFT impossible to
   match. Only the clash gets a number: "John Smith 2". */
function uniqueRef_(sh, base) {
  var clean = String(base).replace(/\s+/g, ' ').trim();
  if (!clean) clean = 'Entry';

  var last = sh.getLastRow();
  if (last < 2) return clean;

  var refs = sh.getRange(2, 1, last - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim().toLowerCase(); });

  if (refs.indexOf(clean.toLowerCase()) === -1) return clean;

  var n = 2;
  while (refs.indexOf((clean + ' ' + n).toLowerCase()) !== -1) n++;
  return clean + ' ' + n;
}

/* ------------------------------------------------------------------ helpers */

function passcodeOk_(e) {
  var expected = PropertiesService.getScriptProperties().getProperty(PROP_PASSCODE);
  if (!expected) return false;
  var given = String(e.parameter.passcode || '');
  if (given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < given.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/* Never trust a public endpoint: keep only known columns, coerce to
   string, strip control characters and cap the length. */
function sanitise_(body) {
  var out = {};

  HEADERS.forEach(function (h) {
    if (h === 'Entered' || h === 'PaidAt' || h === 'Paid') return;
    if (h === 'FirstName' || h === 'Surname' || h === 'Rank') return; // come from PlayerList
    if (h === 'PartnerName' || h === 'PartnerSurname' || h === 'PartnerRank') return;
    if (h === 'Players') return; // derived below, so it stays a count
    out[h] = clean_(body[h]);
  });

  /* A single entry is just a one-player list, so every downstream branch
     deals with the same shape. */
  var raw = Array.isArray(body.PlayerList) ? body.PlayerList : [];
  out.PlayerList = raw.slice(0, 2).map(function (p) {
    p = p || {};
    return {
      FirstName: clean_(p.FirstName),
      Surname: clean_(p.Surname),
      Rank: clean_(p.Rank)
    };
  });

  out.EntryType = out.EntryType.toLowerCase() === 'team' ? 'team' : 'single';
  if (out.EntryType === 'single') out.PlayerList = out.PlayerList.slice(0, 1);

  out.Players = out.PlayerList.length;

  return out;
}

function clean_(v) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
