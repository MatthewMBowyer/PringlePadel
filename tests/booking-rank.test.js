/* Booking form: the ranking field.

   Run:  node tests/booking-rank.test.js

   The ranking inputs were type="number", which is why a comma never worked:
   the browser reports an empty value for "4,5" before any validation runs,
   so no amount of JavaScript in the page could recover the number. The fix
   is three things that have to stay true together, and this pins all three:

     1. the inputs are text, not number, so the comma survives,
     2. normaliseRank accepts a comma and stores a dot,
     3. a ranking outside 0-10 is refused rather than silently truncated.

   The real functions are lifted out of booking.html and run here, so this
   fails if the page is edited in a way that breaks them. */
const fs = require('fs');
const vm = require('vm');

const page = fs.readFileSync('booking.html', 'utf8');

/* Both helpers sit between normaliseRank and validatePadelRank. */
const from = page.indexOf('function normaliseRank(value) {');
const to = page.indexOf('function validatePadelRank() {');
if (from === -1 || to === -1 || to < from) {
  console.log('  FAIL  could not find the rank helpers in booking.html');
  process.exit(1);
}
const source = page.slice(from, to);

const ctx = {};
vm.createContext(ctx);
vm.runInContext(source + '\nthis.normaliseRank = normaliseRank; this.checkRank = checkRank;', ctx);

let fail = 0;
function check(name, cond, detail) {
  if (!cond) { fail++; console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else console.log('  PASS  ' + name);
}

function input(value) {
  return {
    value: value,
    message: '',
    setCustomValidity(m) { this.message = m; },
  };
}

console.log('The comma survives the field itself');
/* A type="number" input reports "" for "4,5" and no script can see the text,
   which is the original bug. */
[['padelRank', 'Your ranking'], ['partnerRank', 'Your partner']]
  .forEach(function (pair) {
    const id = pair[0];
    const tag = new RegExp('<input[^>]*id="' + id + '"[^>]*>', 'i').exec(page);
    check(id + ' is a text input', !!tag && /type="text"/.test(tag[0]),
      tag ? tag[0].replace(/\s+/g, ' ').slice(0, 70) : 'input not found');
    check(id + ' still asks for a decimal keypad',
      !!tag && /inputmode="decimal"/.test(tag[0]));
    check(id + ' no longer claims to be a number',
      !!tag && !/type="number"/.test(tag[0]));
  });

console.log('\nA comma is understood');
check('4,5 becomes 4.5', ctx.normaliseRank('4,5') === '4.5', ctx.normaliseRank('4,5'));
check('4.5 stays 4.5', ctx.normaliseRank('4.5') === '4.5', ctx.normaliseRank('4.5'));
check('a whole number is fine', ctx.normaliseRank('4') === '4', ctx.normaliseRank('4'));
check('10 is fine', ctx.normaliseRank('10') === '10', ctx.normaliseRank('10'));
check('spaces are dropped', ctx.normaliseRank(' 4,5 ') === '4.5', ctx.normaliseRank(' 4,5 '));
check('a comma with no decimal part works', ctx.normaliseRank('7,') === '7.', ctx.normaliseRank('7,'));
check('blank stays blank', ctx.normaliseRank('') === '', ctx.normaliseRank(''));

console.log('\nRankings that are accepted');
['4,5', '4.5', '4', '0', '10', '10.0', '0,5'].forEach(function (v) {
  const el = input(v);
  check('"' + v + '" is accepted', ctx.checkRank(el) === true && el.message === '',
    el.message);
});

console.log('\nRankings that are refused');
['11', '4,55', '4.55', 'abc', '-1', '4,5,5'].forEach(function (v) {
  const el = input(v);
  check('"' + v + '" is refused', ctx.checkRank(el) === false, el.message || 'accepted');
});

console.log('\nBlank is allowed (the field is optional)');
const blank = input('');
check('an empty ranking raises no complaint',
  ctx.checkRank(blank) === true && blank.message === '');

console.log('\n' + (fail ? fail + ' FAILED' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
