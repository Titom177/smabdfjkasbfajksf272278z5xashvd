@echo off
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org then run this again. & pause & exit /b 1)
start "" http://localhost:3000
node index.js
pause
