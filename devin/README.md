# devin/ — Devin 用 Playbook

Research-LLM v2（AIコーディングエージェント利用ログ収集基盤）を、Devin で **要件定義 → 設計 → 実装** まで進めるための Playbook 置き場。
研究目的・RQの正本は [../00_context/research-questions.md](../00_context/research-questions.md)、開発の前提は [../00_context/research-context.md](../00_context/research-context.md)。

## Playbook 一覧と使う順番

| 順 | ファイル | マクロ | Skill名 | 成果物 |
|---|---|---|---|---|
| 1 | [01_requirements-definition.md](playbooks/01_requirements-definition.md) | `!rllm-req` | `rllm-requirements` | `01_docs/requirements.md` ほか（ドラフトPR） |
| 2 | [02_architecture-design.md](playbooks/02_architecture-design.md) | `!rllm-design` | `rllm-design` | `01_docs/architecture.md`・データモデル・ADR・実装計画・GitHub Issue |
| 3 | [03_feature-implementation.md](playbooks/03_feature-implementation.md) | `!rllm-impl` | `rllm-implement` | Issue 1件ごとの実装PR（Issueの数だけ繰り返す） |

各段階の成果物（PR）を研究者がレビュー・マージしてから、次の段階に進む。

## Devin への登録方法

Devin は 2026-10 に Playbooks から **Skills** へ移行中で、2026-10-24 以降に作成したアカウントには Playbooks 画面がない。どちらの場合でも使えるようにしている。

- **Skills（推奨・新しいアカウントはこちら）**：登録作業は不要。`.devin/skills/` 以下の `SKILL.md` を Devin が自動で読み込む（中身は devin/playbooks/ を参照するだけの薄いラッパー）。
  セッションで `@skills:rllm-requirements` のように呼び出す。
- **Playbooks（従来のアカウント）**：Devin の Settings → Playbooks → Create で、各 md の本文を貼り付け、上表のマクロを設定する。
  セッションの入力欄でマクロ（例：`!rllm-req`）を入力すると添付される。

**正本は devin/playbooks/ の md**。Devin の画面上で Playbook を編集したら、同じ変更をこのフォルダにも反映する（逆も同じ）。

## セッション開始時の指示例

```
@skills:rllm-requirements
Research-LLM v2 の要件定義を始めてください。まず前提資料を読んで理解した内容を報告し、その後ヒアリングの質問をまとめて聞いてください。
```

```
@skills:rllm-implement #12
```

## 関連する設定ファイル

| ファイル | 役割 |
|---|---|
| [../AGENTS.md](../AGENTS.md) | すべてのエージェント（Devin・Claude Code 等）が最初に読む作業ルール |
| [../.devin/blueprint.yaml](../.devin/blueprint.yaml) | Devin の作業環境（Node.js・Python・PostgreSQL・依存関係）の定義 |
| [../.devin/skills/](../.devin/skills/) | Skills 版の入口 |
| [../.github/PULL_REQUEST_TEMPLATE/devin_pr_template.md](../.github/PULL_REQUEST_TEMPLATE/devin_pr_template.md) | Devin が PR を作るときのテンプレート |

## Playbook を改善するとき

Devin が詰まったり、同じ指摘を繰り返したりしたら、チャットで解決した内容を該当 Playbook の Advice and Pointers（禁止したいことは Forbidden Actions）に追記する。
