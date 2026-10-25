#!/bin/bash
# ダブルクリックで実行（初回は右クリック →「開く」）
cd "$(dirname "$0")"
echo "Research LLM Agent をインストールします..."
CODE="$(command -v code || true)"
for c in "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"; do
  [ -z "$CODE" ] && [ -x "$c" ] && CODE="$c"
done
if [ -z "$CODE" ]; then
  echo "VS Code が見つかりませんでした。https://code.visualstudio.com/ からインストールしてから、もう一度実行してください。"
  read -r -p "Enter キーで閉じます"
  exit 1
fi
if "$CODE" --install-extension "./research-llm-agent.vsix" --force; then
  echo
  echo "インストールが完了しました。"
  echo "VS Code を開き、左端の「Research LLM」アイコンをクリックして招待コードを入力してください。"
else
  echo "インストールに失敗しました。研究者に連絡してください。"
fi
read -r -p "Enter キーで閉じます"
