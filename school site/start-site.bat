@echo off
cd /d "%~dp0"
start "" python -m http.server 8123
timeout /t 2 >nul
start "" "http://localhost:8123/index.html"
exit
