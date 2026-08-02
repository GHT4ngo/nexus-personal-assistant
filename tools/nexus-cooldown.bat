@echo off
setlocal

set PROJECT=C:\nac\Python\Projects\personal_assistant
set ANDROID=%PROJECT%\android
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr

echo.
echo === Nexus cooldown ===
echo Stops Gradle build workers and Node servers.
echo.

if exist "%ANDROID%\gradlew.bat" (
  cd /d "%ANDROID%"
  call gradlew.bat --stop
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process java -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Android Studio*' -or $_.Path -like '*Android*' } | Stop-Process -Force"

echo.
echo Cooldown complete.
pause
