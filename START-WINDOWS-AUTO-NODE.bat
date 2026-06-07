@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Meat Shop Local Server

echo ============================================
echo  Meat Shop - local start
echo ============================================
echo.

set "NODE_CMD="
set "NPM_CMD="
set "NODE_DIR="

where node.exe >nul 2>nul
if not errorlevel 1 (
  set "NODE_CMD=node"
  set "NPM_CMD=npm"
  goto NODE_READY
)

for /d %%D in ("%~dp0.tools\node\node-v*-win-x64") do (
  if exist "%%~fD\node.exe" set "NODE_DIR=%%~fD"
)

if defined NODE_DIR (
  set "PATH=%NODE_DIR%;%PATH%"
  set "NODE_CMD=%NODE_DIR%\node.exe"
  set "NPM_CMD=%NODE_DIR%\npm.cmd"
  goto NODE_READY
)

echo Node.js was not found on this computer.
echo I will download portable Node.js into this project folder.
echo This does not need administrator rights.
echo.
if not exist "%~dp0tools\install-node-portable.ps1" (
  echo File tools\install-node-portable.ps1 was not found.
  echo Please extract the whole ZIP archive and run this file again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install-node-portable.ps1"
if errorlevel 1 (
  echo.
  echo Automatic Node.js download failed.
  echo Please install Node.js LTS from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

for /d %%D in ("%~dp0.tools\node\node-v*-win-x64") do (
  if exist "%%~fD\node.exe" set "NODE_DIR=%%~fD"
)

if not defined NODE_DIR (
  echo Portable Node.js folder was not found after download.
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
set "NODE_CMD=%NODE_DIR%\node.exe"
set "NPM_CMD=%NODE_DIR%\npm.cmd"

:NODE_READY
echo Node.js is ready:
"%NODE_CMD%" -v
echo.

if not exist ".env" (
  echo Creating .env from .env.example...
  copy /Y ".env.example" ".env" >nul
  if errorlevel 1 (
    echo Could not create .env file.
    echo Make sure this folder is extracted from the ZIP archive.
    echo.
    pause
    exit /b 1
  )
)

if not exist "node_modules\express" (
  echo Installing dependencies. This can take a few minutes...
  call "%NPM_CMD%" install --omit=dev --registry=https://registry.npmjs.org/ --no-audit --no-fund --package-lock=false
  if errorlevel 1 (
    echo.
    echo npm install failed.
    echo Check your internet connection, antivirus, or folder permissions.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Server is starting...
echo Shop:  http://localhost:3000
echo Admin: http://localhost:3000/admin
echo Admin password: admin123
echo.
echo To stop the server press Ctrl+C, then type Y and press Enter.
echo.

start "" "http://localhost:3000"
call "%NPM_CMD%" start

echo.
echo Server stopped.
pause
