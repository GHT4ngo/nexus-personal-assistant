@echo off
setlocal

set PROJECT=C:\nac\Python\Projects\personal_assistant
set ANDROID=%PROJECT%\android
set ADB=C:\android\platform-tools\adb.exe
set APK=%ANDROID%\app\build\outputs\apk\debug\app-debug.apk
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr

echo.
echo === Nexus phone build and install ===
echo.

if not exist "%ADB%" (
  echo Could not find ADB at:
  echo %ADB%
  pause
  exit /b 1
)

cd /d "%PROJECT%"
echo Syncing Nexus into Android project...
call npm run mobile:sync
if errorlevel 1 goto failed

cd /d "%ANDROID%"
echo Building debug APK...
call gradlew.bat assembleDebug --no-problems-report
if errorlevel 1 goto failed

if not exist "%APK%" (
  echo APK was not created:
  echo %APK%
  pause
  exit /b 1
)

echo Checking connected phone...
"%ADB%" devices
echo.
echo Installing Nexus on phone...
"%ADB%" install -r "%APK%"
if errorlevel 1 goto failed

echo.
echo Done. Open Nexus on the phone.
pause
exit /b 0

:failed
echo.
echo Nexus phone build/install failed. Read the message above.
pause
exit /b 1
