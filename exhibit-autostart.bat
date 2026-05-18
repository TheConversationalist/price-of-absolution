@echo off
setlocal EnableExtensions

REM Price of Absolution — start sync, book, tablet dev servers + projector Chrome kiosk.
cd /d "%~dp0"

set "ROOT=%CD%"
set "PATH=C:\Program Files\nodejs;%PATH%"

set "BOOK_PORT=5173"
set "TABLET_PORT=5174"
set "BOOK_URL=http://127.0.0.1:%BOOK_PORT%/?kiosk=1"
set "CHROME_PROFILE=%ROOT%\.chrome-exhibit-kiosk"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [exhibit] npm not found. Install Node.js and ensure it is on PATH.
  pause
  exit /b 1
)

for /f "delims=" %%I in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^169\.254\.' } | Select-Object -First 1 -ExpandProperty IPAddress)"') do set "LAN_IP=%%I"
if not defined LAN_IP set "LAN_IP=YOUR_LAN_IP"

echo [exhibit] Starting sync server (port 8787)...
start "POA Sync" cmd /k "cd /d "%ROOT%" && npm.cmd run dev:sync"

echo [exhibit] Starting book projection (port %BOOK_PORT%)...
start "POA Book" cmd /k "cd /d "%ROOT%" && npm.cmd run dev:book"

echo [exhibit] Starting tablet controller (port %TABLET_PORT%)...
start "POA Tablet" cmd /k "cd /d "%ROOT%" && npm.cmd run dev:tablet"

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
  echo [exhibit] Tablet: http://%LAN_IP%:%TABLET_PORT%/
  pause
  exit /b 0
)

if not exist "%CHROME_PROFILE%" mkdir "%CHROME_PROFILE%"

echo [exhibit] Launching Chrome kiosk: %BOOK_URL%
start "" "%CHROME%" ^
  --user-data-dir="%CHROME_PROFILE%" ^
  --kiosk ^
  --start-fullscreen ^
  --autoplay-policy=no-user-gesture-required ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-infobars ^
  --disable-session-crashed-bubble ^
  --disable-translate ^
  --disable-notifications ^
  --disable-popup-blocking ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --disable-features=TranslateUI ^
  --new-window ^
  "%BOOK_URL%"

echo.
echo [exhibit] Running.
echo   Book (projector):  %BOOK_URL%
echo   Tablet (LAN):      http://%LAN_IP%:%TABLET_PORT%/
echo   Sync (direct WS):  ws://%LAN_IP%:8787  (apps use /sync-ws via Vite)
echo.
echo In POA Book / Tablet windows you should see "Network: http://%LAN_IP%:PORT/"
echo Close those windows to stop servers. Exit kiosk: Alt+F4

endlocal
