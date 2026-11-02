@echo off
rem Japanese messages are shown by install.ps1 (cmd.exe misreads UTF-8 lines in batch files).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
exit /b %errorlevel%
