@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0package-xpi.ps1" %*
set "exitCode=%ERRORLEVEL%"
endlocal & exit /b %exitCode%
