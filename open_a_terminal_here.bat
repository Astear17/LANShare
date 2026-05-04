@echo off
title LANShare Administrator Terminal
cd /d "%~dp0"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :isAdmin
) else (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:isAdmin
echo Administrator privileges confirmed.

:: Check if global install is needed
if not exist ".installed" (
    echo First time setup: Installing LANShare globally...
    npm install -g .
    if %errorLevel% == 0 (
        echo. > ".installed"
        echo LANShare installed successfully!
    ) else (
        echo Error: Failed to install LANShare globally.
        pause
        exit /b
    )
)

echo.
echo LANShare is ready. Type 'lanshare help' for commands.
echo.
cmd /k
