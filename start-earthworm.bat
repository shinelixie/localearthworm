@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Earthworm Launcher
cd /d "%~dp0"

set "LAUNCH=%~dp0tools\launch-hidden.vbs"

echo ============================================
echo   Earthworm - Local Launcher
echo ============================================
echo.

REM ---- locate node.exe ----
set "NODE_EXE="
for /f "delims=" %%i in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%i"
)
if not defined NODE_EXE if exist "C:\Users\Administrator\.workbuddy\binaries\node\versions\22.12.0\node.exe" set "NODE_EXE=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.12.0\node.exe"
if not defined NODE_EXE (
    echo [ERROR] node.exe not found. Install Node.js 20+ or edit NODE_EXE here.
    pause
    exit /b 1
)
echo [OK] Node: !NODE_EXE!
echo.

REM ---- 1. PostgreSQL ----
netstat -ano | findstr /c:":5434 " | findstr /i "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo [SKIP] PostgreSQL already running on 5434
) else (
    echo [1/4] Starting PostgreSQL ...
    wscript //nologo "!LAUNCH!" "%~dp0tools\pgsql" "%~dp0tools\pgsql\bin\postgres.exe" -D "%~dp0tools\pgdata" -p 5434 -c listen_addresses=127.0.0.1
    ping -n 5 127.0.0.1 >nul
)

REM ---- 2. Redis ----
netstat -ano | findstr /c:":6381 " | findstr /i "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo [SKIP] Redis already running on 6381
) else (
    echo [2/4] Starting Redis ...
    wscript //nologo "!LAUNCH!" "%~dp0tools\redis" "%~dp0tools\redis\redis-server.exe" --port 6381 --dir "%~dp0tools\redis-data" --save ""
    ping -n 3 127.0.0.1 >nul
)

REM ---- 3. API server (NestJS, 3101) ----
netstat -ano | findstr /c:":3101 " | findstr /i "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo [SKIP] API already running on 3101
) else (
    echo [3/4] Starting API server ...
    wscript //nologo "!LAUNCH!" "%~dp0apps\api" "!NODE_EXE!" --env-file=.env dist\src\main
    ping -n 7 127.0.0.1 >nul
)

REM ---- 4. Web server (Nuxt/Nitro, 3100) ----
netstat -ano | findstr /c:":3100 " | findstr /i "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo [SKIP] Web already running on 3100
) else (
    echo [4/4] Starting web server ...
    wscript //nologo "!LAUNCH!" "%~dp0apps\client" "!NODE_EXE!" server-start.mjs
    ping -n 7 127.0.0.1 >nul
)

echo.
echo Waiting for services ...
ping -n 5 127.0.0.1 >nul

netstat -ano | findstr /c:":3100 " | findstr /i "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo.
    echo ============================================
    echo   Ready!  Opening http://localhost:3100
    echo ============================================
    start "" http://localhost:3100
) else (
    echo [WARN] Web server not up yet. Open http://localhost:3100 in a few seconds.
)

echo.
echo All services run silently in background - no windows will stay open.
echo To stop everything, run stop-earthworm.bat
echo.
ping -n 4 127.0.0.1 >nul
exit /b 0
