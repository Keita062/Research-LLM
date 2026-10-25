# AGENTS.md — Research-LLM 作業ルール

## プロジェクトの現在地（最初に読む）

- このリポジトリは卒業研究「AIコーディングエージェントと人間の相互作用が、1つの依頼の中でどう展開し、利用期間を通じてどう変化するか」のための開発リポジトリ。
- **v1（タグ `v1-chatbot`）**：研究室用LLMチャットボット（Next.js＋Prisma＋PostgreSQL＋Gemini API）。完成済み。
- **v2（これから）**：研究室メンバーが普段の開発（VS Code／Unity）で使う Coding Agent の利用イベントを、本人の同意のもとで自動収集する基盤に切り替える。v1 の資産は流用を基本とする。
- 現在の段階：**v2 の要件定義前**。進め方は [devin/README.md](devin/README.md) の Playbook に従う（要件定義 → 設計 → 実装）。

## 必読資料

| 資料 | 内容 |
|---|---|
| [docs/research/research-questions.md](docs/research/research-questions.md) | 研究目的・達成条件・RQ1〜RQ7（**正本**） |
| [docs/research/research-context.md](docs/research/research-context.md) | 方針転換の経緯、想定構成、データ収集方針、製品選定の制約 |
| [docs/research/rq-analysis-draft-v1.md](docs/research/rq-analysis-draft-v1.md) | 旧RQ体系での分析方法案（参考） |
| [docs/requirements.md](docs/requirements.md) | v1 の要件定義書（変更しない） |
| `docs/v2/` | v2 の要件定義・設計（Playbook 01・02 で作成） |

## 絶対に守ること

- 教授の合意と所属機関の倫理・情報管理手続が終わるまで、**実データの収集開始・参加者への配布・本番デプロイをしない**。
- 既定設定で、プロンプト・回答本文、コード、ファイル名、絶対パス、認証情報を参加者の端末外に送信しない。
- 研究用IDと氏名の対応表は研究ログDBと分けて扱う（匿名化ではなく仮名化）。
- 秘密情報（`.env`、APIキー、パスワード、トークン）をコミットしない。
- `main` へ直接 push しない。作業はブランチ → PR で行い、マージは研究者が行う。
- v1 の機能を削除するときは、事前に研究者の承認を得る。

## 開発コマンド

```bash
npm install            # postinstall で prisma generate も実行される
npx prisma migrate dev # マイグレーション作成・適用
npm run db:seed        # 初期管理者と RateLimitConfig を作成
npm run dev            # http://localhost:3000
npx tsc --noEmit       # 型チェック
npm run lint           # Lint
npm run build          # 本番ビルド
```

- ローカルDB：研究者の PC では `docker compose up -d`。Devin 上では `.devin/blueprint.yaml` の knowledge `database` を参照。
- テスト基盤は未整備（v2 実装計画の最初の Issue で整備する）。

## コードの構成と規約

- `src/app/`：App Router（`(auth)`・`(app)`・`(admin)` のルートグループ）、`src/app/api/`：Route Handlers
- `src/actions/`：Server Actions、`src/lib/`：共通処理（DB・セッション・RBAC・レート制限など）、入力検証は zod
- `prisma/schema.prisma`：DBスキーマ。Prisma クライアントは `src/generated/prisma` に生成され、コミットしない
- 参加者の PC で動くコード（Collector など）は Windows／macOS でも動くように書く
- ドキュメント・コミットメッセージ・PR・Issue は日本語で書く

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
