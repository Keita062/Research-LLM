# Research-LLM

研究室用LLMチャットボット。研究室メンバーがLLM（Google Gemini API）とどのように対話しているかをログとして蓄積し、管理画面から利用状況を分析できるようにするための社内向けWebアプリです。

詳しい要件は [docs/requirements.md](docs/requirements.md) を参照してください。

## 技術スタック

- Next.js 16 (App Router, TypeScript, Turbopack)
- PostgreSQL + Prisma 7（`@prisma/adapter-pg` ドライバアダプタ経由）
- Google Gemini API (`@google/genai`)
- Gmail SMTP（`nodemailer`経由でメール送信、開発中は `EMAIL_MODE=console` でコンソール出力に切替可能）
- Tailwind CSS / Recharts

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

`postinstall` で `prisma generate` が自動実行され、Prismaクライアントが `src/generated/prisma` に生成されます。

### 2. ローカルDB（Postgres）を起動

Docker Desktopが必要です。

```bash
docker compose up -d
```

### 3. 環境変数を設定

```bash
cp .env.example .env
```

`.env` の主な項目:

| 変数 | 説明 |
|---|---|
| `DATABASE_URL` | Postgres接続文字列（デフォルトでdocker-compose構成に一致） |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) で発行。未設定でもアプリ自体は起動・動作するが、チャット送信時に「Gemini APIキーが未設定です」というエラーになる |
| `EMAIL_MODE` | `console`（デフォルト、確認メール等のリンクをサーバーログに出力）／ `gmail`（実際にGmail SMTP経由でメール送信） |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | 送信用Gmailアカウントのアドレスと[アプリパスワード](https://myaccount.google.com/apppasswords)（2段階認証を有効にした上で発行）。`EMAIL_MODE=gmail` の場合に必要 |
| `GMAIL_FROM_EMAIL` | メールの送信元表示（例: `Lab Chatbot <your-address@gmail.com>`）。省略時は`GMAIL_USER`がそのまま使われる |
| `RATE_LIMIT_*` | 初回seed時の`RateLimitConfig`初期値。以降は管理画面(`/admin/usage`)から変更可能。**Gemini無料枠の実際の数値は変動するため、必ず [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit) で確認し、安全マージンを見て設定すること** |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | 初回seedで作成される最初の管理者アカウント |

### 4. マイグレーション＆初期データ投入

```bash
npx prisma migrate dev
npm run db:seed
```

`db:seed` により、最初の管理者アカウント（`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`）と`RateLimitConfig`初期行が作成されます。通常のサインアップ画面からは管理者アカウントを作成できない設計のため、最初の管理者は必ずこのseedで作成してください。

### 5. 開発サーバー起動

```bash
npm run dev
```

http://localhost:3000 にアクセスします。

## APIキーを後から設定する場合

`GEMINI_API_KEY` / `GMAIL_USER` / `GMAIL_APP_PASSWORD` を取得したら `.env` に追記し（`EMAIL_MODE=gmail` に変更するとメールも実送信になります）、開発サーバーを再起動してください。それまではGemini連携以外の機能（アカウント作成・ログイン・パスワード変更・管理画面など）は問題なく動作します。

## 主な画面

| パス | 説明 |
|---|---|
| `/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password` | アカウント作成・ログイン・パスワード関連 |
| `/chat` | チャット画面 |
| `/account` | パスワード変更 |
| `/admin/users` | （管理者のみ）アカウント一覧・有効化/無効化 |
| `/admin/usage` | （管理者のみ）利用統計ダッシュボード・レート制限設定 |

## その他コマンド

```bash
npm run db:studio   # Prisma Studio（DBの中身をGUIで確認）
npm run db:migrate   # マイグレーション作成・適用
npx tsc --noEmit     # 型チェック
npx eslint .         # Lint
npm run build        # 本番ビルド
```
