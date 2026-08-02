@echo off
setlocal

echo.
echo === Nexus firewall rule ===
echo This must be run as Administrator.
echo It opens only TCP port 8050 for Nexus testing.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'Nexus Local Server 8050' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8050"

echo.
echo Firewall rule command finished.
pause
