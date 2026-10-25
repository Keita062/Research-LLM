# AGENTS.md — Research-LLM 作業ルール

## プロジェクトの現在地（最初に読む）

- このリポジトリは卒業研究「AIコーディングエージェントと人間の相互作用が、1つの依頼の中でどう展開し、利用期間を通じてどう変化するか」のための開発リポジトリ。
- 研究室メンバーが普段の開発（VS Code／Unity）で使う Coding Agent の利用イベントを、本人の同意のもとで自動収集する基盤（v2）を **ゼロから** 作る。
- 以前の研究室用LLMチャットボット（v1）のコードは削除済み。タグ `v1-chatbot` に残っており、参考にしたいときは `git show v1-chatbot:<パス>` で読める（研究者の指示がない限り復元しない）。
- 現在の段階：**要件定義前**。アプリケーションコードはまだない。進め方は下の「開発の進め方」に従う（要件定義 → 設計 → 実装）。

## 必読資料

| 資料 | 内容 |
|---|---|
| [00_context/research-questions.md](00_context/research-questions.md) | 研究目的・達成条件・RQ1〜RQ7（**正本**） |
| [00_context/research-context.md](00_context/research-context.md) | 方針転換の経緯、想定構成、データ収集方針、製品選定の制約 |
| [00_context/rq-analysis-draft-v1.md](00_context/rq-analysis-draft-v1.md) | 旧RQ体系での分析方法案（参考） |
| `01_docs/` | 要件定義・設計（手順書 01・02 で作成） |

## 開発の進め方

各段階の成果物（PR）を研究者がレビュー・マージしてから、次の段階に進む。

| 順 | 段階 | 手順書 | Devin での呼び出し方 |
|---|---|---|---|
| 1 | 要件定義 | [00_context/procedure-01-requirements.md](00_context/procedure-01-requirements.md) | `@skills:rllm-requirements` |
| 2 | 設計・実装計画（Issue化） | [00_context/procedure-02-design.md](00_context/procedure-02-design.md) | `@skills:rllm-design` |
| 3 | Issue 単位の実装（Issueの数だけ繰り返す） | [00_context/procedure-03-implementation.md](00_context/procedure-03-implementation.md) | `@skills:rllm-implement #<Issue番号>` |

- `.devin/skills/` の SKILL.md は、対応する手順書を読ませるための入口。手順の中身は手順書側にだけ書く。

## フォルダ構成（この置き場所を守る）

| フォルダ | 置くもの |
|---|---|
| `00_context/` | 研究者が用意した前提資料のみ（研究目的・RQ・研究コンテキスト・開発の手順書）。エージェントは編集しない |
| `01_docs/` | エージェントや研究者が作成するドキュメント・メモ（要件定義書、設計書、ADR は `01_docs/adr/`、調査結果、実装計画など） |
| `02_scripts/` | プログラム一式（Collector・サーバー・分析スクリプト・spike など）。中のサブフォルダ構成は設計段階で決める |
| `.devin/` | Devin の設定（`blueprint.yaml`、`skills/`）。場所は Devin の仕様で固定 |
| `.github/` | PR テンプレート・CI 設定。場所は GitHub の仕様で固定 |

- ルート直下に新しいフォルダやファイルを増やさない。ツールの仕様上ルートに置く必要があるもの（`package.json` など）が出た場合は、`02_scripts/` の中に閉じ込められないか先に検討し、無理な場合は PR で理由を説明する。

## 絶対に守ること

- 教授の合意と所属機関の倫理・情報管理手続が終わるまで、**実データの収集開始・参加者への配布・本番デプロイをしない**。
- 既定設定で、プロンプト・回答本文、コード、ファイル名、絶対パス、認証情報を参加者の端末外に送信しない。
- 研究用IDと氏名の対応表は研究ログDBと分けて扱う（匿名化ではなく仮名化）。
- 秘密情報（`.env`、APIキー、パスワード、トークン）をコミットしない。
- `main` へ直接 push しない。作業はブランチ → PR で行い、マージは研究者が行う。

## 開発コマンド

- まだない。技術スタックとプロジェクト構成は設計段階（手順書 02）で決め、決まったらこの節と `.devin/blueprint.yaml` の knowledge（`lint`・`test`・`build`・`database`）を更新する。

## 規約

- 参加者の PC で動くコード（Collector など）は Windows／macOS でも動くように書く
- ドキュメント・コミットメッセージ・PR・Issue は日本語で書く
