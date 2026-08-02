@echo off
setlocal

set PROJECT=C:\nac\Python\Projects\personal_assistant
set LOGDIR=%PROJECT%\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo.
echo === Nexus emergency memory check ===
echo This records what is using memory, then lets you stop common dev/background apps.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$out='%LOGDIR%\emergency-memory.txt';" ^
  "'=== Memory counters ===' | Out-File $out;" ^
  "Get-Counter '\Memory\Committed Bytes','\Memory\Commit Limit','\Memory\Available MBytes','\Memory\Pool Nonpaged Bytes','\Memory\Pool Paged Bytes','\Paging File(_Total)\%% Usage' | Select-Object -ExpandProperty CounterSamples | Select-Object Path,CookedValue | Format-Table -AutoSize | Out-String | Add-Content $out;" ^
  "'=== Top private memory ===' | Add-Content $out;" ^
  "Get-Process | Sort-Object PrivateMemorySize64 -Descending | Select-Object -First 35 ProcessName,Id,CPU,@{Name='PrivateMB';Expression={[math]::Round($_.PrivateMemorySize64/1MB,1)}},@{Name='WorkingMB';Expression={[math]::Round($_.WorkingSet64/1MB,1)}},Path | Format-Table -AutoSize | Out-String | Add-Content $out;" ^
  "'=== Top CPU ===' | Add-Content $out;" ^
  "Get-Process | Sort-Object CPU -Descending | Select-Object -First 25 ProcessName,Id,CPU,@{Name='PrivateMB';Expression={[math]::Round($_.PrivateMemorySize64/1MB,1)}},@{Name='WorkingMB';Expression={[math]::Round($_.WorkingSet64/1MB,1)}},Path | Format-Table -AutoSize | Out-String | Add-Content $out;" ^
  "Write-Host ('Saved report to ' + $out)"

echo.
choice /C YN /M "Stop Nexus/Android build workers now"
if errorlevel 2 goto skip_dev
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force; Get-Process java -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Android Studio*' -or $_.Path -like '*Android*' } | Stop-Process -Force"
:skip_dev

echo.
choice /C YN /M "Stop Ollama if it is running"
if errorlevel 2 goto skip_ollama
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force"
:skip_ollama

echo.
choice /C YN /M "Stop VS Code windows/extensions if they are running"
if errorlevel 2 goto skip_code
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process Code -ErrorAction SilentlyContinue | Stop-Process -Force"
:skip_code

echo.
choice /C YN /M "Stop Discord if it is running"
if errorlevel 2 goto skip_discord
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process Discord -ErrorAction SilentlyContinue | Stop-Process -Force"
:skip_discord

echo.
choice /C YN /M "Stop local database servers MySQL/MongoDB if they are running"
if errorlevel 2 goto skip_db
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process mysqld,mongod -ErrorAction SilentlyContinue | Stop-Process -Force"
:skip_db

echo.
echo Done. If memory is still at 99-100%% after a minute, Windows/driver memory is likely stuck and a restart may be required.
pause
