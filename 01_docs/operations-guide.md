# デプロイ・運用手順書（研究者向け）

## 1. 構成

| 要素 | 場所 |
|---|---|
| サーバー（参加者API＋管理画面） | `02_scripts/server/` → Cloud Run（`asia-northeast1`、サービス名 `research-llm`） |
| DB | Firestore（`participants`・`events`・`usage`・`config`）。`events.expireAt` の TTL で受信 1 年後に自動削除 |
| 秘密情報 | Secret Manager（`gemini-api-key`・`session-secret`・`google-oauth-client-secret`） |
| 拡張機能 | `02_scripts/extension/` → `.vsix` |
| スクリプト | `02_scripts/deploy/deploy.sh`（デプロイ）、`build-distribution.sh`（配布 ZIP 作成） |

## 2. 初回デプロイ

前提：GCP プロジェクト `research-llm-512715` に課金アカウントが紐付いていること。

1. [Cloud Shell](https://shell.cloud.google.com/?project=research-llm-512715) を開き、リポジトリを取得する
   ```bash
   git clone https://github.com/Keita062/Research-LLM.git && cd Research-LLM
   ```
2. デプロイする（管理者のアドレスはここで指定し、リポジトリには書かない）。Gemini API キーの入力を求められる
   ```bash
   ADMIN_EMAILS="管理者1@example.com,管理者2@example.com" ./02_scripts/deploy/deploy.sh
   ```
3. 最後に表示される「サーバーURL」「OAuth リダイレクトURI」を控える

## 3. 管理画面の Google ログイン設定（初回のみ）

1. GCP コンソール →「API とサービス」→「OAuth 同意画面」で、ユーザーの種類「外部」、アプリ名・サポートメールを入力して作成する。テストユーザーに管理者のアカウントを追加する（公開ステータスを「本番」にする場合は不要）
2. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」→ 種類「ウェブ アプリケーション」
3. 「承認済みのリダイレクト URI」に `https://<サーバーURL>/admin/oauth/callback` を登録して作成する
4. クライアントIDとシークレットを指定して再デプロイする（シークレットは入力を求められる）
   ```bash
   ADMIN_EMAILS="..." GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com" ./02_scripts/deploy/deploy.sh
   ```
5. `https://<サーバーURL>/admin` を開き、「Google でログイン」できることを確認する。`ADMIN_EMAILS` にないアカウントはログインできない

## 4. 配布パッケージの作成

```bash
./02_scripts/deploy/build-distribution.sh https://<サーバーURL>
```

`02_scripts/deploy/out/research-llm-agent-<版>.zip` ができる（`.vsix`・`install.cmd`・`install.command`・参加者向け手順書）。サーバーURLは `.vsix` に埋め込まれるので、参加者の設定は不要。

**教授の合意と倫理手続が終わるまで、実参加者には配布しない**（テスト用参加者のみ）。

## 5. 日常の運用（管理画面）

| 操作 | 場所 |
|---|---|
| 参加者の登録・招待コード発行 | 「参加者」→ 人数を入れて「発行」。コードはその画面でのみ表示される。研究用IDと氏名の対応表はシステム外で保管する |
| 招待コードの再発行（PC変更など） | 「コード再発行」。旧端末の接続は無効になる |
| 参加者の停止／再開 | 「停止」「再開」。次の依頼から即時反映 |
| 全体停止（キルスイッチ） | 「全体の利用を停止」 |
| 同意撤回者の再開 | 撤回者の行の「再開」。参加者が再度すべてに同意すると使えるようになる |
| データ削除（削除依頼への対応） | 「削除」で参加者情報とすべてのイベントを削除 |
| ログ閲覧・CSV | 「ログ」で絞り込み、出力する列を選んでダウンロード（本文・拡張子・トークン数は既定で出力しない） |
| 利用上限・モデル | 「設定」。1日の区切りは太平洋時間 0 時（Gemini の無料枠のリセットに合わせている） |

- 3日以上ログを受信していない有効な参加者は赤字で表示される
- 利用上限の既定値（全体 10 回/分・250 回/日、1人 80 回/日・200 万トークン/日）は `gemini-2.5-flash` の無料枠を想定した値。最新の無料枠は https://ai.google.dev/gemini-api/docs/rate-limits で確認し、「設定」で調整する
- 1分あたりの上限はサーバー内で数えるため、Cloud Run は最大インスタンス数 1 で動かしている

## 6. 更新

- サーバー：`deploy.sh` を同じ環境変数で再実行する。`GOOGLE_CLIENT_ID` を付け忘れると管理画面にログインできなくなるので、必ず `ADMIN_EMAILS` と一緒に指定する（シークレットは登録済みなので再入力は不要）
- 拡張機能：`02_scripts/extension/package.json` の `version` を上げて配布 ZIP を作り直す。古い版を使わせない場合は「設定」の「最低拡張バージョン」を上げる

## 7. ローカル開発

```bash
cd 02_scripts/server && cp .env.example .env && npm install && npm run dev   # http://localhost:8080/admin
cd 02_scripts/extension && npm install && npm run build                      # VS Code で F5 ではなく .vsix で確認する場合は npm run package
```

`GEMINI_API_KEY` が空ならモック応答になる（`/mock-list`・`/mock-edit`・`/mock-run` でツール呼び出しを確認できる）。`ADMIN_DEV_LOGIN=1` でメールアドレス入力だけのローカル用ログインが使える（本番では無効）。
