@echo off
TITLE Pemilu OSIS Digital — Chrome Kiosk Station Launcher
echo ==================================================================
echo 🚀 MEMBUKA CHROME KIOSK MODE UNTUK BILIK VOTING
echo ==================================================================
echo.

SET "SERVER_URL=http://localhost:3000"

IF NOT "%~1"=="" (
    SET "SERVER_URL=%~1"
)

echo Target URL: %SERVER_URL%
echo.

:: Try opening Google Chrome in Kiosk Mode
start "" "chrome.exe" --kiosk --incognito --disable-pinch --overscroll-history-navigation=0 "%SERVER_URL%"

echo Selesai! Chrome dibuka dalam mode Kiosk fullscreen.
echo Tekan Alt+F4 pada keyboard untuk keluar dari Kiosk Mode.
pause
