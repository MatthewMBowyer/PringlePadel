# Pringle Padel — setup and the monthly routine

Everything here is free. There is no server to rent and nothing to patch.

Three pieces:

| Piece | What it does | Cost |
|---|---|---|
| GitHub Pages | Serves www.pringlepadel.com | R0 |
| Google Sheet | Holds every booking | R0 |
| Google Apps Script | The booking backend attached to that Sheet | R0 |

---

## One-time setup

You only ever do this once.

1. Open the booking Sheet in Google Drive.
2. **Extensions → Apps Script**.
3. Delete whatever is in the editor and paste the whole of
   `apps-script/Code.gs` from this repo.
4. Click **Save** (the disk icon). Name the project "Pringle Padel" if it asks.
5. In the function dropdown at the top, pick `setupAll` and click **Run**.
6. Google will ask for permission. Click **Review permissions → your account →
   Advanced → Go to Pringle Padel (unsafe) → Allow**. The "unsafe" wording is
   normal for a personal script.
7. The execution log at the bottom prints your **organiser passcode**. Write it
   down — it is what Lea types on the organiser page. You can recover it any
   time by running `resetPasscode`.

`setupAll` creates two tabs:

- **Entries** — every booking, including phone numbers. Keep this private.
- **Confirmed** — paid players only, no contact details. Safe to share.

### Turning the site on

The website only talks to your Sheet once the Apps Script URL is in
`assets/js/pp-config.js`.

1. In the Apps Script editor: **Deploy → New deployment**.
2. Click the gear, choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
4. **Deploy**, then copy the URL. It ends in `/exec`.
5. Paste it between the quotes in `assets/js/pp-config.js`:

   ```js
   window.PP_CONFIG = { scriptUrl: 'https://script.google.com/macros/s/..../exec' };
   ```

6. Commit and push. The site is live.

Leaving that string empty keeps the site in browser-only test mode, where
bookings are visible only in the browser that made them.

### Every time you change `Code.gs`

Editing the code is not enough. The live site keeps using the last deployed
version until you re-deploy:

**Deploy → Manage deployments → pencil icon → Version: New version → Deploy.**

To check which version is actually live, open this in a browser, swapping in
your own URL:

```
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=public
```

It returns a `build` field. If that does not match the `BUILD` string near the
top of `Code.gs`, the deploy did not take.

---

## Marking someone as paid

Players book on the site and pay by EFT. Nothing appears on the public event
page until the money is seen, because EFT gives the bank no way to tell the
site it arrived.

1. Check the **Entries** tab for the new team and their payment reference.
2. Look for that reference on the bank statement.
3. Open `www.pringlepadel.com/organiser.html`.
4. Enter the organiser passcode (asked once per browser).
5. Find the team and click **Mark paid**.

They appear on the event page immediately.

**Un-confirming:** the same button becomes **Undo**. It removes them from the
public list.

If a player loses their reference, it is in the **Reference** column of the
Entries tab. Every booking also captures a mobile number and email address, so
Lea can contact them directly if needed.

---

## What the public can and cannot see

The public event page shows only **name, team name, division and Playtomic
ranking**, and only for entries marked paid.

Phone numbers, email addresses and payment flags are never sent to a browser.
That is enforced in `Code.gs` by `PUBLIC_FIELDS`, not by the page, so a mistake
in the HTML cannot leak a phone number.

---

## Testing on your own machine

Double-click `START-HERE.bat` — it serves the site and prints the addresses to
open, including the organiser page. This runs on your computer, not the live
site.

Automated checks (requires Node.js and Python):

```
node tests/backend.test.js        # booking rules, bank reconciliation
node tests/event-mapping.test.js  # event names and the public list
node tests/booking-rank.test.js   # ranking input handling
python3 tests/site_integrity.py   # every link and asset resolves
```

`tests/backend.test.js` runs the real `Code.gs` against a mock Google Sheet and
a mock mailbox, so it tests the shipping code rather than a copy of it.
