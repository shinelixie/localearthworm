@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Earthworm Stopper
cd /d "%~dp0"

echo ============================================
echo   Earthworm - Stop All Services
echo ============================================
echo.

REM ---- Web (3100) ----
call :killport 3100 "Web server"
REM ---- API (3101) ----
call :killport 3101 "API server"
REM ---- Redis (6381) ----
call :killport 6381 "Redis"
REM ---- PostgreSQL (5434) - clean shutdown first ----
echo Stopping PostgreSQL ...
"tools\pgsql\bin\pg_ctl.exe" -D "tools\pgdata" -m fast stop >nul 2>&1
if !errorlevel! neq 0 (
    call :killport 5434 "PostgreSQL"
) else (
    echo   [OK] PostgreSQL stopped
)

echo.
echo ============================================
echo   All services stopped.
echo ============================================
echo.
ping -n 5 127.0.0.1 >nul
exit /b 0

REM ---- helper: kill process listening on given port ----
:killport
set "PORT=%~1"
set "LABEL=%~2"
set "PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    if not defined PID set "PID=%%p"
)
if defined PID (
    taskkill /F /PID !PID! >nul 2>&1
    echo   [OK] %LABEL% stopped ^(PID !PID!^)
) else (
    echo   [SKIP] %LABEL% not running
)
exit /b 0
