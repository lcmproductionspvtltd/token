@echo off
setlocal
rem BQuee launcher for Windows.
rem Uses the Node.js kept in .\runtime (downloaded once if missing) - nothing is installed system-wide.
rem
rem   start.bat                 start the server
rem   start.bat seed            load the demo data (empty database only)
rem   start.bat seed --force    wipe everything and load the demo data
rem   start.bat migrate         apply database migrations
rem   start.bat reset-admin     set a new super admin password

cd /d "%~dp0"
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
set "NODE=%~dp0runtime\win-%ARCH%\node.exe"
if exist "%NODE%" goto ready

where node >nul 2>nul
if not errorlevel 1 (
  node -e "process.exit(+process.versions.node.split('.')[0]>=20?0:1)" >nul 2>nul
  if not errorlevel 1 ( set "NODE=node" & goto ready )
)
echo Preparing Node.js (one time only)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\get-node.ps1" -Arch %ARCH%
if not exist "%~dp0runtime\win-%ARCH%\node.exe" ( echo Could not prepare Node.js. See README. & pause & exit /b 1 )
set "NODE=%~dp0runtime\win-%ARCH%\node.exe"

:ready
if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example - set DATABASE_URL in it.
)

if /i "%~1"=="seed" ( "%NODE%" scripts\seed.js %2 & goto end )
if /i "%~1"=="migrate" ( "%NODE%" src\db\migrate.js & goto end )
if /i "%~1"=="reset-admin" ( "%NODE%" scripts\reset-admin.js %2 %3 & goto end )
"%NODE%" server.js

:end
pause
