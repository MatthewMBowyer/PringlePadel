/* Event mapping regression suite.

   Run:  node tests/event-mapping.test.js

   The public feed matches a booking to an event by the Event string stored
   in the Sheet, so renaming an event silently orphans every booking made
   before the rename. This guards that, plus the page/card/image wiring.

   The rename risk: the public feed matches a booking to an event by the
   Event string stored in the Sheet. Every row booked before the rename
   carries the old name, so if matching were by name alone those players
   would silently vanish from the site. This drives the real entries.js
   against a feed holding both old and new names. */
const fs = require('fs');
const vm = require('vm');

const src =
  fs.readFileSync('assets/js/pp-config.js', 'utf8') + '\n' +
  fs.readFileSync('assets/js/entries.js', 'utf8');

const OLD = 'Only4thefans Tournament';
const NEW = "Mamma Mia - It's Getting Hot In Here!";

const feed = {
  success: true,
  entries: [
    { Event: OLD, TeamName: '', FirstName: 'Matthew', Surname: 'Bowyer', Division: 'Mens', Rank: '3' },
    { Event: NEW, TeamName: 'Cartrack', FirstName: 'Louis', Surname: 'Van aart', Division: 'Mens', Rank: '5' },
    { Event: NEW, TeamName: 'Cartrack', FirstName: 'Henk', Surname: 'Slabert', Division: 'Mens', Rank: '4.8' },
    { Event: 'Some Other Event', TeamName: '', FirstName: 'Someone', Surname: 'Else', Division: 'Ladies', Rank: '2' }
  ],
  counts: { [OLD]: 1, [NEW]: 2, 'Some Other Event': 1 },
  build: 'confirm-by-readback'
};

let fail = 0;
function check(name, cond, detail) {
  if (!cond) { fail++; console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else console.log('  PASS  ' + name);
}

const ctx = {
  console, setTimeout, Promise, URLSearchParams,
  window: { PP_CONFIG: {} },
  localStorage: { getItem: () => null, setItem: () => true },
  fetch: (url) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(
      String(url).indexOf('action=public') !== -1 ? feed : { success: true })
  })
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);

console.log('Event lookup');
const ev = ctx.ppEvent('mamma-mia-its-hot-tournament');
check('new id resolves', !!ev);
check('resolved event carries the new name', ev && ev.name === NEW, ev && ev.name);
check('name resolves', !!ctx.ppEvent(NEW));
check('legacy id resolves (an old bookmark still works)', !!ctx.ppEvent('only4thefans-tournament'));
check('legacy name resolves', !!ctx.ppEvent(OLD));
check('an unknown id resolves to nothing', ctx.ppEvent('nope') === null);
check('team price still 600', ev && ctx.ppTeamPrice(ev) === 600, ev && String(ctx.ppTeamPrice(ev)));

(async () => {
  console.log('\nPaid entries shown on the page');
  const paid = await ctx.ppPaidEntries(ev);
  check('legacy-named row is still shown after the rename',
    paid.some((e) => e.FirstName === 'Matthew'));
  check('new-named rows are shown',
    paid.filter((e) => e.TeamName === 'Cartrack').length === 2);
  check('unrelated events are excluded',
    !paid.some((e) => e.FirstName === 'Someone'));
  check('exactly the 3 entries for this event', paid.length === 3, String(paid.length));

  console.log('\nCounts');
  const n = await ctx.ppPaidCount(ev);
  check('count spans old and new names', n === 3, String(n));

  console.log('\nImage and link targets used by the site');
  check('image path is the new banner',
    ev.image === 'images/mamma-mia-its-hot-banner.jpg', ev.image);
  check('page url is the new file',
    ev.url === 'mamma-mia-its-hot-tournament.html', ev.url);
  check('banner file exists on disk', fs.existsSync(ev.image));
  check('page file exists on disk', fs.existsSync(ev.url));

  console.log('\nPage markup agrees with the event table');
  const page = fs.readFileSync('mamma-mia-its-hot-tournament.html', 'utf8');
  check('page looks up the same id', page.includes("ppEvent('mamma-mia-its-hot-tournament')"));
  check('Enter button uses the same id',
    page.includes('booking.html?event=mamma-mia-its-hot-tournament'));
  check('hero image exists', page.includes('images/mamma-mia-its-hot.jpg'));
  check('hero image file is on disk', fs.existsSync('images/mamma-mia-its-hot.jpg'));
  check('page title shows the new name', page.includes("Mamma Mia - It&#39;s Getting Hot In Here!"));
  check('no trace of the old name in the page', !/only4thefans/i.test(page));

  const t = fs.readFileSync('tournaments.html', 'utf8');
  check('tournaments card uses the new banner', t.includes('images/mamma-mia-its-hot-banner.jpg'));
  check('tournaments card links the new page', t.includes('/mamma-mia-its-hot-tournament.html'));
  check('tournaments Enter button uses the new id',
    t.includes('/booking.html?event=mamma-mia-its-hot-tournament'));

  console.log('\n' + (fail ? fail + ' FAILED' : 'ALL PASS'));
  process.exit(fail ? 1 : 0);
})();
