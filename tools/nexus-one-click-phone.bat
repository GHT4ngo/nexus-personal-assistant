@echo off
setlocal

set PROJECT=C:\nac\Python\Projects\personal_assistant
set ANDROID=%PROJECT%\android
set ADB=C:\android\platform-tools\adb.exe
set APK=%ANDROID%\app\build\outputs\apk\debug\app-debug.apk
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr

echo.
echo === Nexus one-click phone setup ===
echo Plug in phone, unlock it, allow USB debugging, then run this file.
echo This builds/installs the phone app only. Start the server separately with nexus-start.bat.
echo.

if not exist "%ADB%" (
  echo Could not find ADB at:
  echo %ADB%
  pause
  exit /b 1
)

echo Stopping old Nexus/Android workers...
if exist "%ANDROID%\gradlew.bat" (
  cd /d "%ANDROID%"
  call gradlew.bat --stop
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process java -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Android Studio*' -or $_.Path -like '*Android*' } | Stop-Process -Force"

echo.
echo Checking phone connection...
"%ADB%" devices
echo If the list is empty, unlock the phone and allow USB debugging.
echo.

cd /d "%PROJECT%"
echo Syncing Nexus into Android...
call npm run mobile:sync
if errorlevel 1 goto failed

cd /d "%ANDROID%"
echo Building APK...
call gradlew.bat assembleDebug --no-problems-report
if errorlevel 1 goto failed

if not exist "%APK%" (
  echo APK was not created:
  echo %APK%
  pause
  exit /b 1
)

echo Installing Nexus on phone...
"%ADB%" install -r "%APK%"
if errorlevel 1 goto failed

echo.
echo Done.
echo Open Nexus on the phone.
echo Server URL: http://YOUR_PC_IP:8050
echo Start server separately with: tools\nexus-start.bat
pause
exit /b 0

:failed
echo.
echo Nexus one-click setup failed. Read the message above.
pause
exit /b 1
