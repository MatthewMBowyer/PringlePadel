# Pringle Padel — bookings test site

Standalone test build. Two sample tournaments, a booking form, a public event
page, and an organiser screen for Lea. Nothing here touches the live
Pringle Padel site.

## Running it (Windows)

Double-click **`START-HERE.bat`**. It starts a small local web server and opens
the site. Leave the black window open while you use it; close it to stop.

Why a server and not just double-clicking the HTML file: browsers block
`localStorage` on `file://` URLs, so entries would not save and the organiser
screen would look empty. The launcher avoids that.

If Python is not installed, get it from <https://www.python.org/downloads/> and
tick *Add python.exe to PATH*.

## Pages

| Page | Who it is for | What it does |
|---|---|---|
| `index.html` | Public | Landing page, links into events |
| `events.html` | Public | Both events with **Enter** and **Details** buttons |
| `event.html?id=…` | Public | Run sheet, prizes, and the **confirmed entry list** |
| `bookings.html?event=…` | Public | Entry form → issues a booking reference |
| `organiser.html` | Lea | Search, **Mark paid**, undo, remove |

## Try the whole loop

1. `events.html` → **Enter** on an event.
2. Fill the form and submit. You get a reference like `LUX-108`.
3. Open `organiser.html` in the **same browser** — the entry sits under
   *Awaiting payment*.
4. Click **Mark paid**.
5. Open the event page again — the name is now on the confirmed list.

Use **Reset test data** on the organiser page to start over.

## How it works today

Everything is static HTML/CSS/JS. Entries live in the browser's `localStorage`
under the key `pp_bookings_v1`, seeded with sample entries on first load.

## How it maps to production

The UI is deliberately built against the shape of the real data, so the swap
is a data-layer change, not a redesign:

- `assets/js/app.js` → `loadBookings()` / `saveBookings()` are the only places
  that touch storage. Point these at a Google Sheet (read the published CSV,
  write through an Apps Script web app) and the rest of the code is unchanged.
- `CONFIG.scriptUrl` is already wired: set it and every new entry POSTs to that
  Apps Script endpoint as a mirror.
- `CONFIG.bank` holds placeholder EFT details for the confirmation screen.

## Known gaps in this test build

- Bank details are placeholders.
- Entries are per-browser; two people on two laptops do not see each other's
  entries until the sheet is wired up.
- No email confirmation is sent.
