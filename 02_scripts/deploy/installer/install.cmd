@echo off
rem Japanese messages are shown by install.ps1 (cmd.exe misreads UTF-8 lines in batch files).
rem When opened directly inside the ZIP, only this file is extracted to a temp folder and install.ps1 is missing.
if not exist "%~dp0install.ps1" (
  echo.
  echo  The ZIP file is not extracted yet.
  echo  Right-click the ZIP file, choose "Extract All", then run install.cmd in the extracted folder.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
exit /b %errorlevel%
