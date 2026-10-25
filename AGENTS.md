# AGENTS.md — Research-LLM 作業ルール

## プロジェクトの現在地（最初に読む）

- このリポジトリは卒業研究「AIコーディングエージェントと人間の相互作用が、1つの依頼の中でどう展開し、利用期間を通じてどう変化するか」のための開発リポジトリ。
- 研究室メンバーが普段の開発（VS Code／Unity）で使う Coding Agent の利用イベントを、本人の同意のもとで自動収集する基盤を作る。
- 現在の段階：**実装**（要件は [01_docs/requirements.md](01_docs/requirements.md)、運用は [01_docs/operations-guide.md](01_docs/operations-guide.md)）。進め方は下の「開発の進め方」を参照。

## 必読資料

| 資料 | 内容 |
|---|---|
| [00_context/research-questions.md](00_context/research-questions.md) | 研究目的・達成条件・RQ1〜RQ7（**正本**） |
| [00_context/research-context.md](00_context/research-context.md) | 想定構成、データ収集方針、製品選定の制約 |
| [00_context/rq-analysis-draft-v1.md](00_context/rq-analysis-draft-v1.md) | 旧RQ体系での分析方法案（参考） |

## 開発の進め方

- 要件定義・設計・開発の手順は、研究者が Devin と対話しながら決める。エージェントは独断で決めず、論点を整理して研究者に確認する。
- 決まった内容（要件定義書・設計書・手順など）は `01_docs/` に置く。
- 各段階の成果物は PR で出し、研究者がレビュー・マージしてから次の段階に進む。

## フォルダ構成（この置き場所を守る）

| フォルダ | 置くもの |
|---|---|
| `00_context/` | 研究者が用意した前提資料のみ（研究目的・RQ・研究コンテキスト）。エージェントは編集しない |
| `01_docs/` | エージェントや研究者が作成するドキュメント・メモ（要件定義書、設計書、手順、調査結果など） |
| `02_scripts/` | プログラム一式。`server/`（Cloud Run のサーバー・管理画面）、`extension/`（VS Code 拡張）、`deploy/`（デプロイ・配布スクリプト） |
| `.devin/` | Devin の設定（`blueprint.yaml`）。場所は Devin の仕様で固定 |
| `.github/` | PR テンプレート・CI 設定。場所は GitHub の仕様で固定 |

- ルート直下に新しいフォルダやファイルを増やさない。ツールの仕様上ルートに置く必要があるもの（`package.json` など）が出た場合は、`02_scripts/` の中に閉じ込められないか先に検討し、無理な場合は PR で理由を説明する。

## 絶対に守ること

- 教授の合意と所属機関の倫理・情報管理手続が終わるまで、**実データの収集開始・参加者への配布をしない**。GCP への本番デプロイと、テスト用参加者での動作確認は行ってよい。
- 既定設定で、プロンプト・回答本文、コード、ファイル名、絶対パス、認証情報を参加者の端末外に送信しない。
- 研究用IDと氏名の対応表は研究ログDBと分けて扱う（匿名化ではなく仮名化）。
- 秘密情報（`.env`、APIキー、パスワード、トークン）をコミットしない。
- `main` へ直接 push しない。作業はブランチ → PR で行い、マージは研究者が行う。

## 開発コマンド

`02_scripts/server/` と `02_scripts/extension/` のそれぞれで実行する（Node.js 20 以上）。

| 目的 | コマンド |
|---|---|
| 依存関係 | `npm ci` |
| Lint＋型チェック | `npm run lint` |
| テスト | `npm test` |
| ビルド | `npm run build`（拡張の `.vsix` は `npm run package`） |
| サーバーをローカル起動 | `cp .env.example .env && npm run dev`（`server/`。メモリDB・モック応答） |

デプロイは `02_scripts/deploy/deploy.sh`、配布 ZIP は `02_scripts/deploy/build-distribution.sh`（手順は運用手順書）。

## 規約

- 参加者の PC で動くコード（Collector など）は Windows／macOS でも動くように書く
- ドキュメント・コミットメッセージ・PR・Issue は日本語で書く
