@echo off
setlocal
cd /d C:\nac\Python\Projects\personal_assistant

echo.
echo === Nexus local server ===
echo This starts Nexus on http://0.0.0.0:8050
echo Phone server URL is usually: http://YOUR_PC_IP:8050
echo Low power mode: 25 mails per request, 2 mail parsers at a time
echo.

set NEXUS_MAIL_FETCH_LIMIT=25
set NEXUS_MAIL_PARSE_CONCURRENCY=2
npm start

echo.
echo Nexus server stopped.
pause
