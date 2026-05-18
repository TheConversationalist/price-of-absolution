@echo off
setlocal EnableExtensions

REM Price of Absolution — start sync, book, tablet dev servers + projector Chrome kiosk.
cd /d "%~dp0"

set "ROOT=%CD%"
set "PATH=C:\Program Files\nodejs;%PATH%"

set "BOOK_PORT=5173"
set "TABLET_PORT=5174"
set "BOOK_URL=http://127.0.0.1:%BOOK_PORT%/"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [exhibit] npm not found. Install Node.js and ensure it is on PATH.
  pause
  exit /b 1
)

echo [exhibit] Starting sync server (port 8787)...
start "POA Sync" cmd /k "cd /d "%ROOT%" && npm.cmd run dev:sync"

echo [exhibit] Starting book projection (port %BOOK_PORT%)...
start "POA Book" cmd /k "cd /d "%ROOT%" && npm.cmd run dev:book -- --host --port %BOOK_PORT% --strictPort"

echo [exhibit] Starting tablet controller (port %TABLET_PORT%)...
start "POA Tablet" cmd /k "cd /d "%ROOT%" && npm.cmd run dev:tablet -- --host --port %TABLET_PORT% --strictPort"

echo [exhibit] Waiting for book server on port %BOOK_PORT%...
set /a WAIT=0
:wait_book
netstat -an | findstr /C:":%BOOK_PORT% " | findstr LISTENING >nul 2>&1
if %errorlevel%==0 goto book_ready
set /a WAIT+=1
if %WAIT% GEQ 60 (
  echo [exhibit] Timed out waiting for port %BOOK_PORT%. Check the POA Book window for errors.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_book

:book_ready
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

if not defined CHROME (
  echo [exhibit] Google Chrome not found. Open %BOOK_URL% manually in kiosk/fullscreen.
  echo [exhibit] Tablet on another device: http://YOUR_LAN_IP:%TABLET_PORT%/
  pause
  exit /b 0
)

echo [exhibit] Launching Chrome kiosk: %BOOK_URL%
start "" "%CHROME%" ^
  --kiosk ^
  --autoplay-policy=no-user-gesture-required ^
  --no-first-run ^
  --disable-infobars ^
  --disable-session-crashed-bubble ^
  --disable-translate ^
  --disable-features=TranslateUI ^
  --new-window ^
  "%BOOK_URL%"

echo.
echo [exhibit] Running.
echo   Book (projector):  %BOOK_URL%
echo   Tablet (LAN):      http://YOUR_LAN_IP:%TABLET_PORT%/
echo   Sync WebSocket:    ws://YOUR_LAN_IP:8787
echo.
echo Close the POA Sync / Book / Tablet windows to stop servers.
echo Exit kiosk: Alt+F4

endlocal
