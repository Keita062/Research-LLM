@echo off
chcp 65001 >nul
setlocal
echo Research LLM Agent をインストールします...
set "VSIX=%~dp0research-llm-agent.vsix"
set "CODE="
where code >nul 2>nul && set "CODE=code"
if not defined CODE if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" set "CODE=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
if not defined CODE if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" set "CODE=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
if not defined CODE (
  echo.
  echo VS Code が見つかりませんでした。https://code.visualstudio.com/ からインストールしてから、もう一度実行してください。
  pause
  exit /b 1
)
call "%CODE%" --install-extension "%VSIX%" --force
if errorlevel 1 (
  echo インストールに失敗しました。研究者に連絡してください。
  pause
  exit /b 1
)
echo.
echo インストールが完了しました。
echo VS Code を開き、左端の「Research LLM」アイコンをクリックして招待コードを入力してください。
pause
