@echo off
SET "DIR=%~1"
IF "%DIR%"=="" SET "DIR=%CD%"

echo.
echo Starting LANShare in: %DIR%
echo.

cd /d "%~dp0"
node server.js
pause
