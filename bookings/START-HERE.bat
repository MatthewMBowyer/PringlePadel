@echo off
REM Pringle Padel bookings - test build
REM Double-click this file to open the test site in your browser.
REM It starts a tiny local web server (needed so bookings save correctly)
REM and opens the site. Close this window when you are done.

setlocal
set PORT=8080
set HERE=%~dp0

cd /d "%HERE%"

REM Find a Python to serve with.
set PY=
where py >nul 2>&1 && set PY=py
if not defined PY where python >nul 2>&1 && set PY=python

if not defined PY (
  echo.
  echo   Python was not found on this PC.
  echo.
  echo   Install it from https://www.python.org/downloads/
  echo   and tick "Add python.exe to PATH" during setup.
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting the Pringle Padel test site...
echo.
echo   Home        http://localhost:%PORT%/index.html
echo   Events      http://localhost:%PORT%/events.html
echo   Enter       http://localhost:%PORT%/bookings.html
echo   For Lea     http://localhost:%PORT%/organiser.html
echo.
echo   Leave this window open while you use the site.
echo   Press Ctrl+C here, or just close the window, to stop it.
echo.

start "" "http://localhost:%PORT%/index.html"
%PY% -m http.server %PORT% --bind 127.0.0.1

endlocal
