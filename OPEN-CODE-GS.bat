@echo off
REM Opens Code.gs in Notepad so it can be copied into the Apps Script editor.
setlocal
set "GS=%~dp0apps-script\Code.gs"

if not exist "%GS%" (
  echo Could not find:
  echo   %GS%
  echo.
  echo Run this file from inside the pringle-padel folder.
  pause
  exit /b 1
)

echo Opening Code.gs in Notepad...
echo.
echo   1. Press Ctrl+A then Ctrl+C to copy the whole file.
echo   2. In the Apps Script editor, click in the code area.
echo   3. Press Ctrl+A then Ctrl+V to replace everything.
echo   4. Click Save, then Deploy - Manage deployments - pencil - New version - Deploy.
echo.
start "" notepad "%GS%"
