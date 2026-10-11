/* Pringle Padel — bookings configuration
   ============================================================
   This is the ONLY file you need to edit to go live.
   Everything else is already wired to read from here.

   !! IMPORTANT — READ THIS FIRST !!
   GitHub Pages serves every file in the repo publicly. Anything you
   type in this file can be read by anyone who views the page source.
   So: this file may hold PUBLIC things (a web-app URL, a published
   CSV link). It must NEVER hold a real secret (an API key, a bank
   password, a database credential).

   The real secrets live on Google's side, in the Apps Script
   project's Script Properties — never in this repo. See setup.html.
   ============================================================ */

window.PP_CONFIG = {

  /* ---------------------------------------------------------------
     1. Apps Script web-app URL  (PUBLIC — safe to put here)
     ---------------------------------------------------------------
     Where booking entries get POSTed so they land in your Sheet.

     How to get it:
       - Open your Google Sheet  ->  Extensions  ->  Apps Script
       - Paste the server code shown in setup.html
       - Deploy  ->  New deployment  ->  type "Web app"
           Execute as:      Me
           Who has access:  Anyone
       - Copy the /exec URL it gives you and paste it below.

     Leave it as '' and the site runs in offline test mode: entries
     save to the browser only and the organiser page still works.
  */
  scriptUrl: '',

  /* ---------------------------------------------------------------
     2. Published Sheet CSV URL  (PUBLIC — safe to put here)
     ---------------------------------------------------------------
     Read-only feed the site uses to list confirmed entries, so
     everyone sees the same list instead of just their own browser.

     How to get it:
       - Open the Sheet  ->  File  ->  Share  ->  Publish to web
       - Choose the entries tab, format "Comma-separated values"
       - Paste the resulting link below.

     Leave it as '' to fall back to browser-only storage.
  */
  sheetCsvUrl: '',

  /* ---------------------------------------------------------------
     3. Organiser passcode  (NOT A REAL SECRET — speed bump only)
     ---------------------------------------------------------------
     What Lea types to open organiser.html.

     Be clear about what this is: because the site is static, this
     value sits in the page and a determined person could find it.
     It keeps the page out of casual view and off search results.
     It is NOT security.

     The genuine protection is that marking someone paid only writes
     a flag in your Sheet — no money moves, and you can undo it.

     If you later want real protection, the fix is to check the
     passcode inside Apps Script instead, where it can actually be
     hidden. See "Making it properly secure" in setup.html.
  */
  adminPasscode: '',

  /* ---------------------------------------------------------------
     4. EFT bank details  (PUBLIC — these are printed on the site)
     ---------------------------------------------------------------
     Shown to players on the confirmation screen so they can pay.
  */
  bank: {
    accountName: 'Pringle Padel',
    bank: 'FNB',
    accountNumber: '62XXXXX4891',   // TODO: real account number
    branch: '250655'
  }
};
