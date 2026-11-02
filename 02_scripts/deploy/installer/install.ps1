# Research LLM Agent を VS Code にインストールする（install.cmd から呼ばれる）
$ErrorActionPreference = "Continue"

function Finish([string]$message, [int]$exitCode) {
  Write-Host ""
  Write-Host $message
  Read-Host "Enter キーを押すと閉じます" | Out-Null
  exit $exitCode
}

Write-Host "Research LLM Agent をインストールします..."
$vsix = Join-Path $PSScriptRoot "research-llm-agent.vsix"

# code.cmd はフルパスで呼ぶ（名前だけで呼ぶと code.cmd が Code.exe の場所を取り違える）
$candidates = @()
$found = Get-Command code.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
if ($found) { $candidates += $found.Source }
$candidates += Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\bin\code.cmd"
if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles "Microsoft VS Code\bin\code.cmd" }
$code = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $code) {
  Finish "VS Code が見つかりませんでした。https://code.visualstudio.com/ からインストールしてから、もう一度実行してください。" 1
}

& $code --install-extension $vsix --force
if ($LASTEXITCODE -ne 0) {
  Finish "インストールに失敗しました。上に表示された内容を研究者に伝えてください。" 1
}

Finish "インストールが完了しました。`nVS Code を開き、左端の「Research LLM」アイコンをクリックして招待コードを入力してください。" 0
