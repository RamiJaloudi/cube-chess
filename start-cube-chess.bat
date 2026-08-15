@echo off
setlocal

cd /d "%~dp0"
set "CUBE_CHESS_URL=http://127.0.0.1:4173/"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Cube Chess could not start because Node.js was not found.
  echo Install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)

echo Starting Cube Chess...

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$url = $env:CUBE_CHESS_URL;" ^
  "$ready = $false;" ^
  "try {" ^
  "  $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2;" ^
  "  $ready = $response.StatusCode -eq 200 -and $response.Content.Contains('<title>Cube Chess</title>');" ^
  "} catch {}" ^
  "if (-not $ready) {" ^
  "  Start-Process -FilePath 'node.exe' -ArgumentList 'server.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden;" ^
  "  foreach ($attempt in 1..40) {" ^
  "    Start-Sleep -Milliseconds 250;" ^
  "    try {" ^
  "      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2;" ^
  "      $ready = $response.StatusCode -eq 200 -and $response.Content.Contains('<title>Cube Chess</title>');" ^
  "      if ($ready) { break }" ^
  "    } catch {}" ^
  "  }" ^
  "}" ^
  "if (-not $ready) { Write-Error 'The Cube Chess server did not become ready on port 4173.'; exit 1 }" ^
  "if ($env:CUBE_CHESS_NO_BROWSER -ne '1') { Start-Process $url }"

if errorlevel 1 (
  echo.
  echo Cube Chess did not start. Port 4173 may already be used by another application.
  pause
  exit /b 1
)

echo Cube Chess is running at %CUBE_CHESS_URL%
endlocal
