# AGENTS.md — Research-LLM 作業ルール

## プロジェクトの現在地（最初に読む）

- このリポジトリは卒業研究「AIコーディングエージェントと人間の相互作用が、1つの依頼の中でどう展開し、利用期間を通じてどう変化するか」のための開発リポジトリ。
- 研究室メンバーが普段の開発（VS Code／Unity）で使う Coding Agent の利用イベントを、本人の同意のもとで自動収集する基盤（v2）を **ゼロから** 作る。
- 以前の研究室用LLMチャットボット（v1）のコードは削除済み。タグ `v1-chatbot` に残っており、参考にしたいときは `git show v1-chatbot:<パス>` で読める（研究者の指示がない限り復元しない）。
- 現在の段階：**要件定義前**。アプリケーションコードはまだない。進め方は [devin/README.md](devin/README.md) の Playbook に従う（要件定義 → 設計 → 実装）。

## 必読資料

| 資料 | 内容 |
|---|---|
| [docs/research/research-questions.md](docs/research/research-questions.md) | 研究目的・達成条件・RQ1〜RQ7（**正本**） |
| [docs/research/research-context.md](docs/research/research-context.md) | 方針転換の経緯、想定構成、データ収集方針、製品選定の制約 |
| [docs/research/rq-analysis-draft-v1.md](docs/research/rq-analysis-draft-v1.md) | 旧RQ体系での分析方法案（参考） |
| `docs/v2/` | 要件定義・設計（Playbook 01・02 で作成） |

## 絶対に守ること

- 教授の合意と所属機関の倫理・情報管理手続が終わるまで、**実データの収集開始・参加者への配布・本番デプロイをしない**。
- 既定設定で、プロンプト・回答本文、コード、ファイル名、絶対パス、認証情報を参加者の端末外に送信しない。
- 研究用IDと氏名の対応表は研究ログDBと分けて扱う（匿名化ではなく仮名化）。
- 秘密情報（`.env`、APIキー、パスワード、トークン）をコミットしない。
- `main` へ直接 push しない。作業はブランチ → PR で行い、マージは研究者が行う。

## 開発コマンド

- まだない。技術スタックとプロジェクト構成は設計段階（Playbook 02）で決め、決まったらこの節と `.devin/blueprint.yaml` の knowledge（`lint`・`test`・`build`・`database`）を更新する。

## 規約

- 参加者の PC で動くコード（Collector など）は Windows／macOS でも動くように書く
- ドキュメント・コミットメッセージ・PR・Issue は日本語で書く
