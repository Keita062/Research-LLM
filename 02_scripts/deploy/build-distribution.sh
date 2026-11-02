#!/usr/bin/env bash
# 参加者に配布する ZIP（拡張機能 .vsix・インストーラー・手順書）を作る。
# 使い方: ./02_scripts/deploy/build-distribution.sh https://research-llm-xxxx.a.run.app
set -euo pipefail
SERVER_URL="${1:?サーバーURLを指定してください}"
SERVER_URL="${SERVER_URL%/}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXT="$ROOT/02_scripts/extension"
OUT="$ROOT/02_scripts/deploy/out"
# Git Bash の /c/... 形式のパスは Node が解決できないため、拡張フォルダからの相対パスで読む
VERSION="$(cd "$EXT" && node -p "require('./package.json').version")"
NAME="research-llm-agent-$VERSION"

cd "$EXT"
cp package.json package.json.bak
trap 'mv -f "$EXT/package.json.bak" "$EXT/package.json"' EXIT
node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.contributes.configuration.properties['researchLlm.serverUrl'].default=process.argv[1];
fs.writeFileSync('package.json',JSON.stringify(p,null,2));" "$SERVER_URL"
npm ci
npm run package

rm -rf "$OUT/$NAME"
mkdir -p "$OUT/$NAME"
cp dist/research-llm-agent.vsix "$OUT/$NAME/"
cp "$ROOT/02_scripts/deploy/installer/install.cmd" "$OUT/$NAME/"
cp "$ROOT/02_scripts/deploy/installer/install.ps1" "$OUT/$NAME/"
cp "$ROOT/02_scripts/deploy/installer/install.command" "$OUT/$NAME/"
chmod +x "$OUT/$NAME/install.command"
cp "$ROOT/01_docs/参加者向け手順書.md" "$OUT/$NAME/はじめにお読みください.md"
cd "$OUT"
rm -f "$NAME.zip"
if command -v zip >/dev/null; then zip -qr "$NAME.zip" "$NAME"; else powershell -NoProfile -Command "Compress-Archive -Path '$NAME' -DestinationPath '$NAME.zip'"; fi
echo "作成しました: $OUT/$NAME.zip（サーバー: $SERVER_URL）"
