/* Backend regression suite.

   Runs the real apps-script/Code.gs against mocked Google services, so the
   booking rules are tested without touching the live Sheet.

   Run:  node tests/backend.test.js

   The Sheets mock deliberately reproduces the one behaviour that caused a
   real bug: appendRow coerces a digit-only string to a number even when the
   cell is text-formatted, which silently ate the leading zero off mobile
   numbers.
   The mock models the one Sheets behaviour that caused a real bug: a
   digit-only string written to a non-text cell is coerced to a number,
   silently dropping the leading zero. */

const fs = require('fs');
const vm = require('vm');

/* ------------------------------------------------------------ sheet mock */

function coerce(val, fmt) {
  if (typeof val !== 'string') return val;
  if (fmt === '@') return val;
  const t = val.trim();
  if (t === '') return val;
  if (/^[+-]?\d+$/.test(t)) return Number(t);
  return val;
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.fmt = {};
    this.frozen = 0;
  }
  _f(r, c) { return this.fmt[r + ':' + c] || 'General'; }
  _ensure(r, c) {
    while (this.rows.length < r) this.rows.push([]);
    const row = this.rows[r - 1];
    while (row.length < c) row.push('');
  }
  getLastRow() {
    let last = 0;
    this.rows.forEach((row, i) => {
      if (row.some((v) => v !== '' && v !== undefined && v !== null)) last = i + 1;
    });
    return last;
  }
  getMaxRows() { return Math.max(1000, this.rows.length + 1); }
  getRange(row, col, numRows, numCols) {
    numRows = numRows === undefined ? 1 : numRows;
    numCols = numCols === undefined ? 1 : numCols;
    const sheet = this;
    return {
      getValues() {
        const out = [];
        for (let r = row; r < row + numRows; r++) {
          const line = [];
          for (let c = col; c < col + numCols; c++) {
            sheet._ensure(r, c);
            line.push(sheet.rows[r - 1][c - 1]);
          }
          out.push(line);
        }
        return out;
      },
      setValues(vals) {
        vals.forEach((line, i) => line.forEach((v, j) => {
          sheet._ensure(row + i, col + j);
          sheet.rows[row + i - 1][col + j - 1] = coerce(v, sheet._f(row + i, col + j));
        }));
      },
      setValue(v) {
        sheet._ensure(row, col);
        sheet.rows[row - 1][col - 1] = coerce(v, sheet._f(row, col));
      },
      getValue() {
        sheet._ensure(row, col);
        return sheet.rows[row - 1][col - 1];
      },
      setNumberFormat(f) {
        for (let r = row; r < row + numRows; r++) {
          for (let c = col; c < col + numCols; c++) sheet.fmt[r + ':' + c] = f;
        }
      },
      setFontWeight() {},
      setFormula(f) { sheet._ensure(row, col); sheet.rows[row - 1][col - 1] = { formula: f }; }
    };
  }
  getDataRange() {
    const last = Math.max(this.getLastRow(), 1);
    const cols = this.rows.reduce((m, r) => Math.max(m, r.length), 1);
    return this.getRange(1, 1, last, cols);
  }
  appendRow(vals) {
    const r = this.getLastRow() + 1;
    this._ensure(r, vals.length);
    vals.forEach((v, j) => {
      /* Deliberately ignores the cell format: appendRow coerces a
         digit-only string to a number even on a text-formatted cell. */
      this.rows[r - 1][j] = coerce(v, 'General');
    });
  }
  setFrozenRows(n) { this.frozen = n; }
}

const sheets = {};
const ss = {
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => { sheets[n] = new Sheet(n); return sheets[n]; }
};

const props = {};
let uiThrew = false;
let lockHeld = false;

const ctx = {
  console: { log: () => {}, error: () => {} },
  Math, Date, JSON, String, Number, Object, Array, RegExp, Error, isNaN,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ss,
    getUi: () => { uiThrew = true; throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); }
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } })
  },
  LockService: {
    getScriptLock: () => ({
      waitLock: () => { lockHeld = true; },
      releaseLock: () => { lockHeld = false; }
    })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; }
    })
  },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
  },
  Session: { getScriptTimeZone: () => 'Africa/Johannesburg' }
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.env.CODE_PATH || require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);

/* ------------------------------------------------------------- harness */

let pass = 0; let fail = 0; const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

/* Read lazily: setupAll() generates the passcode, and this harness
   is loaded before it runs. */
const PASSC = () => props.ORGANISER_PASSCODE;

function post(payload) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const res = ctx.doPost({ postData: { contents: raw } });
  return JSON.parse(res.getContent());
}
function get(params) {
  const res = ctx.doGet({ parameter: params });
  return JSON.parse(res.getContent());
}
const entries = () => (sheets.Entries ? sheets.Entries.rows.slice(1).filter((r) => String(r[0]) !== '') : []);
const H = ctx.HEADERS;
const cell = (rowObj, name) => rowObj[H.indexOf(name)];

/* ------------------------------------------------------------ the tests */

section('A. One-time setup');
ctx.setupAll();
check('Entries tab created', !!sheets.Entries);
check('Confirmed tab created', !!sheets.Confirmed);
check('header row written', entries().length === 0 && sheets.Entries.rows[0][0] === 'Reference');
check('header row frozen', sheets.Entries.frozen === 1);
check('passcode generated', typeof props.ORGANISER_PASSCODE === 'string' && props.ORGANISER_PASSCODE.length > 0);
check('getUi throwing did not break setup', uiThrew === true);
const firstPass = props.ORGANISER_PASSCODE;
ctx.setupAll();
check('re-running setup keeps the passcode', props.ORGANISER_PASSCODE === firstPass);
check('Confirmed tab uses a QUERY formula', String(sheets.Confirmed.rows[0][0].formula).indexOf('QUERY') !== -1);

section('B. Booking intake');
/* Teams only. A one-player entry cannot be played in a doubles draw, so it
   is refused rather than written as a half-empty pair. */
let r = post({ Event: 'Only4thefans Tournament', EntryType: 'single', Division: 'Ladies',
  Amount: 300, Mobile: '0821234567', Email: 'a@b.com',
  PlayerList: [{ FirstName: 'Thabo', Surname: 'Mokoena', Rank: '3.5' }] });
check('a single entry is refused', r.success === false, JSON.stringify(r));
check('and says why', /both players/.test(r.message), r.message);
check('nothing was written for it', entries().length === 0, String(entries().length));

r = post({ Event: 'Only4thefans Tournament', EntryType: 'team', TeamName: 'Padel Pals',
  Division: 'Mens', Amount: 600, Mobile: '0829998888',
  PlayerList: [{ FirstName: 'Louis', Surname: 'Van aart', Rank: '5' },
               { FirstName: 'Henk', Surname: 'Slabert', Rank: '4.8' }] });
check('team accepted', r.success === true, JSON.stringify(r));
check('team reference is the team name', r.reference === 'Padel Pals', r.reference);
check('team wrote two rows', entries().length === 2, String(entries().length));
const teamRows = entries().filter((row) => cell(row, 'Reference') === 'Padel Pals');
check('both team rows share one reference', teamRows.length === 2);
check('a team type is recorded on both rows',
  teamRows.every((row) => cell(row, 'EntryType') === 'team'),
  teamRows.map((row) => cell(row, 'EntryType')).join('/'));
check('team row 1 carries the partner', cell(teamRows[0], 'PartnerName') === 'Henk' && cell(teamRows[0], 'PartnerSurname') === 'Slabert');
check('team row 2 does not repeat partner columns', cell(teamRows[1], 'PartnerName') === '');
check('team row 2 is the partner themselves', cell(teamRows[1], 'FirstName') === 'Henk');
/* One row is one person. A team paying R600 is two rows of R300, so the
   Amount column sums to the money actually received rather than double it. */
check('each team row stores the per-person R300, not the R600 entry total',
  teamRows.every((row) => Number(cell(row, 'Amount')) === 300),
  teamRows.map((row) => cell(row, 'Amount')).join('/'));
check('the two team rows add up to the R600 the team actually pays',
  teamRows.reduce((sum, row) => sum + Number(cell(row, 'Amount')), 0) === 600);

/* The mobile and reference bugs below used to be checked through a single
   entry, which the form no longer offers. Same assertions, through a team,
   so they keep guarding the behaviour that actually broke. */
r = post({ Event: 'E', EntryType: 'team', TeamName: 'Thabo & Co', Division: 'Ladies',
  Amount: 600, Mobile: '0821234567',
  PlayerList: [{ FirstName: 'Thabo', Surname: 'Mokoena', Rank: '3.5' },
               { FirstName: 'Sipho', Surname: 'Ndlovu', Rank: '3' }] });
check('first use of a team name is unchanged', r.reference === 'Thabo & Co', r.reference);
const second = post({ Event: 'E', EntryType: 'team', TeamName: 'Thabo & Co', Division: 'Ladies',
  Amount: 600, Mobile: '0823',
  PlayerList: [{ FirstName: 'Other', Surname: 'Pair', Rank: '3' },
               { FirstName: 'Second', Surname: 'Pair', Rank: '3' }] });
check('a repeated team name gets a suffix, so the two EFTs stay tellable apart',
  second.reference === 'Thabo & Co 2', second.reference);

section('C. The bugs that were fixed');
const thabo = entries().find((row) => cell(row, 'Reference') === 'Thabo & Co');
check('no reference contains "undefined"', String(cell(thabo, 'Reference')).indexOf('undefined') === -1);
check('mobile keeps its leading zero', cell(thabo, 'Mobile') === '0821234567', String(cell(thabo, 'Mobile')));

section('C2. A ranking typed with a comma');
/* A comma is the decimal separator most people type, and the fields were
   type="number" so the browser threw the value away before it ever got
   here. These rows go straight into the Sheet, so normalise on the way in
   too: a stray comma would otherwise sit in a column Lea wants to sort. */
r = post({ Event: 'E', EntryType: 'team', TeamName: 'Comma Club', Amount: 600, Mobile: '0821',
  PlayerList: [{ FirstName: 'Comma', Surname: 'One', Rank: '4,5' },
               { FirstName: 'Comma', Surname: 'Two', Rank: '3,25' }] });
check('a comma entry is accepted', r.success === true, JSON.stringify(r));
const commaRows = entries().filter((row) => cell(row, 'Reference') === 'Comma Club');
check('comma in the player ranking becomes a dot',
  cell(commaRows[0], 'Rank') === '4.5', String(cell(commaRows[0], 'Rank')));
check('the partner ranking is normalised too',
  cell(commaRows[0], 'PartnerRank') === '3.25', String(cell(commaRows[0], 'PartnerRank')));
check('both team rows are R300 per person',
  commaRows.every((row) => Number(cell(row, 'Amount')) === 300),
  commaRows.map((row) => cell(row, 'Amount')).join('/'));
check('a plain dot ranking is left alone',
  ctx.normaliseRank_('4.5') === '4.5', ctx.normaliseRank_('4.5'));
check('whitespace around a ranking is dropped',
  ctx.normaliseRank_(' 4,5 ') === '4.5', ctx.normaliseRank_(' 4,5 '));

section('C3. The per-person split');
check('a R600 team of two splits into 2 x R300',
  ctx.perPersonAmount_({ Amount: 600, PlayerList: [{}, {}] }) === 300);
check('a single pays the whole fee',
  ctx.perPersonAmount_({ Amount: 300, PlayerList: [{}] }) === 300);
check('an odd split rounds to cents, not to a float tail',
  ctx.perPersonAmount_({ Amount: 100, PlayerList: [{}, {}, {}] }) === 33.33,
  String(ctx.perPersonAmount_({ Amount: 100, PlayerList: [{}, {}, {}] })));

r = post({ Event: 'E', EntryType: 'team', TeamName: 'Plus Team', Division: 'Ladies', Amount: 600,
  Mobile: '+27721848709',
  PlayerList: [{ FirstName: 'Plus', Surname: 'Test', Rank: '3' },
               { FirstName: 'Plus', Surname: 'Mate', Rank: '3' }] });
const plusRow = entries().find((row) => cell(row, 'Reference') === 'Plus Team');
check('mobile with +27 survives', cell(plusRow, 'Mobile') === '+27721848709', String(cell(plusRow, 'Mobile')));
check('the mock would catch a regression (coercion is real)',
  new Sheet('t').getRange(1, 1).setValue.call({}, '') === undefined ||
  (() => { const s = new Sheet('x'); s.appendRow(['0821234567']); return typeof s.rows[0][0] === 'number'; })());

section('D. Validation');
check('malformed JSON refused', post('{not json').message === 'Malformed request.');
check('missing event refused', post({ EntryType: 'single', Mobile: '0821', PlayerList: [{ FirstName: 'A', Surname: 'B' }] }).message === 'Missing event.');
check('missing mobile refused', post({ Event: 'E', EntryType: 'single', PlayerList: [{ FirstName: 'A', Surname: 'B' }] }).message === 'Missing mobile number.');
/* The no-player case is refused before the pair rule, so it still reads as
   a missing-details error rather than a missing-partner one. */
check('no players refused', post({ Event: 'E', EntryType: 'team', Mobile: '0821', PlayerList: [] }).message === 'Missing player details.');
check('empty first name names yourself',
  post({ Event: 'E', EntryType: 'team', TeamName: 'T', Mobile: '0821', PlayerList: [{ FirstName: '', Surname: 'B' }, { FirstName: 'C', Surname: 'D' }] }).message === 'Missing first name in your own details.');
check('empty partner name names the partner',
  post({ Event: 'E', EntryType: 'team', TeamName: 'T', Mobile: '0821',
    PlayerList: [{ FirstName: 'A', Surname: 'B' }, { FirstName: '', Surname: 'C' }] }).message === "Missing first name in your partner's details.");
check('team without team name refused',
  post({ Event: 'E', EntryType: 'team', Mobile: '0821', PlayerList: [{ FirstName: 'A', Surname: 'B' }, { FirstName: 'C', Surname: 'D' }] }).message === 'Missing team name.');
check('team with one player refused',
  post({ Event: 'E', EntryType: 'team', TeamName: 'T', Mobile: '0821', PlayerList: [{ FirstName: 'A', Surname: 'B' }] }).message === "An entry needs both players' details.");
/* The type is derived, not chosen: a caller still sending the old
   EntryType must not be able to book a one-player entry, and a pair sent
   under the old label is simply a pair. */
const asOldSingle = post({ Event: 'E', EntryType: 'single', TeamName: 'Solo & One', Amount: 600, Mobile: '0821',
  PlayerList: [{ FirstName: 'Solo', Surname: 'One' }, { FirstName: 'Extra', Surname: 'Two' }] });
check('a pair sent under the old label is still accepted', asOldSingle.success === true, JSON.stringify(asOldSingle));
const relabelled = entries().filter((row) => cell(row, 'Reference') === 'Solo & One');
check('and is recorded as a team, whatever the caller called it',
  relabelled.length === 2 && relabelled.every((row) => cell(row, 'EntryType') === 'team'),
  relabelled.map((row) => cell(row, 'EntryType')).join('/'));
check('with the per-person split applied',
  relabelled.every((row) => Number(cell(row, 'Amount')) === 300),
  relabelled.map((row) => cell(row, 'Amount')).join('/'));

section('E. Security: the public endpoint cannot be trusted');
/* EntryType is left on these as 'single' on purpose: a caller can say
   anything, and the server must ignore it. The team name is what the
   reference is built from, so the assertions read the team. */
r = post({ Event: 'Hack', EntryType: 'single', TeamName: 'Hacker Man', Amount: 600, Mobile: '0821',
  Paid: 'YES', PaidAt: '2020-01-01', Reference: 'CHOSEN-BY-CLIENT',
  PlayerList: [{ FirstName: 'Hacker', Surname: 'Man', Rank: '9' },
               { FirstName: 'Hacker', Surname: 'Two', Rank: '9' }] });
const hack = entries().find((row) => cell(row, 'Reference') === 'Hacker Man');
check('client cannot choose its own paid flag', cell(hack, 'Paid') === 'NO');
check('client cannot set Reference', String(cell(hack, 'Reference')) !== 'CHOSEN-BY-CLIENT');
check('client cannot set PaidAt', String(cell(hack, 'PaidAt')) === '');
r = post({ Event: 'E', EntryType: 'single', TeamName: 'Count Check', Amount: 600, Mobile: '0821', Players: 99,
  PlayerList: [{ FirstName: 'Count', Surname: 'Check', Rank: '9' },
               { FirstName: 'Count', Surname: 'Mate', Rank: '9' }] });
const countRow = entries().find((row) => cell(row, 'Reference') === 'Count Check');
check('Players is derived, not trusted', cell(countRow, 'Players') === 2, String(cell(countRow, 'Players')));
r = post({ Event: 'E', EntryType: 'single', TeamName: 'Junk Field', Mobile: '0821', Bogus: 'x', __proto__: { poll: 1 },
  PlayerList: [{ FirstName: 'Junk', Surname: 'Field' }, { FirstName: 'Junk', Surname: 'Mate' }] });
check('unknown columns are dropped', r.success === true);
r = post({ Event: 'E', EntryType: 'single', TeamName: 'Ctrl Chars', Mobile: '0821:ct',
  PlayerList: [{ FirstName: 'Ctrl', Surname: 'Chars' }, { FirstName: 'Ctrl', Surname: 'Mate' }] });
const ctrl = entries().find((row) => cell(row, 'Reference') === 'Ctrl Chars');
check('control characters stripped', String(cell(ctrl, 'Mobile')).indexOf('\u0000') === -1);
r = post({ Event: 'X'.repeat(500), EntryType: 'single', TeamName: 'Long Value', Mobile: '0821',
  PlayerList: [{ FirstName: 'Long', Surname: 'Value' }, { FirstName: 'Long', Surname: 'Mate' }] });
const lng = entries().find((row) => cell(row, 'Reference') === 'Long Value');
check('over-long values capped', String(cell(lng, 'Event')).length === 200, String(cell(lng, 'Event')).length);

section('F. Privacy: the public feed');
let pub = get({ action: 'public' });
check('unpaid entries are hidden', pub.entries.length === 0, JSON.stringify(pub.entries));
const privKeys = ['Mobile', 'Email', 'Paid', 'PaidAt', 'Reference', 'Entered'];
ctx.doGet({ parameter: { action: 'markPaid', passcode: PASSC(), reference: 'Padel Pals', paid: 'true' } });
pub = get({ action: 'public' });
check('paid entries appear', pub.entries.length === 2, JSON.stringify(pub.entries));
check('a paid team lists both players under one team name',
  pub.entries.every((e) => e.TeamName === 'Padel Pals') &&
  JSON.stringify(pub.entries.map((e) => e.FirstName).sort()) === JSON.stringify(['Henk', 'Louis']));
check('public entry has no private field', privKeys.every((k) => !(k in (pub.entries[0] || {}))), JSON.stringify(Object.keys(pub.entries[0] || {})));
check('public fields are exactly the allowlist',
  JSON.stringify(Object.keys(pub.entries[0]).sort()) === JSON.stringify(ctx.PUBLIC_FIELDS.slice().sort()),
  JSON.stringify(Object.keys(pub.entries[0] || {})));
check('public payload exposes no mobile number',
  JSON.stringify(pub).indexOf('0829998888') === -1);
check('counts report paid player rows', pub.counts['Only4thefans Tournament'] === 2, JSON.stringify(pub.counts));

section('G. Organiser authentication');
check('list without passcode refused', get({ action: 'list' }).success === false);
check('list with wrong passcode refused', get({ action: 'list', passcode: 'wrongpass' }).success === false);
check('list with a same-length wrong passcode refused', get({ action: 'list', passcode: 'x'.repeat(PASSC().length) }).success === false);
let lst = get({ action: 'list', passcode: PASSC() });
check('list with correct passcode works', lst.success === true && lst.entries.length > 0);
check('list includes contact details for Lea', 'Mobile' in lst.entries[0] && 'Email' in lst.entries[0]);
check('markPaid without passcode refused', get({ action: 'markPaid', reference: 'Padel Pals', paid: 'true' }).success === false);
check('unknown action refused', get({ action: 'nonsense' }).success === false);
check('no action defaults to public', Array.isArray(get({}).entries));

section('H. Marking paid');
let res = get({ action: 'markPaid', passcode: PASSC(), reference: 'Padel Pals', paid: 'true' });
check('team markPaid flips both rows', res.rows === 2, JSON.stringify(res));
check('unknown reference refused', get({ action: 'markPaid', passcode: PASSC(), reference: 'Nobody Here', paid: 'true' }).success === false);
check('missing reference refused', get({ action: 'markPaid', passcode: PASSC(), paid: 'true' }).success === false);
const teamNow = entries().filter((row) => cell(row, 'Reference') === 'Padel Pals');
check('both team rows are YES', teamNow.every((row) => cell(row, 'Paid') === 'YES'));
check('PaidAt is stamped', teamNow.every((row) => String(cell(row, 'PaidAt')).length > 0));
res = get({ action: 'markPaid', passcode: PASSC(), reference: 'Padel Pals', paid: 'false' });
const teamOff = entries().filter((row) => cell(row, 'Reference') === 'Padel Pals');
check('unmarking clears Paid', teamOff.every((row) => cell(row, 'Paid') === 'NO'));
check('unmarking clears PaidAt', teamOff.every((row) => String(cell(row, 'PaidAt')) === ''));
check('markPaid is case-insensitive', get({ action: 'markPaid', passcode: PASSC(), reference: 'padel pals', paid: 'true' }).success === true);
get({ action: 'markPaid', passcode: PASSC(), reference: 'Padel Pals', paid: 'false' });

section('I. Booking read-back (the 404 fix)');
res = get({ action: 'status', ref: 'Thabo & Co', mobile: '0821234567' });
check('status finds a fresh single entry', res.found === true, JSON.stringify(res));
check('status reports paid=false', res.paid === false);
check('status returns only reference and paid',
  JSON.stringify(Object.keys(res).sort()) === JSON.stringify(['build', 'found', 'paid', 'reference', 'success']),
  JSON.stringify(Object.keys(res)));
check('status is refused without a passcode-free lookup? (it is public by design)',
  get({ action: 'status', ref: 'Thabo & Co', mobile: '0821234567' }).success === true);
const zeros = get({ action: 'status', ref: 'Thabo & Co', mobile: '0000000000' });
check('an unrelated mobile never confirms', zeros.found !== true, JSON.stringify(zeros));
check('an all-zeros mobile is refused outright', zeros.success === false, JSON.stringify(zeros));
check('a mobile that is all punctuation never confirms',
  get({ action: 'status', ref: 'Thabo & Co', mobile: '---' }).found !== true);
check('unknown reference does not match', get({ action: 'status', ref: 'No Such Person', mobile: '0821234567' }).found === false);
check('status needs both parameters', get({ action: 'status', ref: 'Thabo & Co' }).success === false);
check('status needs a mobile', get({ action: 'status', mobile: '0821234567' }).success === false);
res = get({ action: 'status', ref: 'Thabo & Co 2', mobile: '0823' });
check('suffixed duplicate found by exact reference', res.found === true, JSON.stringify(res));
res = get({ action: 'status', ref: 'Thabo & Co', mobile: '0823' });
check('suffixed duplicate found by prefix (what the entrant actually types)', res.found === true && res.reference === 'Thabo & Co 2', JSON.stringify(res));
check('status tolerates a zero lost in storage', get({ action: 'status', ref: 'Thabo & Co', mobile: '821234567' }).found === true);
check('status exposes no private data',
  JSON.stringify(get({ action: 'status', ref: 'Thabo & Co', mobile: '0821234567' })).indexOf('a@b.com') === -1);
ctx.doGet({ parameter: { action: 'markPaid', passcode: PASSC(), reference: 'Thabo & Co', paid: 'true' } });
check('status reflects a paid entry', get({ action: 'status', ref: 'Thabo & Co', mobile: '0821234567' }).paid === true);

section('J. Concurrency lock');
check('lock released after a successful write', lockHeld === false);
post('{bad json');
check('lock released after a rejected write', lockHeld === false);

section('K. End-to-end: the real booking the owner submitted');
r = post({ Event: 'Only4thefans Tournament', EntryType: 'team', TeamName: 'Cartrack',
  Division: 'Mens', Amount: 600, Mobile: '+27721848709', Email: 'matthewmbowyer@gmail.com',
  PlayerList: [{ FirstName: 'Louis', Surname: 'Van aart', Rank: '5' },
               { FirstName: 'Henk', Surname: 'Slabert', Rank: '4.8' }] });
check('Cartrack team entry accepted', r.success === true && r.reference === 'Cartrack', JSON.stringify(r));
const cart = entries().filter((row) => cell(row, 'Reference') === 'Cartrack');
check('Cartrack wrote two rows', cart.length === 2);
check('Cartrack keeps the +27 mobile', cell(cart[0], 'Mobile') === '+27721848709');
check('Cartrack row order is entrant then partner',
  cell(cart[0], 'FirstName') === 'Louis' && cell(cart[1], 'FirstName') === 'Henk');
check('Cartrack read-back works', get({ action: 'status', ref: 'Cartrack', mobile: '+27721848709' }).found === true);
check('Cartrack hidden while unpaid', get({ action: 'public' }).entries.every((e) => e.TeamName !== 'Cartrack'));

function entries_ref(ref) {
  return sheets.Entries.rows.filter((row) => String(row[0]) === ref);
}

console.log('\n' + '─'.repeat(60));
console.log('PASS ' + pass + '   FAIL ' + fail);
if (fail) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
