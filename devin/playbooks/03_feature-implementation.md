# Playbook 03：Issue 単位の実装

- マクロ：`!rllm-impl`
- 使う場面：`docs/v2/implementation-plan.md` で計画された GitHub Issue を1件実装するとき
- 使い方：セッション開始時に対象Issueの番号かURLを伝える（例：`!rllm-impl #12 を実装してください`）
- 前提資料（必ず最初に読む）：`AGENTS.md`、対象Issue、`docs/v2/requirements.md`、`docs/v2/architecture.md`、`docs/v2/data-model.md`、関係するADR

## Overview

指定された Issue を1件だけ実装し、テストと検証が通った Pull Request を作る。
完了の合図は「PRを作成し、CIが通り、PR本文に検証結果を書いた状態で、チャットにPRのURLを報告すること」。

## What's Needed From User

- 実装する Issue の番号またはURL
- Issue の完了条件に曖昧さがある場合の回答
- 外部サービスの認証情報が必要な場合は、Devin の Secrets への登録（チャットに直接貼ってもらわない）
- PR のレビューとマージ

## Procedure

1. 対象Issueと前提資料を読み、完了条件・対応する要件ID・依存Issueを確認する。依存Issueが未完了なら作業を止めてユーザーに報告する。
2. 完了条件が曖昧な場合は、実装を始める前にユーザーに質問する（質問は1回にまとめる）。
3. `main` の最新から `devin/<Issue番号>-<短い英語の説明>` ブランチを作る。
4. 開発環境を準備する。
   - PostgreSQL を起動する（`.devin/blueprint.yaml` の knowledge `database` を参照）
   - `npm install` → `npx prisma migrate dev` → 必要なら `npm run db:seed`
5. 実装する。
   - DBスキーマを変える場合は `prisma/schema.prisma` を変更し、`npx prisma migrate dev --name <説明>` でマイグレーションファイルを生成してコミットする
   - Collector など参加者PCで動くコードは Windows／macOS でも動くように書く（パスは `path` モジュール、改行コードやシェルに依存しない）
   - 収集項目を追加・変更する場合は、`docs/v2/data-model.md` の DR 項目にあるものだけを扱う
6. テストを書く。完了条件ごとに少なくとも1つのテストを用意する。プライバシーに関わる処理（項目の最小化・除外）には、除外すべき値が送信データに含まれないことを確かめるテストを必ず書く。
7. 検証する。次のコマンドがすべて成功することを確認する：
   - `npx tsc --noEmit`
   - `npm run lint`
   - テスト（`.devin/blueprint.yaml` の knowledge `test`、またはM1で整備したコマンド）
   - `npm run build`
   画面を変更した場合は開発サーバーで動作を確認し、スクリーンショットをPRに添付する。
8. 関係するドキュメント（README、`docs/v2/` 以下、`.env.example`）を更新する。新しい環境変数を追加したら `.env.example` にも追記する。
9. コミットして PR を作成する。PR本文はテンプレート（`.github/PULL_REQUEST_TEMPLATE/devin_pr_template.md`）に従い、`Closes #<Issue番号>` を含める。
10. CI の結果を確認し、失敗していれば直す。レビューコメントに対応する。マージはユーザーが行う。
11. 実装中に要件・設計と食い違う点を見つけたら、勝手に設計を変えず、PR本文とチャットで報告する。

## Specifications

- [ ] 対象Issueの完了条件をすべて満たしている（PR本文で1つずつ確認結果を書く）
- [ ] 型チェック・Lint・テスト・ビルドが成功し、CIが通っている
- [ ] DBスキーマ変更にはマイグレーションファイルが含まれている
- [ ] 本文（プロンプト・回答・コード）・ファイル名・絶対パス・認証情報が、既定設定で端末外に送信されない（関係する変更の場合はテストで確認している）
- [ ] 新しい環境変数は `.env.example` に追記されている
- [ ] 1 PR が 1 Issue に対応し、Issue の範囲外の変更を含まない

## Advice and Pointers

- このリポジトリの Next.js（16系）は破壊的変更を含む。Next.js のAPIを使う前に `node_modules/next/dist/docs/` の該当ガイドを読む（`AGENTS.md` 参照）。
- Prisma クライアントは `src/generated/prisma` に生成される（`postinstall` で自動生成）。生成物はコミットしない。
- 既存のコードスタイル（Server Actions は `src/actions/`、共通処理は `src/lib/`、入力検証は zod）に合わせる。
- Collector の Hook 処理は、エラー時も Coding Agent をブロックしないこと（例外を握りつぶしてローカルにエラーログだけ残す、タイムアウトを短くする）。
- 範囲外の改善点を見つけたら、実装せずに PR 本文の「気づいた点」に書く。
- コミットメッセージ・PR・チャットは日本語で書く。

## Forbidden Actions

- `main` ブランチへの直接 push、force push、自分の PR のマージ
- 1つの PR で複数の Issue を実装すること、Issue の範囲外のリファクタリング
- テストを削除・スキップしてCIを通すこと
- 実データの収集開始、参加者への配布、本番環境へのデプロイ
- 秘密情報（APIキー、パスワード、トークン、`.env`）のコミット
- `docs/v2/data-model.md` にない項目の収集、プロンプト・回答本文・コード・ファイル名・絶対パス・認証情報を既定で送信する実装
- v1 機能の削除（Issue で明示的に指示されている場合を除く）
