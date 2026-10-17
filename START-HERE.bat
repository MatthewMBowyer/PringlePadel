@echo off
cd /d "%~dp0"
title Pringle Padel - local preview
set PORT=8080

set PY=
where py >nul 2>&1 && set PY=py -3
if "%PY%"=="" (where python >nul 2>&1 && set PY=python)

if "%PY%"=="" goto nopython

echo.
echo   Serving this folder at http://localhost:%PORT%/
echo.
echo   Tournaments:  http://localhost:%PORT%/tournaments.html
echo   Organiser:    http://localhost:%PORT%/organiser.html
echo.
echo   Close this window to stop.
echo.

start "" /b cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%/tournaments.html"
%PY% -m http.server %PORT%
goto :eof

:nopython
echo.
echo   Python was not found, so opening the pages directly.
echo   (Install Python from python.org for the full booking test.)
echo.
start "" "tournaments.html"
start "" "organiser.html"
pause
